'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { poundsToPence } from '@/lib/money';
import { hasRoom } from '@/lib/availability';
import { generateRebookToken } from '@/lib/reference';
import { sendQuoteEmail } from '@/lib/notifications';

export type QuoteState = {
  error?: string;
  ok?: boolean;
  errors?: Partial<Record<'price' | 'sessionId', string>>;
};

/**
 * Price a job and offer the owner a date, in one step.
 *
 * A slot is required rather than optional. Partly because "here is the price,
 * we will find a date later" is a poor thing to ask someone to accept, and
 * partly because the deposit percentage lives on the service behind the slot:
 * without one there is nothing to compute a deposit from when they say yes.
 */
export async function sendQuote(
  bookingId: string,
  _prev: QuoteState,
  formData: FormData,
): Promise<QuoteState> {
  await requireAdmin();

  const errors: QuoteState['errors'] = {};
  const quotedPence = poundsToPence(String(formData.get('price') ?? ''));
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  const quoteNotes = String(formData.get('quoteNotes') ?? '').trim().slice(0, 1000);

  if (quotedPence === null || quotedPence <= 0) {
    errors.price = 'A price, like 650 or 1240.50.';
  }
  if (!sessionId) errors.sessionId = 'Give them a date to accept.';
  if (Object.keys(errors).length > 0) return { errors };

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { error: 'That job no longer exists.' };
  if (!['enquiry', 'quoted'].includes(booking.status)) {
    return { error: 'That job has moved on and cannot be re-quoted here.' };
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== 'scheduled' || session.startsAt <= new Date()) {
    return { errors: { sessionId: 'That slot is no longer available.' } };
  }
  // Re-quoting into the same slot the job already sits in must not be refused
  // for want of room it is not occupying: an enquiry never held the place.
  if (!(await hasRoom(session))) {
    return { errors: { sessionId: 'That slot is full.' } };
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      sessionId: session.id,
      quotedPence,
      quoteNotes: quoteNotes || null,
      quotedAt: new Date(),
      status: 'quoted',
      // A fresh token every time it is quoted, so a superseded quote's link
      // cannot be used to accept an old price.
      quoteToken: generateRebookToken(),
      // Still nothing owed: the deposit appears when they accept.
      depositPence: null,
    },
  });

  await sendQuoteEmail(bookingId);

  revalidatePath('/admin/enquiries');
  revalidatePath('/admin/day');
  revalidatePath('/admin/sessions');
  return { ok: true };
}
