'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { hasRoom } from '@/lib/availability';
import { sendRebookConfirmationEmail } from '@/lib/notifications';

export type RebookState = { error?: string };

/**
 * Move a booking off a cancelled session onto a replacement.
 *
 * The SAME row moves: sessionId changes, status returns to paid, and the
 * deposit, reference and payment intent are untouched -- the deposit transfers
 * by virtue of never having gone anywhere. Cancel-and-clone was rejected
 * because it splits one payment across two rows and breaks the 1:1 invariant
 * on stripePaymentIntentId.
 *
 * The token is the only credential this page has, so it is single-use: it is
 * part of the WHERE clause on the move and is cleared by the same statement.
 */
export async function confirmRebook(
  token: string,
  _prev: RebookState,
  formData: FormData,
): Promise<RebookState> {
  const newSessionId = String(formData.get('sessionId') ?? '');
  if (!newSessionId) return { error: 'Pick a session first.' };

  const booking = await prisma.booking.findFirst({
    where: { rebookToken: token, status: 'awaiting_rebook' },
    include: { session: { select: { id: true, sessionTypeId: true } } },
  });
  // awaiting_rebook always came off a cancelled slot, so session is never null
  // here -- but the column is nullable, so the compiler is right to ask.
  if (!booking || !booking.session) return { error: 'That link has already been used.' };

  const target = await prisma.session.findUnique({ where: { id: newSessionId } });
  if (!target || target.status !== 'scheduled') {
    return { error: 'That slot is no longer available.' };
  }
  // Same service only: a deposit for a liftout does not entitle you to a survey.
  if (target.sessionTypeId !== booking.session.sessionTypeId) {
    return { error: 'That slot is for different work.' };
  }
  if (target.startsAt <= new Date()) return { error: 'That slot has already passed.' };
  if (!(await hasRoom(target))) {
    return { error: 'That slot just filled up. Please pick another.' };
  }

  // Token in the WHERE clause, cleared in the same statement: a double submit
  // matches zero rows rather than moving the booking twice.
  const moved = await prisma.booking.updateMany({
    where: { rebookToken: token, status: 'awaiting_rebook' },
    data: {
      sessionId: target.id,
      status: 'paid',
      rebookedFromSessionId: booking.session.id,
      rebookedAt: new Date(),
      rebookToken: null,
    },
  });
  if (moved.count === 0) return { error: 'That link has already been used.' };

  await sendRebookConfirmationEmail(booking.id);

  revalidatePath('/admin/day');
  revalidatePath('/admin/sessions');
  redirect(`/booking/${booking.reference}`);
}
