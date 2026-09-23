'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { isJobColumn, isWaitingReason } from '@/lib/enums';
import { generateBookingReference } from '@/lib/reference';
import { nextPosition, titleFromJot } from '@/lib/board';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function operatorId(): Promise<string> {
  const op = await prisma.operator.findFirst({ select: { id: true } });
  if (!op) throw new Error('No business row. Run `npm run seed`.');
  return op.id;
}

/**
 * JOT. One text box, no other fields, nothing optional about how fast it is.
 *
 * This is the whole wedge (ANALYSIS-TRADES.md §2): getting a job out of their
 * head must beat writing it on the back of their hand, or the app is abandoned
 * by Wednesday. So it takes text and NOTHING else -- no boat, no owner, no
 * place, no validation beyond "is there anything here at all".
 *
 * The title is derived, never asked for.
 */
export async function createJot(formData: FormData): Promise<void> {
  await requireAdmin();

  const text = String(formData.get('text') ?? '').trim();
  // The only thing that can stop a jot saving is an empty one.
  if (!text) redirect('/admin/jot?empty=1');

  await prisma.booking.create({
    data: {
      reference: generateBookingReference('HMS'),
      operatorId: await operatorId(),
      column: 'jotted',
      title: titleFromJot(text),
      requestNotes: text,
      position: await nextPosition('jotted'),
    },
  });

  revalidatePath('/admin/board');
  redirect('/admin/board?col=jotted&jotted=1');
}

/**
 * Find a boat by name, or create it. Typing a name that does not exist yet
 * creates the boat rather than refusing the save (§3.3) -- the trade is
 * standing in an engine bay, not doing data entry.
 *
 * Not `mode: 'insensitive'`. That is now available -- this is Postgres in
 * every environment -- so this is a choice and no longer a limitation: names
 * are matched exactly as typed, and a near-duplicate boat is a tidy-up job for
 * later, not a reason to block the save now. Turning it on would silently
 * merge "Sea Breeze" and "sea breeze", which is right more often than not but
 * is a behaviour change, not a cleanup.
 */
async function findOrCreateVessel(name: string, opId: string): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;

  const existing = await prisma.vessel.findFirst({
    where: { operatorId: opId, name: clean },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.vessel.create({
    data: { operatorId: opId, name: clean },
    select: { id: true },
  });
  return created.id;
}

/**
 * SORT A JOT into a proper job: boat, place, column. The captured text stays
 * on the row verbatim -- it is the thing the trade recognises, and losing it
 * to a tidier title would lose the context they wrote it in.
 */
export async function sortJot(id: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const opId = await operatorId();

  const vesselName = String(formData.get('vesselName') ?? '').trim();
  const placeId = String(formData.get('placeId') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const rawColumn = String(formData.get('column') ?? 'enquiry');
  const column = isJobColumn(rawColumn) ? rawColumn : 'enquiry';

  const vesselId = await findOrCreateVessel(vesselName, opId);
  // The boat carries the owner. A boat created just now has neither, and that
  // is allowed to stay true.
  const vessel = vesselId
    ? await prisma.vessel.findUnique({
        where: { id: vesselId },
        select: { customerId: true, currentPlaceId: true },
      })
    : null;

  await prisma.booking.update({
    where: { id },
    data: {
      vesselId,
      customerId: vessel?.customerId ?? null,
      placeId: placeId || vessel?.currentPlaceId || null,
      title: title || undefined,
      column,
      columnChangedAt: new Date(),
      position: await nextPosition(column),
    },
  });

  revalidatePath('/admin/board');
  redirect(`/admin/board?col=${column}`);
}

/** QUICK ADD, for when they already know the details. Lands in Enquiry. */
export async function quickAdd(formData: FormData): Promise<void> {
  await requireAdmin();
  const opId = await operatorId();

  const vesselName = String(formData.get('vesselName') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const placeId = String(formData.get('placeId') ?? '').trim();

  const vesselId = await findOrCreateVessel(vesselName, opId);
  const vessel = vesselId
    ? await prisma.vessel.findUnique({
        where: { id: vesselId },
        select: { customerId: true, currentPlaceId: true },
      })
    : null;

  await prisma.booking.create({
    data: {
      reference: generateBookingReference('HMS'),
      operatorId: opId,
      column: 'enquiry',
      // Even here nothing is required. A card with a boat and no description
      // is still a better record than the back of a hand.
      title: title || vesselName || 'New job',
      vesselId,
      customerId: vessel?.customerId ?? null,
      placeId: placeId || vessel?.currentPlaceId || null,
      position: await nextPosition('enquiry'),
    },
  });

  revalidatePath('/admin/board');
  redirect('/admin/board?col=enquiry');
}

/**
 * MOVE a card between columns.
 *
 * The one rule in the whole app that blocks a save: a card cannot enter
 * Waiting without a reason (§4). "Waiting" with no reason is exactly the hole
 * things fall through on a scrap of paper, so the guard lives HERE, in the
 * single write path, rather than only in the form that happens to show radios.
 * Every caller routes through this, so there is one place to get it right.
 */
export async function moveJob(id: string, formData: FormData): Promise<void> {
  await requireAdmin();

  const rawColumn = String(formData.get('column') ?? '');
  if (!isJobColumn(rawColumn)) redirect(`/admin/board/${id}?error=column`);
  const column = rawColumn;

  const rawReason = String(formData.get('waitingReason') ?? '').trim();
  const rawUntil = String(formData.get('waitingUntil') ?? '').trim();

  if (column === 'waiting' && !isWaitingReason(rawReason)) {
    redirect(`/admin/board/${id}?error=reason#waiting`);
  }
  // These two columns are claims about paperwork; the job page hides the
  // buttons, this stops a crafted POST.
  if (column === 'estimate_sent' && !(await prisma.estimate.count({ where: { bookingId: id, status: 'sent' } }))) {
    redirect(`/admin/board/${id}?error=column`);
  }
  if (column === 'invoiced' && !(await prisma.invoice.count({ where: { bookingId: id, status: { in: ['sent', 'paid'] } } }))) {
    redirect(`/admin/board/${id}?error=column`);
  }

  await prisma.booking.update({
    where: { id },
    data: {
      column,
      columnChangedAt: new Date(),
      position: await nextPosition(column),
      // Leaving Waiting clears the reason with it: a stale "waiting on parts"
      // on a card that is now On it is worse than no reason at all.
      waitingReason: column === 'waiting' ? rawReason : null,
      waitingUntil: column === 'waiting' && DATE_RE.test(rawUntil) ? rawUntil : null,
    },
  });

  revalidatePath('/admin/board');
  revalidatePath(`/admin/board/${id}`);
  redirect(`/admin/board?col=${column}`);
}
