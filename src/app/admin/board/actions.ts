'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { isJobColumn, isWaitingReason } from '@/lib/enums';
import { generateBookingReference, generateRebookToken } from '@/lib/reference';
import { isId, isLondonDate, nextPosition, paperworkAllows, titleFromJot } from '@/lib/board';

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

type Owner = { name: string; email: string; phone: string | null };

/**
 * The owner fields on Sort, Quick add and the boat file. All optional -- a
 * boat can still exist with no owner -- but if any is filled in, a name and a
 * real-looking email are needed, because the email is the whole point: it is
 * where the estimate, the variation and the boat link go.
 *
 * 'bad' is returned rather than redirecting here, so each caller sends the
 * trade back to its own form.
 */
function readOwner(formData: FormData): Owner | null | 'bad' {
  const name = String(formData.get('ownerName') ?? '').trim().slice(0, 120);
  const email = String(formData.get('ownerEmail') ?? '').trim().toLowerCase().slice(0, 254);
  const phone = String(formData.get('ownerPhone') ?? '').trim().slice(0, 40);
  if (!name && !email && !phone) return null;
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'bad';
  return { name, email, phone: phone || null };
}

/**
 * Give a boat its owner, reusing the Customer if that email is already on the
 * books. An existing customer's name and phone are NOT overwritten from here:
 * typing someone's email is not proof you are allowed to rename them.
 *
 * Only an ownerless boat gets one (customerId: null in the WHERE), and it gets
 * its owner link at the same time -- the boat link is what the estimate and
 * variation emails carry. Jobs already on the boat with no owner pick it up,
 * or their emails would still have nowhere to go.
 */
async function attachOwner(vesselId: string, opId: string, owner: Owner): Promise<void> {
  const customer = await prisma.customer.upsert({
    where: { operatorId_email: { operatorId: opId, email: owner.email } },
    create: { operatorId: opId, name: owner.name, email: owner.email, phone: owner.phone },
    update: {},
    select: { id: true },
  });

  await prisma.vessel.updateMany({
    where: { id: vesselId, customerId: null },
    data: { customerId: customer.id },
  });
  await prisma.vessel.updateMany({
    where: { id: vesselId, ownerToken: null },
    data: { ownerToken: generateRebookToken() },
  });

  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId }, select: { customerId: true } });
  if (vessel?.customerId) {
    await prisma.booking.updateMany({
      where: { vesselId, customerId: null },
      data: { customerId: vessel.customerId },
    });
  }
}

/**
 * SORT A JOT into a proper job: boat, owner, place, column. The captured text
 * stays on the row verbatim -- it is the thing the trade recognises, and
 * losing it to a tidier title would lose the context they wrote it in.
 *
 * Only a card still in Jotted can be sorted, and the column is in the WHERE:
 * a sorted, invoiced or paid job re-filed as a fresh enquiry is a job whose
 * history just lied. The same paperwork rules as moveJob apply -- a jot has
 * no estimate or invoice behind it, so it cannot land in either column.
 */
export async function sortJot(id: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isId(id)) throw new Error('Bad request.');
  const opId = await operatorId();

  const vesselName = String(formData.get('vesselName') ?? '').trim();
  const placeId = String(formData.get('placeId') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const rawColumn = String(formData.get('column') ?? 'enquiry');
  const column = isJobColumn(rawColumn) ? rawColumn : 'enquiry';

  const jot = await prisma.booking.findFirst({ where: { id, column: 'jotted' }, select: { id: true } });
  if (!jot) redirect(`/admin/board/${id}`);

  // Waiting needs a reason, asked for on the card itself; Jotted is where it
  // already is.
  if (column === 'waiting' || column === 'jotted' || !(await paperworkAllows(id, column))) {
    redirect(`/admin/board/${id}/sort?error=column`);
  }
  const owner = readOwner(formData);
  if (owner === 'bad') redirect(`/admin/board/${id}/sort?error=owner`);

  const vesselId = await findOrCreateVessel(vesselName, opId);
  if (vesselId && owner) await attachOwner(vesselId, opId, owner);
  // The boat carries the owner. A boat created just now with no owner typed
  // has neither, and that is allowed to stay true.
  const vessel = vesselId
    ? await prisma.vessel.findUnique({
        where: { id: vesselId },
        select: { customerId: true, currentPlaceId: true },
      })
    : null;

  const { count } = await prisma.booking.updateMany({
    where: { id, column: 'jotted' },
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
  if (count === 0) redirect(`/admin/board/${id}`);

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

  const owner = readOwner(formData);
  if (owner === 'bad') redirect('/admin/board/new?error=owner');

  const vesselId = await findOrCreateVessel(vesselName, opId);
  if (vesselId && owner) await attachOwner(vesselId, opId, owner);
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

/** Add the owner to a boat that has none, from the boat file. */
export async function setBoatOwner(vesselId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isId(vesselId)) throw new Error('Bad request.');

  const owner = readOwner(formData);
  if (!owner || owner === 'bad') redirect(`/admin/boats/${vesselId}?error=owner#owner`);

  await attachOwner(vesselId, await operatorId(), owner);

  revalidatePath(`/admin/boats/${vesselId}`);
  revalidatePath('/admin/board');
  redirect(`/admin/boats/${vesselId}?owner=1`);
}

/**
 * MOVE a card between columns.
 *
 * The one rule in the whole app that blocks a save: a card cannot enter
 * Waiting without a reason (§4). "Waiting" with no reason is exactly the hole
 * things fall through on a scrap of paper, so the guard lives HERE, in the
 * single write path, rather than only in the form that happens to show radios.
 * Every caller routes through this, so there is one place to get it right.
 *
 * Invoiced and paid are one-way. A card leaves Invoiced by being paid or by
 * voiding the invoice (which puts it back in Done itself); moving it back by
 * hand and issuing again is how a job got billed twice. Both conditions are
 * in the WHERE, so a paid job cannot be dragged anywhere.
 */
export async function moveJob(id: string, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isId(id)) throw new Error('Bad request.');

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
  if (!(await paperworkAllows(id, column))) {
    redirect(`/admin/board/${id}?error=column`);
  }

  const { count } = await prisma.booking.updateMany({
    where: {
      id,
      column: { notIn: ['invoiced', 'paid'] },
      invoices: { none: { status: 'paid' } },
    },
    data: {
      column,
      columnChangedAt: new Date(),
      position: await nextPosition(column),
      // Leaving Waiting clears the reason with it: a stale "waiting on parts"
      // on a card that is now On it is worse than no reason at all.
      waitingReason: column === 'waiting' ? rawReason : null,
      waitingUntil: column === 'waiting' && isLondonDate(rawUntil) ? rawUntil : null,
    },
  });
  if (count === 0) redirect(`/admin/board/${id}?error=locked`);

  revalidatePath('/admin/board');
  revalidatePath(`/admin/board/${id}`);
  redirect(`/admin/board?col=${column}`);
}
