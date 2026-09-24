'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { hasRoom } from '@/lib/availability';
import { depositPence } from '@/lib/money';
import { holdExpiresAt, startCheckout } from '@/lib/payments';
import { yardOnly } from '@/lib/features';

export type AcceptState = { error?: string };

/**
 * Accept a quote.
 *
 * This is the moment the deposit comes into existence: it is computed once
 * here from the agreed price and the service's deposit percentage, and is
 * never recomputed afterwards. Everything downstream -- rebooking onto another
 * slot, a later re-quote -- carries this number unchanged.
 *
 * The token is the only credential, so it is single-use: it sits in the WHERE
 * clause of the move and is cleared by the same statement.
 */
export async function acceptQuote(
  token: string,
  _prev: AcceptState,
  _formData: FormData,
): Promise<AcceptState> {
  yardOnly();
  // A non-string token ($undefined, an object) makes Prisma drop the filter.
  if (typeof token !== 'string' || !token) return { error: 'That link has already been used.' };
  const booking = await prisma.booking.findFirst({
    where: { quoteToken: token, status: 'quoted' },
    include: { session: { include: { sessionType: true } } },
  });
  if (!booking) return { error: 'That link has already been used.' };
  if (booking.quotedPence == null || !booking.session) {
    return { error: 'That quote is incomplete. Please give us a ring.' };
  }
  if (booking.session.status !== 'scheduled' || booking.session.startsAt <= new Date()) {
    return { error: 'That date has passed. Give us a ring and we will find another.' };
  }
  // A quote never held the slot, so somebody else may have taken it meanwhile.
  if (!(await hasRoom(booking.session))) {
    return { error: 'Someone took that slot first. Give us a ring and we will sort another date.' };
  }

  const deposit = depositPence(booking.quotedPence, booking.session.sessionType.depositPercent);

  const claimed = await prisma.booking.updateMany({
    where: { quoteToken: token, status: 'quoted' },
    data: {
      status: 'pending_payment',
      acceptedAt: new Date(),
      depositPence: deposit,
      // Mirrors Stripe Checkout's 30-minute minimum. From here the slot IS
      // held, which it was not while the quote was merely out.
      expiresAt: holdExpiresAt(),
      quoteToken: null,
    },
  });
  if (claimed.count === 0) return { error: 'That link has already been used.' };

  revalidatePath('/admin/enquiries');
  revalidatePath('/admin/day');

  const { url } = await startCheckout(booking.id);
  redirect(url);
}

/** Say no, without having to ring up and say no. */
export async function declineQuote(token: string): Promise<void> {
  yardOnly();
  if (typeof token !== 'string' || !token) return;
  const declined = await prisma.booking.updateMany({
    where: { quoteToken: token, status: 'quoted' },
    data: { status: 'declined', quoteToken: null },
  });

  revalidatePath('/admin/enquiries');
  if (declined.count === 0) return;
  redirect('/quote/declined');
}
