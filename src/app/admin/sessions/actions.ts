'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { londonDateTimeToUtc } from '@/lib/time';
import { placesTaken } from '@/lib/availability';
import { isCancellationReason } from '@/lib/enums';
import { generateRebookToken } from '@/lib/reference';
import { sendCancellationEmail } from '@/lib/notifications';

export type SessionFormState = {
  error?: string;
  errors?: Partial<Record<'sessionTypeId' | 'date' | 'time' | 'capacity', string>>;
};

type Parsed = {
  sessionTypeId: string;
  date: string;
  time: string;
  capacity: number;
  notes: string | null;
};

/**
 * There is no price here any more. Every job is quoted on the boat, so a slot
 * carries only when it is, what work it is for, and how many vessels fit.
 */
function parse(formData: FormData): { ok: true; value: Parsed } | { ok: false; state: SessionFormState } {
  const errors: SessionFormState['errors'] = {};

  const sessionTypeId = String(formData.get('sessionTypeId') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  const capacityRaw = String(formData.get('capacity') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim().slice(0, 200);

  if (!sessionTypeId) errors.sessionTypeId = 'Pick a service.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = 'Pick a date.';
  if (!/^\d{2}:\d{2}$/.test(time)) errors.time = 'Pick a start time.';

  const capacity = Number(capacityRaw);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
    errors.capacity = 'Capacity must be a whole number of vessels.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, state: { errors } };

  return { ok: true, value: { sessionTypeId, date, time, capacity, notes: notes || null } };
}

export async function createSession(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  await requireAdmin();

  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;
  const { sessionTypeId, date, time, capacity, notes } = parsed.value;

  const type = await prisma.sessionType.findUnique({ where: { id: sessionTypeId } });
  if (!type) return { errors: { sessionTypeId: 'That service no longer exists.' } };

  const startsAt = londonDateTimeToUtc(date, time);
  const endsAt = new Date(startsAt.getTime() + type.durationMinutes * 60_000);

  const session = await prisma.session.create({
    data: {
      operatorId: type.operatorId,
      sessionTypeId: type.id,
      startsAt,
      endsAt,
      // Snapshotted, not read through the relation later: changing the
      // service's default must not silently resize a slot already booked into.
      capacity,
      notes,
    },
  });

  revalidatePath('/admin/sessions');
  revalidatePath('/admin/day');
  redirect(`/admin/sessions/${session.id}`);
}

export async function updateSession(
  sessionId: string,
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  await requireAdmin();

  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;
  const { sessionTypeId, date, time, capacity, notes } = parsed.value;

  const [existing, type] = await Promise.all([
    prisma.session.findUnique({ where: { id: sessionId } }),
    prisma.sessionType.findUnique({ where: { id: sessionTypeId } }),
  ]);
  if (!existing) return { error: 'That slot no longer exists.' };
  if (!type) return { errors: { sessionTypeId: 'That service no longer exists.' } };

  // Capacity below the vessels already booked in would make spacesLeft
  // negative and show a full slot as bookable. Refuse rather than clamp.
  const taken = await placesTaken(sessionId);
  if (capacity < taken) {
    return {
      errors: { capacity: `${taken} vessel${taken === 1 ? ' is' : 's are'} already booked in.` },
    };
  }

  const startsAt = londonDateTimeToUtc(date, time);

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      sessionTypeId: type.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + type.durationMinutes * 60_000),
      capacity,
      notes,
    },
  });

  revalidatePath('/admin/sessions');
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath('/admin/day');
  return {};
}

export type CancelState = { error?: string };

/**
 * Cancel a session and tell everyone booked on it.
 *
 * Two distinct steps, in this order, and not interchangeable:
 *
 *  1. ONE transaction moves the session to cancelled, records why, and flips
 *     every paid booking to awaiting_rebook with a fresh single-use token.
 *  2. ONLY THEN are emails sent, one at a time, each writing its own EmailLog
 *     row.
 *
 * Email is never sent inside the transaction. A slow provider would hold the
 * write lock open on every booking in the session, and more importantly a
 * rollback cannot unsend a message that has already left -- customers would be
 * told their session was cancelled when it was not.
 */
export async function cancelSession(
  sessionId: string,
  _prev: CancelState,
  formData: FormData,
): Promise<CancelState> {
  await requireAdmin();

  const reason = String(formData.get('reason') ?? '');
  const note = String(formData.get('note') ?? '').trim().slice(0, 500);
  if (!isCancellationReason(reason)) return { error: 'Pick a reason.' };

  const toNotify = await prisma.$transaction(async (tx) => {
    // The status predicate is in the WHERE clause, so a double submit matches
    // zero rows and cannot cancel twice or issue a second set of tokens.
    const claimed = await tx.session.updateMany({
      where: { id: sessionId, status: 'scheduled' },
      data: { status: 'cancelled' },
    });
    if (claimed.count === 0) return [];

    await tx.sessionCancellation.create({
      data: { sessionId, reason, note: note || null, cancelledBy: 'admin' },
    });

    const paid = await tx.booking.findMany({
      where: { sessionId, status: 'paid' },
      select: { id: true },
    });
    for (const booking of paid) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'awaiting_rebook', rebookToken: generateRebookToken() },
      });
    }

    // A hold cannot be paid for a session that is no longer running, and
    // leaving it live would keep it occupying a seat on a cancelled session.
    await tx.booking.updateMany({
      where: { sessionId, status: 'pending_payment' },
      data: { status: 'expired', expiresAt: null },
    });

    return paid.map((b) => b.id);
  });

  // One send per booking, each writing an EmailLog row. The result screen
  // counts those rows -- that count is the "3 customers notified" number.
  for (const bookingId of toNotify) {
    await sendCancellationEmail(bookingId);
  }

  revalidatePath('/admin/sessions');
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath('/admin/day');
  redirect(`/admin/sessions/${sessionId}/cancel`);
}
