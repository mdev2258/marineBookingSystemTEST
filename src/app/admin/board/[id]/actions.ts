'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { isDecidedVia, isPostponeReason, LINE_KIND, type LineKind } from '@/lib/enums';
import { generateRebookToken } from '@/lib/reference';
import {
  bookAcceptedEstimate,
  isId,
  isLondonDate,
  nextPosition,
  releaseEstimateSentCard,
} from '@/lib/board';
import { currentVatBps, lineAmountPence, parseQty, totalsFor, workingTotals } from '@/lib/estimates';
import { formatPence, MAX_PENCE, poundsToPence } from '@/lib/money';
import type { SendEmailResult } from '@/lib/email';
import {
  sendEstimateEmail,
  sendInvoiceEmail,
  sendVariationEmail,
  sendVisitPostponedEmail,
} from '@/lib/notifications';
import { issueInvoice, voidInvoice } from '@/lib/invoices';
import { markInvoicePaid } from '@/lib/payments';
import { londonDateTimeToUtc, todayInLondon } from '@/lib/time';

async function business() {
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error('No business row. Run `npm run seed`.');
  return op;
}

function isLineKind(v: string): v is LineKind {
  return (LINE_KIND as readonly string[]).includes(v);
}

/** Columns a job never leaves by hand, and never gets new paperwork in. */
const LOCKED_COLUMNS = ['invoiced', 'paid'];

/**
 * What the flash on the job page says about the email: sent, failed, or --
 * the one that matters -- never sent because the job has no owner email.
 * Saying "Owner emailed" when nothing went is the screen lying to the trade.
 */
function emailFlag(result: SendEmailResult | null): '1' | 'none' | 'failed' {
  return !result ? 'none' : result.ok ? '1' : 'failed';
}

/**
 * The hidden per-render nonce on the create forms (raise variation, order a
 * part, plan a visit). It is written to a @unique column, so the same form
 * submitted twice collides in the database instead of creating two rows and
 * sending two emails. A missing or odd-looking one just means no guard.
 */
function readNonce(formData: FormData): string | null {
  const v = formData.get('formNonce');
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

function isDuplicateNonce(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    String(e.meta?.target ?? '').includes('formNonce')
  );
}

/** A line as the trade typed it, so a refused save hands it back rather than losing it. */
export type DraftRow = { kind: string; description: string; qty: string; unitPrice: string; done: boolean };
export type LinesState = { error: string; rows: DraftRow[] } | null;

/** Enough for any real job; a 2,000-line save held the DB connection for 31 s. */
const MAX_LINES = 200;

/**
 * Replace the job's working line list from the form.
 *
 * Lines live on the JOB, not on an Estimate: they are the list the trade ticks
 * off as work gets done. An Estimate copies them onto EstimateLine at the
 * moment it is sent, which is why editing lines afterwards cannot change what
 * was sent.
 *
 * Rows arrive as parallel arrays from the form. A row with no description is
 * dropped rather than rejected -- an empty last row is how people leave a
 * form, not an error worth stopping a save for.
 *
 * A refused save RETURNS what was typed (useActionState), and says which row:
 * one bad price must not throw away twenty lines typed on a phone.
 */
export async function saveLines(
  jobId: string,
  _prev: LinesState,
  formData: FormData,
): Promise<LinesState> {
  await requireAdmin();
  if (!isId(jobId)) throw new Error('Bad request.');
  const op = await business();

  const kinds = formData.getAll('kind').map(String);
  const descriptions = formData.getAll('description').map(String);
  const qtys = formData.getAll('qty').map(String);
  const prices = formData.getAll('unitPrice').map(String);
  const dones = new Set(formData.getAll('done').map(String));

  const typed: DraftRow[] = descriptions
    .map((description, i) => ({
      kind: kinds[i] ?? 'labour',
      description,
      qty: qtys[i] ?? '',
      unitPrice: prices[i] ?? '',
      done: dones.has(String(i)),
    }))
    .filter((r) => r.description.trim());
  const refuse = (error: string): LinesState => ({ error: `${error} Nothing was saved.`, rows: typed });

  const rows: {
    kind: string;
    description: string;
    qty: number;
    unitPricePence: number;
    amountPence: number;
    vatRateBps: number;
    done: boolean;
    sortOrder: number;
  }[] = [];

  if (typed.length > MAX_LINES) {
    return refuse(`That is ${typed.length} lines; the most one job takes is ${MAX_LINES}.`);
  }

  for (const [i, r] of typed.entries()) {
    const description = r.description.trim();
    const which = `Row ${i + 1} (“${description.length > 30 ? `${description.slice(0, 29)}…` : description}”)`;

    // Refused, not guessed: "1,20" silently becoming £0 is a wrong estimate.
    // A blank price is a line not priced yet, and stays £0 as before.
    const qty = parseQty(r.qty);
    if (qty == null) return refuse(`${which}: the quantity couldn’t be read — use a number like 2.5.`);
    const unitPricePence = r.unitPrice.trim() ? poundsToPence(r.unitPrice) : 0;
    if (unitPricePence == null) {
      return refuse(`${which}: the price couldn’t be read — use a number like 55 or 1,200.`);
    }
    const amountPence = lineAmountPence(qty, unitPricePence);
    if (amountPence > MAX_PENCE) return refuse(`${which}: that line comes to more than ${formatPence(MAX_PENCE)}.`);

    rows.push({
      kind: isLineKind(r.kind) ? r.kind : 'labour',
      description,
      qty,
      unitPricePence,
      amountPence,
      // Stored for the record only. The rate that reaches an owner is decided
      // when a price is shown to them -- see currentVatBps.
      vatRateBps: currentVatBps(op.vatRegistered),
      done: r.done,
      sortOrder: rows.length,
    });
  }

  // Each line is capped above; the SUM is what overflows the Int column when
  // it is sent or invoiced, so it is refused here, while the typing is still
  // on screen.
  const gross = workingTotals(rows, op.vatRegistered).gross;
  if (gross > MAX_PENCE) return refuse(`The total comes to more than ${formatPence(MAX_PENCE)}.`);

  // An estimate that is out was priced at its own total. If this edit changes
  // the money, it is superseded in the same transaction and the trade sends a
  // new one; the owner's copy (EstimateLine) is frozen either way.
  const [withdrawn] = await prisma.$transaction([
    prisma.estimate.updateMany({
      where: { bookingId: jobId, status: 'sent', totalPence: { not: gross } },
      data: { status: 'superseded', token: null },
    }),
    prisma.quoteLineItem.deleteMany({ where: { bookingId: jobId } }),
    prisma.quoteLineItem.createMany({ data: rows.map((r) => ({ bookingId: jobId, ...r })) }),
  ]);
  // Nothing out with the owner any more, so the card stops saying there is.
  if (withdrawn.count) await releaseEstimateSentCard(jobId);

  revalidatePath(`/admin/board/${jobId}/estimate`);
  revalidatePath(`/admin/board/${jobId}`);
  revalidatePath('/admin/board');
  redirect(`/admin/board/${jobId}/estimate?saved=${withdrawn.count ? 'withdrawn' : '1'}`);
}

/**
 * Send the estimate.
 *
 * Re-estimating SUPERSEDES rather than edits, so what the owner agreed to is
 * still readable after the price changes. The lines are copied onto
 * EstimateLine with the VAT rate of this moment, so what the owner was shown
 * is frozen -- and it is what the invoice later bills.
 *
 * CLAIMED: the form carries the quotedAt it was rendered with, and that value
 * is in the WHERE of the first write. The first submit moves quotedAt on, so a
 * double-submit or a stale second tab matches zero rows and sends nothing.
 *
 * The card moves only from a column that was waiting on a price -- Jotted,
 * Enquiry, or Estimate sent itself. Re-pricing a job that is On it must not
 * drag it back up the board.
 *
 * The email goes out AFTER the transaction commits. A rollback cannot unsend a
 * message, so nothing that reaches a customer happens inside one.
 */
export async function sendEstimate(jobId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isId(jobId)) throw new Error('Bad request.');
  const op = await business();

  const notes = String(formData.get('notes') ?? '').trim().slice(0, 1000);
  const rawSeen = formData.get('seen');
  const seen = typeof rawSeen === 'string' && rawSeen ? new Date(rawSeen) : null;
  if (seen && Number.isNaN(seen.getTime())) throw new Error('Bad request.');

  const job = await prisma.booking.findUnique({
    where: { id: jobId },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!job) redirect('/admin/board');
  if (LOCKED_COLUMNS.includes(job.column)) redirect(`/admin/board/${jobId}/estimate?error=locked`);
  if (job.lineItems.length === 0) redirect(`/admin/board/${jobId}/estimate?error=empty`);

  const vatRateBps = currentVatBps(op.vatRegistered);
  const lines = job.lineItems.map((l) => ({
    kind: l.kind,
    description: l.description,
    qty: l.qty,
    unitPricePence: l.unitPricePence,
    amountPence: l.amountPence,
    vatRateBps,
    sortOrder: l.sortOrder,
  }));
  const totals = totalsFor(lines, op.vatRegistered);
  if (totals.gross > MAX_PENCE) redirect(`/admin/board/${jobId}/estimate?error=total`);
  const token = generateRebookToken();
  const now = new Date();

  const estimateId = await prisma.$transaction(async (tx) => {
    const claimed = await tx.booking.updateMany({
      where: { id: jobId, quotedAt: seen, column: { notIn: LOCKED_COLUMNS } },
      data: { quotedPence: totals.gross, quotedAt: now, quoteNotes: notes || null },
    });
    if (claimed.count === 0) return null;

    // Anything still out is now out of date.
    await tx.estimate.updateMany({
      where: { bookingId: jobId, status: 'sent' },
      data: { status: 'superseded', token: null },
    });

    const created = await tx.estimate.create({
      data: {
        bookingId: jobId,
        status: 'sent',
        totalPence: totals.gross,
        vatPence: totals.vat ?? 0,
        notes: notes || null,
        sentAt: now,
        token,
        lines: { create: lines },
      },
      select: { id: true },
    });

    await tx.booking.updateMany({
      where: { id: jobId, column: { in: ['jotted', 'enquiry', 'estimate_sent'] } },
      data: {
        column: 'estimate_sent',
        columnChangedAt: now,
        position: await nextPosition('estimate_sent', tx),
        waitingReason: null,
        waitingUntil: null,
      },
    });

    return created.id;
  });
  // Already sent by the first of a double-submit: land where it landed.
  if (!estimateId) redirect(`/admin/board/${jobId}`);

  // Committed. Now, and only now, tell the owner.
  const sent = await sendEstimateEmail(estimateId);

  revalidatePath('/admin/board');
  redirect(`/admin/board/${jobId}?sent=${emailFlag(sent)}`);
}

/**
 * "Agreed by phone" -- and by text, or leaning on the pushpit.
 *
 * This is a first-class path, not a fallback (§3.5). The app records what
 * actually happened; it never forces an owner online to make the record
 * tidy. Every decision stores HOW it was made, which is the evidence trail
 * that stops the argument in March. 'link' is not one of the choices here:
 * only the owner's own link can record that.
 */
export async function recordEstimateDecision(
  estimateId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  if (!isId(estimateId)) throw new Error('Bad request.');

  const accepted = String(formData.get('decision') ?? '') === 'accepted';
  const rawVia = String(formData.get('decidedVia') ?? 'phone');
  const via = isDecidedVia(rawVia) && rawVia !== 'link' ? rawVia : 'phone';
  const note = String(formData.get('decisionNote') ?? '').trim().slice(0, 500);

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: { bookingId: true, totalPence: true },
  });
  if (!estimate) redirect('/admin/board');

  // Status is in the WHERE and is changed by the same statement, so a double
  // submit matches zero rows. Never check-then-write.
  const { count } = await prisma.estimate.updateMany({
    where: { id: estimateId, status: 'sent' },
    data: {
      status: accepted ? 'accepted' : 'declined',
      decidedAt: new Date(),
      decidedVia: via,
      decisionNote: note || null,
      token: null,
    },
  });

  if (count === 1 && accepted) await bookAcceptedEstimate(estimate.bookingId, estimate.totalPence);
  if (count === 1 && !accepted) await releaseEstimateSentCard(estimate.bookingId);

  revalidatePath('/admin/board');
  redirect(`/admin/board/${estimate.bookingId}`);
}

/**
 * Raise a variation: what was found, why it matters, what it costs.
 *
 * Three fields, because it is typed one-handed in an engine bay with the
 * thing still in shot. Anything longer gets written on a hand instead and
 * argued about in March.
 *
 * Not on an invoiced or paid job: it could never be billed, and the owner
 * would be told it would be. The job row is claimed with that rule in the
 * WHERE -- issueInvoice claims the same row, so the two cannot interleave.
 */
export async function raiseVariation(jobId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isId(jobId)) throw new Error('Bad request.');

  const description = String(formData.get('description') ?? '').trim().slice(0, 300);
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 500);
  const estimatePence = poundsToPence(String(formData.get('amount') ?? ''));
  const formNonce = readNonce(formData);

  // £0 is not extra work worth asking an owner about.
  if (!description || !estimatePence) {
    redirect(`/admin/board/${jobId}?error=variation#variation`);
  }

  let variationId: string | null;
  try {
    variationId = await prisma.$transaction(async (tx) => {
      const open = await tx.booking.updateMany({
        where: { id: jobId, column: { notIn: LOCKED_COLUMNS } },
        data: { updatedAt: new Date() },
      });
      if (open.count === 0) return null;

      const created = await tx.variation.create({
        data: {
          bookingId: jobId,
          description,
          reason: reason || null,
          estimatePence,
          status: 'awaiting_owner',
          token: generateRebookToken(),
          formNonce,
        },
        select: { id: true },
      });
      return created.id;
    });
  } catch (e) {
    // The same form twice: the first one raised it and emailed. Done.
    if (isDuplicateNonce(e)) redirect(`/admin/board/${jobId}#variation`);
    throw e;
  }
  if (!variationId) redirect(`/admin/board/${jobId}?error=variation_locked#variation`);

  const sent = await sendVariationEmail(variationId);

  revalidatePath('/admin/board');
  revalidatePath(`/admin/board/${jobId}`);
  redirect(`/admin/board/${jobId}?raised=${emailFlag(sent)}#variation`);
}

/** The same "agreed by phone" path, for extra work. */
export async function recordVariationDecision(
  variationId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  if (!isId(variationId)) throw new Error('Bad request.');

  const decision = String(formData.get('decision') ?? '');
  const rawVia = String(formData.get('decidedVia') ?? 'phone');
  const via = isDecidedVia(rawVia) && rawVia !== 'link' ? rawVia : 'phone';
  const note = String(formData.get('decisionNote') ?? '').trim().slice(0, 500);

  const status =
    decision === 'approved' ? 'approved' : decision === 'withdrawn' ? 'withdrawn' : 'declined';

  const variation = await prisma.variation.findUnique({
    where: { id: variationId },
    select: { bookingId: true },
  });
  if (!variation) redirect('/admin/board');

  await prisma.variation.updateMany({
    where: {
      id: variationId,
      status: 'awaiting_owner',
      // An approval after invoicing could never be billed.
      ...(status === 'approved' ? { booking: { column: { notIn: LOCKED_COLUMNS } } } : {}),
    },
    data: {
      status,
      decidedAt: new Date(),
      // A withdrawal is the trade's own doing, so it records no owner decision.
      decidedVia: status === 'withdrawn' ? null : via,
      decisionNote: note || null,
      token: null,
    },
  });

  revalidatePath('/admin/board');
  redirect(`/admin/board/${variation.bookingId}`);
}

// ---------------------------------------------------------------------------
// F4 — waiting on other people
// ---------------------------------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A part on order. The ETA is the useful field: it is what turns "waiting on
 * parts" from a shrug into a date the card can be held to.
 */
export async function addPartOrder(jobId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isId(jobId)) throw new Error('Bad request.');

  const item = String(formData.get('item') ?? '').trim().slice(0, 200);
  if (!item) redirect(`/admin/board/${jobId}?error=part#parts`);

  const supplier = String(formData.get('supplier') ?? '').trim().slice(0, 120);
  const etaOn = String(formData.get('etaOn') ?? '').trim();
  const cost = poundsToPence(String(formData.get('cost') ?? ''));

  try {
    await prisma.partOrder.create({
      data: {
        bookingId: jobId,
        item,
        supplier: supplier || null,
        orderedOn: todayInLondon(),
        etaOn: isLondonDate(etaOn) ? etaOn : null,
        costPence: cost,
        formNonce: readNonce(formData),
      },
    });
  } catch (e) {
    if (!isDuplicateNonce(e)) throw e;
  }

  revalidatePath(`/admin/board/${jobId}`);
  redirect(`/admin/board/${jobId}#parts`);
}

/**
 * Tick a part in.
 *
 * `arrivedOn` in the WHERE keeps this safely repeatable -- a double tap on a
 * cold phone matches zero rows the second time rather than rewriting the date.
 */
export async function markPartArrived(partId: string, jobId: string): Promise<void> {
  await requireAdmin();
  if (!isId(partId) || !isId(jobId)) throw new Error('Bad request.');

  await prisma.partOrder.updateMany({
    where: { id: partId, arrivedOn: null },
    data: { arrivedOn: todayInLondon() },
  });

  revalidatePath(`/admin/board/${jobId}`);
  redirect(`/admin/board/${jobId}#parts`);
}

/**
 * Put a day in the diary for this job.
 *
 * A day in the diary makes the card Booked only if the owner has agreed a
 * price. A visit to look at the boat before pricing it is still an enquiry;
 * calling it booked would tell the owner page something nobody agreed to.
 */
export async function planVisit(jobId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isId(jobId)) throw new Error('Bad request.');

  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim() || '09:00';
  const placeId = String(formData.get('placeId') ?? '').trim();

  if (!isLondonDate(date) || !TIME_RE.test(time)) {
    redirect(`/admin/board/${jobId}?error=visit#visits`);
  }

  const job = await prisma.booking.findUnique({
    where: { id: jobId },
    select: { placeId: true },
  });

  try {
    await prisma.visit.create({
      data: {
        bookingId: jobId,
        placeId: placeId || job?.placeId || null,
        startsAt: londonDateTimeToUtc(date, time),
        status: 'planned',
        formNonce: readNonce(formData),
      },
    });
  } catch (e) {
    if (isDuplicateNonce(e)) redirect(`/admin/board/${jobId}#visits`);
    throw e;
  }

  await prisma.booking.updateMany({
    where: {
      id: jobId,
      column: { in: ['enquiry', 'estimate_sent'] },
      estimates: { some: { status: 'accepted' } },
    },
    data: { column: 'booked', columnChangedAt: new Date(), position: await nextPosition('booked') },
  });
  await prisma.booking.update({ where: { id: jobId }, data: { plannedOn: date } });

  revalidatePath('/admin/board');
  redirect(`/admin/board/${jobId}#visits`);
}

/** Work happened. */
export async function markVisitDone(visitId: string, jobId: string): Promise<void> {
  await requireAdmin();
  if (!isId(visitId) || !isId(jobId)) throw new Error('Bad request.');

  await prisma.visit.updateMany({
    where: { id: visitId, status: 'planned' },
    data: { status: 'done' },
  });

  revalidatePath(`/admin/board/${jobId}`);
  redirect(`/admin/board/${jobId}#visits`);
}

/**
 * POSTPONE A VISIT. The repointed cancel/rebook machinery, and the single most
 * valuable thing in F4.
 *
 * The failure this exists to prevent is not the slip itself -- weather slips,
 * cranes slip -- it is the SILENCE. An owner who drives down at the weekend to
 * an untouched boat is the complaint in YARD-OPS.md §6, and it costs the
 * relationship rather than the day.
 *
 * So: commit the postponement, then email. Never inside the transaction, since
 * a rollback cannot unsend a message telling someone their weekend changed.
 * A new date is optional -- "we will be in touch" is an honest answer and a
 * better one than a date nobody believes.
 */
export async function postponeVisit(
  visitId: string,
  jobId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  if (!isId(visitId) || !isId(jobId)) throw new Error('Bad request.');

  const rawReason = String(formData.get('postponeReason') ?? '').trim();
  if (!isPostponeReason(rawReason)) {
    redirect(`/admin/board/${jobId}?error=postpone#visits`);
  }

  const note = String(formData.get('postponeNote') ?? '').trim().slice(0, 500);
  const rawNewDate = String(formData.get('newDate') ?? '').trim();
  const newDate = isLondonDate(rawNewDate) ? rawNewDate : null;
  const newTime = String(formData.get('newTime') ?? '').trim() || '09:00';

  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { placeId: true, status: true },
  });
  if (!visit) redirect(`/admin/board/${jobId}`);

  // Status in the WHERE: postponing twice must not send two emails.
  const { count } = await prisma.visit.updateMany({
    where: { id: visitId, status: 'planned' },
    data: { status: 'postponed', postponeReason: rawReason, postponeNote: note || null },
  });
  if (count === 0) redirect(`/admin/board/${jobId}#visits`);

  if (newDate) {
    await prisma.visit.create({
      data: {
        bookingId: jobId,
        placeId: visit.placeId,
        startsAt: londonDateTimeToUtc(newDate, TIME_RE.test(newTime) ? newTime : '09:00'),
        status: 'planned',
      },
    });
  }

  await prisma.booking.update({
    where: { id: jobId },
    data: { plannedOn: newDate },
  });

  // Committed. Now tell them.
  const sent = await sendVisitPostponedEmail(visitId, newDate);

  revalidatePath('/admin/board');
  redirect(`/admin/board/${jobId}?postponed=${emailFlag(sent)}#visits`);
}

// ---------------------------------------------------------------------------
// F6 — invoices and getting paid
// ---------------------------------------------------------------------------

/**
 * Issue the invoice for a finished job, then email it -- after the commit,
 * never inside it.
 */
export async function issueInvoiceAction(jobId: string): Promise<void> {
  await requireAdmin();
  if (!isId(jobId)) throw new Error('Bad request.');

  const result = await issueInvoice(jobId);
  if (!result.ok) {
    redirect(`/admin/board/${jobId}?error=${result.reason}#invoice`);
  }

  const sent = await sendInvoiceEmail(result.invoiceId);

  revalidatePath('/admin/board');
  revalidatePath('/admin/invoices');
  redirect(
    `/admin/board/${jobId}?invoiced=${encodeURIComponent(result.number)}&emailed=${emailFlag(sent)}#invoice`,
  );
}

/** Void it. Its number is burned, and the card goes back to Done. */
export async function voidInvoiceAction(invoiceId: string, jobId: string): Promise<void> {
  await requireAdmin();
  if (!isId(invoiceId) || !isId(jobId)) throw new Error('Bad request.');
  await voidInvoice(invoiceId);
  revalidatePath('/admin/board');
  revalidatePath('/admin/invoices');
  redirect(`/admin/board/${jobId}#invoice`);
}

/**
 * Paid by bank transfer, cash, or a card machine on the pontoon. The trade
 * records it; the app does not see the money. Same write path the Stripe
 * webhook will use.
 */
export async function markInvoicePaidAction(
  invoiceId: string,
  jobId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  if (!isId(invoiceId) || !isId(jobId)) throw new Error('Bad request.');

  const raw = String(formData.get('paidVia') ?? 'bank');
  // 'link' is Stripe's, and only the webhook may claim a payment came that way.
  const paidVia = raw === 'cash' || raw === 'card_machine' ? raw : 'bank';
  await markInvoicePaid(invoiceId, paidVia);

  revalidatePath('/admin/board');
  revalidatePath('/admin/invoices');
  redirect(`/admin/board/${jobId}#invoice`);
}
