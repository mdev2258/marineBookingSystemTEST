import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateRebookToken } from '@/lib/reference';
import { nextPosition } from '@/lib/board';
import { currentVatBps, DEFAULT_VAT_BPS, totalsFor } from '@/lib/estimates';
import { MAX_PENCE } from '@/lib/money';
import { addDays, daysBetween, todayInLondon, type LondonDate } from '@/lib/time';

/**
 * INVOICES. ANALYSIS-TRADES.md §7 F6.
 *
 * Not an accounts package (§3.8): simple numbered invoices and a CSV for the
 * accountant. No Xero, no ledger, no credit notes. The two rules that matter
 * are below, and both are accounting rules rather than preferences.
 */

/** "HMS-0007". Zero-padded so the CSV sorts the way an accountant expects. */
export function formatInvoiceNumber(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/**
 * Days since it was due. Negative while it is still inside its terms.
 * The board card shows this, because "19 days" is the number that makes a
 * trade pick up the phone and "£1,240" alone is not.
 */
export function daysOverdue(invoice: { dueOn: LondonDate }, today: LondonDate = todayInLondon()): number {
  return daysBetween(invoice.dueOn, today);
}

/** Days since it went out, which is what "outstanding" means on the card. */
export function daysOutstanding(
  invoice: { issuedOn: LondonDate },
  today: LondonDate = todayInLondon(),
): number {
  return daysBetween(invoice.issuedOn, today);
}

export type IssueResult =
  | { ok: true; invoiceId: string; number: string }
  | { ok: false; reason: IssueFailure };

type IssueFailure = 'not_ready' | 'nothing_to_bill' | 'already_invoiced' | 'too_big';

/** Thrown inside the issue transaction so the claim rolls back with it. */
class InvoiceRefused extends Error {
  constructor(readonly reason: IssueFailure) {
    super(reason);
  }
}

export type InvoiceLineDraft = {
  kind: string | null;
  description: string;
  qty: number;
  unitPricePence: number;
  amountPence: number;
  vatRateBps: number;
};

/**
 * What an invoice bills, and at what VAT rate. Pure, so the rule is checked
 * (scripts/check-seed.ts) rather than trusted.
 *
 * The rule (estimates.ts > currentVatBps): the invoice bills exactly what was
 * AGREED. A done line that was on the estimate the owner was shown carries the
 * rate frozen on that EstimateLine. A line never estimated -- added after, or
 * on a job that was never estimated -- takes today's registration, because
 * today is the first time the owner sees its price.
 *
 * An old estimate with no EstimateLine rows only has its VAT total to go on:
 * if it carried VAT, it was sent while registered.
 *
 * A business that is not registered cannot charge VAT, whatever was agreed.
 */
// ponytail: variations take registration NOW, not "at raise" -- exact until the business registers mid-job; a Variation.vatRateBps column would freeze it.
export function invoiceLinesFor(input: {
  vatRegistered: boolean;
  doneLines: { kind: string; description: string; qty: number; unitPricePence: number; amountPence: number }[];
  agreed: { vatPence: number; lines: { description: string; vatRateBps: number }[] } | null;
  approvedVariations: { description: string; estimatePence: number }[];
}): InvoiceLineDraft[] {
  const now = currentVatBps(input.vatRegistered);
  const rateFor = (description: string): number => {
    if (!input.vatRegistered || !input.agreed) return now;
    if (input.agreed.lines.length === 0) return input.agreed.vatPence > 0 ? DEFAULT_VAT_BPS : 0;
    return input.agreed.lines.find((l) => l.description === description)?.vatRateBps ?? now;
  };

  return [
    ...input.doneLines.map((l) => ({
      kind: l.kind,
      description: l.description,
      qty: l.qty,
      unitPricePence: l.unitPricePence,
      amountPence: l.amountPence,
      vatRateBps: rateFor(l.description),
    })),
    ...input.approvedVariations.map((v) => ({
      kind: null,
      description: `${v.description} (agreed extra work)`,
      qty: 1,
      unitPricePence: v.estimatePence,
      amountPence: v.estimatePence,
      vatRateBps: now,
    })),
  ];
}

/** Who the invoice is from, as printed. Snapshotted onto Invoice.sellerText at issue. */
export type Seller = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string;
  vatNumber: string | null;
  bankDetailsText: string | null;
};

type SellerSource = {
  name: string;
  address: string | null;
  phone: string | null;
  contactEmail: string;
  vatRegistered: boolean;
  vatNumber: string | null;
  bankDetailsText: string | null;
};

export function sellerFrom(op: SellerSource): Seller {
  return {
    name: op.name,
    address: op.address,
    phone: op.phone,
    email: op.contactEmail,
    vatNumber: op.vatRegistered ? op.vatNumber : null,
    bankDetailsText: op.bankDetailsText,
  };
}

/**
 * The seller as they were when this invoice was issued. Invoices issued before
 * the snapshot existed fall back to the business as it is now.
 */
export function invoiceSeller(invoice: { sellerText: string | null }, live: SellerSource): Seller {
  if (invoice.sellerText) {
    try {
      return JSON.parse(invoice.sellerText) as Seller;
    } catch {
      // Unreadable snapshot: the live business is the best there is.
    }
  }
  return sellerFrom(live);
}

/**
 * Issue an invoice for a finished job.
 *
 * RULE 1 -- AN INVOICE NUMBER IS NEVER REUSED, not even after a void. The
 * number is taken by incrementing Operator.nextInvoiceNumber INSIDE the same
 * transaction that creates the invoice. On Postgres that UPDATE holds a row
 * lock until commit, so two invoices issued at the same instant queue for the
 * counter rather than reading the same value. A void leaves the counter alone,
 * so its number is burned for good; `Invoice.number` is @unique as a backstop,
 * which turns any mistake into a loud failure instead of a silent duplicate.
 *
 * RULE 2 -- THE LINES ARE A COPY. Done lines and approved variations are
 * snapshotted into InvoiceLine at the moment of issue, and so are who it is
 * from and to (sellerText, customerName). Editing the job or the business
 * afterwards must not change what was billed.
 *
 * RULE 3 -- ONE LIVE INVOICE PER JOB. A job with a sent or paid invoice is
 * never billed again; only a void frees it.
 *
 * Claim first, as everywhere else: the card is moved out of Done -- to
 * invoice with the column AND "no sent or paid invoice" in the WHERE, and only
 * if that matched one row does anything else happen. A double-tap issues one
 * invoice, not two numbers.
 */
export async function issueInvoice(jobId: string): Promise<IssueResult> {
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error('No business row. Run `npm run seed`.');

  const loadJob = (db: Prisma.TransactionClient) =>
    db.booking.findUnique({
      where: { id: jobId },
      include: {
        customer: { select: { name: true } },
        lineItems: { where: { done: true }, orderBy: { sortOrder: 'asc' } },
        variations: { where: { status: 'approved' }, orderBy: { createdAt: 'asc' } },
        invoices: { where: { status: { in: ['sent', 'paid'] } }, select: { id: true } },
        // What the owner was shown: the accepted estimate, else the one still out.
        estimates: {
          where: { status: { in: ['accepted', 'sent'] } },
          orderBy: { createdAt: 'desc' },
          include: { lines: { select: { description: true, vatRateBps: true } } },
        },
      },
    });
  // What actually gets billed: work ticked off, plus extra work the owner said
  // yes to. A line nobody ticked is not billed; a variation nobody approved is
  // not billed -- that is the entire point of recording the approval.
  const bill = (job: NonNullable<Awaited<ReturnType<typeof loadJob>>>) => {
    const agreed = job.estimates.find((e) => e.status === 'accepted') ?? job.estimates[0] ?? null;
    const lines = invoiceLinesFor({
      vatRegistered: op.vatRegistered,
      doneLines: job.lineItems,
      agreed,
      approvedVariations: job.variations,
    });
    const totals = totalsFor(lines, op.vatRegistered);
    // Postgres Int. Each line is capped on save; the SUM is not.
    const refused: IssueFailure | null =
      lines.length === 0 ? 'nothing_to_bill' : totals.gross > MAX_PENCE ? 'too_big' : null;
    return { lines, totals, refused };
  };

  // A cheap early answer for the common refusals, before claiming anything.
  const preview = await loadJob(prisma);
  if (!preview) return { ok: false, reason: 'not_ready' };
  if (preview.invoices.length > 0) return { ok: false, reason: 'already_invoiced' };
  const early = bill(preview).refused;
  if (early) return { ok: false, reason: early };

  const issuedOn = todayInLondon();

  let result: { id: string; number: string } | null;
  try {
    result = await prisma.$transaction(async (tx) => {
      // Claim the card. Zero rows means it has already been invoiced.
      const claimed = await tx.booking.updateMany({
        where: {
          id: jobId,
          column: 'done_to_invoice',
          invoices: { none: { status: { in: ['sent', 'paid'] } } },
        },
        data: {
          column: 'invoiced',
          columnChangedAt: new Date(),
          position: await nextPosition('invoiced', tx),
        },
      });
      if (claimed.count === 0) return null;

      // Close everything still out with the owner BEFORE reading what to bill.
      // An approval that committed first is read below and billed; one that
      // arrives after finds its row withdrawn and is told so. Nothing can be
      // agreed in the gap and then left off the invoice.
      await tx.variation.updateMany({
        where: { bookingId: jobId, status: 'awaiting_owner' },
        data: { status: 'withdrawn', decidedAt: new Date(), token: null },
      });
      const job = await loadJob(tx);
      if (!job) return null;
      // An estimate still out would let the owner "accept" a job already
      // billed. Its rates were read above, so it can go now.
      await tx.estimate.updateMany({
        where: { bookingId: jobId, status: 'sent' },
        data: { status: 'superseded', token: null },
      });

      const { lines, totals, refused } = bill(job);
      if (refused) throw new InvoiceRefused(refused); // rolls the claim back

      // Take the next number. Incremented, not read-then-written.
      const counter = await tx.operator.update({
        where: { id: op.id },
        data: { nextInvoiceNumber: { increment: 1 } },
        select: { nextInvoiceNumber: true, invoicePrefix: true, paymentTermsDays: true },
      });
      const number = formatInvoiceNumber(counter.invoicePrefix, counter.nextInvoiceNumber - 1);

      return tx.invoice.create({
        data: {
          operatorId: op.id,
          bookingId: jobId,
          number,
          issuedOn,
          dueOn: addDays(issuedOn, counter.paymentTermsDays),
          totalPence: totals.gross,
          vatPence: totals.vat ?? 0,
          status: 'sent',
          token: generateRebookToken(),
          sellerText: JSON.stringify(sellerFrom(op)),
          customerName: job.customer?.name ?? null,
          lines: {
            create: lines.map((l, i) => ({ ...l, sortOrder: i })),
          },
        },
        select: { id: true, number: true },
      });
    });
  } catch (e) {
    if (e instanceof InvoiceRefused) return { ok: false, reason: e.reason };
    throw e;
  }

  if (!result) return { ok: false, reason: 'not_ready' };
  return { ok: true, invoiceId: result.id, number: result.number };
}

/**
 * Void an invoice that went out wrong.
 *
 * The number is NOT given back -- nextInvoiceNumber is not touched -- and the
 * voided row stays, readable, for ever. The card goes back to Done so the
 * trade can correct it and issue again, which takes the NEXT number. A paid
 * invoice cannot be voided here: that is a refund, and refunds belong to the
 * payments specialist.
 */
export async function voidInvoice(invoiceId: string): Promise<boolean> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { bookingId: true },
  });
  if (!invoice) return false;

  const { count } = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: { in: ['draft', 'sent'] } },
    data: { status: 'void' },
  });
  if (count === 0) return false;

  await prisma.booking.updateMany({
    where: { id: invoice.bookingId, column: 'invoiced' },
    data: {
      column: 'done_to_invoice',
      columnChangedAt: new Date(),
      position: await nextPosition('done_to_invoice'),
    },
  });
  return true;
}
