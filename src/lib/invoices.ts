import { prisma } from '@/lib/prisma';
import { generateRebookToken } from '@/lib/reference';
import { nextPosition } from '@/lib/board';
import { DEFAULT_VAT_BPS, lineAmountPence, totalsFor } from '@/lib/estimates';
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
  | { ok: false; reason: 'not_ready' | 'nothing_to_bill' };

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
 * snapshotted into InvoiceLine at the moment of issue. Editing the job
 * afterwards -- which happens, because lines are the trade's working list --
 * must not change what was billed.
 *
 * Claim first, as everywhere else: the card is moved out of Done -- to
 * invoice with the column in the WHERE, and only if that matched one row does
 * anything else happen. A double-tap issues one invoice, not two numbers.
 */
export async function issueInvoice(jobId: string): Promise<IssueResult> {
  const op = await prisma.operator.findFirst({ select: { id: true, vatRegistered: true } });
  if (!op) throw new Error('No business row. Run `npm run seed`.');

  const job = await prisma.booking.findUnique({
    where: { id: jobId },
    include: {
      lineItems: { where: { done: true }, orderBy: { sortOrder: 'asc' } },
      variations: { where: { status: 'approved' }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!job) return { ok: false, reason: 'not_ready' };

  const vatBps = op.vatRegistered ? DEFAULT_VAT_BPS : 0;

  // What actually gets billed: work ticked off, plus extra work the owner said
  // yes to. A line nobody ticked is not billed; a variation nobody approved is
  // not billed -- that is the entire point of recording the approval.
  const lines = [
    ...job.lineItems.map((l) => ({
      description: l.description,
      qty: l.qty,
      unitPricePence: l.unitPricePence,
      amountPence: l.amountPence,
      vatRateBps: op.vatRegistered ? l.vatRateBps || DEFAULT_VAT_BPS : 0,
    })),
    ...job.variations.map((v) => ({
      description: `${v.description} (agreed extra work)`,
      qty: 1,
      unitPricePence: v.estimatePence,
      amountPence: lineAmountPence(1, v.estimatePence),
      vatRateBps: vatBps,
    })),
  ];
  if (lines.length === 0) return { ok: false, reason: 'nothing_to_bill' };

  const totals = totalsFor(lines, op.vatRegistered);
  const issuedOn = todayInLondon();

  const result = await prisma.$transaction(async (tx) => {
    // Claim the card. Zero rows means it has already been invoiced.
    const claimed = await tx.booking.updateMany({
      where: { id: jobId, column: 'done_to_invoice' },
      data: {
        column: 'invoiced',
        columnChangedAt: new Date(),
        position: await nextPosition('invoiced', tx),
      },
    });
    if (claimed.count === 0) return null;

    // Take the next number. Incremented, not read-then-written.
    const counter = await tx.operator.update({
      where: { id: op.id },
      data: { nextInvoiceNumber: { increment: 1 } },
      select: { nextInvoiceNumber: true, invoicePrefix: true, paymentTermsDays: true },
    });
    const number = formatInvoiceNumber(counter.invoicePrefix, counter.nextInvoiceNumber - 1);

    const invoice = await tx.invoice.create({
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
        lines: {
          create: lines.map((l, i) => ({ ...l, sortOrder: i })),
        },
      },
      select: { id: true, number: true },
    });

    return invoice;
  });

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
