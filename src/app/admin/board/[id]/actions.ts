'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { isDecidedVia, LINE_KIND, type LineKind } from '@/lib/enums';
import { generateRebookToken } from '@/lib/reference';
import { nextPosition } from '@/lib/board';
import { DEFAULT_VAT_BPS, lineAmountPence, parseQty, totalsFor } from '@/lib/estimates';
import { poundsToPence } from '@/lib/money';
import { sendEstimateEmail, sendVariationEmail } from '@/lib/notifications';

async function business() {
  const op = await prisma.operator.findFirst();
  if (!op) throw new Error('No business row. Run `npm run seed`.');
  return op;
}

function isLineKind(v: string): v is LineKind {
  return (LINE_KIND as readonly string[]).includes(v);
}

/**
 * Replace the job's working line list from the form.
 *
 * Lines live on the JOB, not on an Estimate: they are the list the trade ticks
 * off as work gets done. An Estimate snapshots their total at the moment it is
 * sent, which is why editing lines afterwards cannot change what was sent.
 *
 * Rows arrive as parallel arrays from the form. A row with no description is
 * dropped rather than rejected -- an empty last row is how people leave a
 * form, not an error worth stopping a save for.
 */
export async function saveLines(jobId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const op = await business();

  const kinds = formData.getAll('kind').map(String);
  const descriptions = formData.getAll('description').map(String);
  const qtys = formData.getAll('qty').map(String);
  const prices = formData.getAll('unitPrice').map(String);
  const dones = new Set(formData.getAll('done').map(String));

  const rows: {
    kind: string;
    description: string;
    qty: number;
    unitPricePence: number;
    vatRateBps: number;
    done: boolean;
    sortOrder: number;
  }[] = [];

  for (let i = 0; i < descriptions.length; i++) {
    const description = (descriptions[i] ?? '').trim();
    if (!description) continue;

    const qty = parseQty(qtys[i] ?? '') ?? 1;
    const unitPricePence = poundsToPence(prices[i] ?? '0') ?? 0;
    const kind = isLineKind(kinds[i] ?? '') ? kinds[i]! : 'labour';

    rows.push({
      kind,
      description,
      qty,
      unitPricePence,
      // A rate is stored even when the business is not registered, so that
      // registering later does not require re-typing every line. It is simply
      // never read while vatRegistered is false.
      vatRateBps: op.vatRegistered ? DEFAULT_VAT_BPS : 0,
      done: dones.has(String(i)),
      sortOrder: rows.length,
    });
  }

  // Replace wholesale inside one transaction: a half-written line list is a
  // wrong total, and a wrong total is the thing an owner argues about.
  await prisma.$transaction([
    prisma.quoteLineItem.deleteMany({ where: { bookingId: jobId } }),
    ...rows.map((r) =>
      prisma.quoteLineItem.create({
        data: {
          bookingId: jobId,
          kind: r.kind,
          description: r.description,
          qty: r.qty,
          unitPricePence: r.unitPricePence,
          amountPence: lineAmountPence(r.qty, r.unitPricePence),
          vatRateBps: r.vatRateBps,
          done: r.done,
          sortOrder: r.sortOrder,
        },
      }),
    ),
  ]);

  revalidatePath(`/admin/board/${jobId}/estimate`);
  revalidatePath(`/admin/board/${jobId}`);
  redirect(`/admin/board/${jobId}/estimate?saved=1`);
}

/**
 * Send the estimate.
 *
 * Re-estimating SUPERSEDES rather than edits, so what the owner agreed to is
 * still readable after the price changes. The previous sent estimate keeps its
 * own snapshotted total for ever.
 *
 * The email goes out AFTER the transaction commits. A rollback cannot unsend a
 * message, so nothing that reaches a customer happens inside one.
 */
export async function sendEstimate(jobId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const op = await business();

  const notes = String(formData.get('notes') ?? '').trim().slice(0, 1000);

  const job = await prisma.booking.findUnique({
    where: { id: jobId },
    include: { lineItems: true, customer: { select: { id: true } } },
  });
  if (!job) redirect('/admin/board');
  if (job.lineItems.length === 0) redirect(`/admin/board/${jobId}/estimate?error=empty`);

  const totals = totalsFor(job.lineItems, op.vatRegistered);
  const token = generateRebookToken();

  const estimateId = await prisma.$transaction(async (tx) => {
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
        sentAt: new Date(),
        token,
      },
      select: { id: true },
    });

    await tx.booking.update({
      where: { id: jobId },
      data: {
        column: 'estimate_sent',
        columnChangedAt: new Date(),
        position: await nextPosition('estimate_sent'),
        quotedPence: totals.gross,
        quotedAt: new Date(),
        quoteNotes: notes || null,
      },
    });

    return created.id;
  });

  // Committed. Now, and only now, tell the owner.
  await sendEstimateEmail(estimateId);

  revalidatePath('/admin/board');
  redirect(`/admin/board/${jobId}?sent=1`);
}

/**
 * "Agreed by phone" -- and by text, or leaning on the pushpit.
 *
 * This is a first-class path, not a fallback (§3.5). The app records what
 * actually happened; it never forces an owner online to make the record
 * tidy. Every decision stores HOW it was made, which is the evidence trail
 * that stops the argument in March.
 */
export async function recordEstimateDecision(
  estimateId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const accepted = String(formData.get('decision') ?? '') === 'accepted';
  const rawVia = String(formData.get('decidedVia') ?? 'phone');
  const via = isDecidedVia(rawVia) ? rawVia : 'phone';
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

  if (count === 1 && accepted) {
    await prisma.booking.update({
      where: { id: estimate.bookingId },
      data: {
        column: 'booked',
        columnChangedAt: new Date(),
        position: await nextPosition('booked'),
        acceptedAt: new Date(),
        quotedPence: estimate.totalPence,
      },
    });
  }

  revalidatePath('/admin/board');
  redirect(`/admin/board/${estimate.bookingId}`);
}

/**
 * Raise a variation: what was found, why it matters, what it costs.
 *
 * Three fields, because it is typed one-handed in an engine bay with the
 * thing still in shot. Anything longer gets written on a hand instead and
 * argued about in March.
 */
export async function raiseVariation(jobId: string, formData: FormData): Promise<void> {
  await requireAdmin();

  const description = String(formData.get('description') ?? '').trim().slice(0, 300);
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 500);
  const estimatePence = poundsToPence(String(formData.get('amount') ?? ''));

  if (!description || estimatePence == null) {
    redirect(`/admin/board/${jobId}?error=variation#variation`);
  }

  const variation = await prisma.variation.create({
    data: {
      bookingId: jobId,
      description,
      reason: reason || null,
      estimatePence,
      status: 'awaiting_owner',
      token: generateRebookToken(),
    },
    select: { id: true },
  });

  await sendVariationEmail(variation.id);

  revalidatePath('/admin/board');
  revalidatePath(`/admin/board/${jobId}`);
  redirect(`/admin/board/${jobId}?raised=1`);
}

/** The same "agreed by phone" path, for extra work. */
export async function recordVariationDecision(
  variationId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const decision = String(formData.get('decision') ?? '');
  const rawVia = String(formData.get('decidedVia') ?? 'phone');
  const via = isDecidedVia(rawVia) ? rawVia : 'phone';
  const note = String(formData.get('decisionNote') ?? '').trim().slice(0, 500);

  const status =
    decision === 'approved' ? 'approved' : decision === 'withdrawn' ? 'withdrawn' : 'declined';

  const variation = await prisma.variation.findUnique({
    where: { id: variationId },
    select: { bookingId: true },
  });
  if (!variation) redirect('/admin/board');

  await prisma.variation.updateMany({
    where: { id: variationId, status: 'awaiting_owner' },
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
