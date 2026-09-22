'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { nextPosition } from '@/lib/board';

/**
 * The owner answers their estimate.
 *
 * IDEMPOTENCY IS STRUCTURAL. The token goes in the WHERE clause and is cleared
 * by the same statement, so a double-tap, a resent link or a mail client
 * prefetching the URL matches zero rows the second time. There is no
 * check-then-write anywhere in this path.
 *
 * No admin check here on purpose: this IS the unauthenticated path. The token
 * is the credential, which is why it is unguessable and single-use.
 */
export async function decideEstimate(token: string, formData: FormData): Promise<void> {
  const accepted = String(formData.get('decision') ?? '') === 'accept';

  const estimate = await prisma.estimate.findUnique({
    where: { token },
    select: { id: true, bookingId: true, totalPence: true },
  });
  // A spent token is not an error worth explaining: the page it lands on says
  // what the answer already was.
  if (!estimate) redirect('/estimate/done');

  const { count } = await prisma.estimate.updateMany({
    where: { token, status: 'sent' },
    data: {
      status: accepted ? 'accepted' : 'declined',
      decidedAt: new Date(),
      decidedVia: 'link',
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

  // The board is the trade's screen; it must reflect this before they next
  // look at it, which may be seconds from now on a different phone.
  revalidatePath('/admin/board');
  redirect(`/estimate/done?d=${accepted ? 'accepted' : 'declined'}`);
}
