'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { hasRoomFor } from '@/lib/availability';
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
  if (!booking) return { error: 'That link has already been used.' };

  const target = await prisma.session.findUnique({ where: { id: newSessionId } });
  if (!target || target.status !== 'scheduled') {
    return { error: 'That session is no longer available.' };
  }
  // Same activity only: a keelboat deposit does not entitle you to a RIB.
  if (target.sessionTypeId !== booking.session.sessionTypeId) {
    return { error: 'That session is for a different activity.' };
  }
  if (target.startsAt <= new Date()) return { error: 'That session has already started.' };
  if (!(await hasRoomFor(target, booking.partySize))) {
    return { error: 'That session just filled up. Please pick another.' };
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
