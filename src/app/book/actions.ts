'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hasRoomFor } from '@/lib/availability';
import { depositPence, totalPence } from '@/lib/money';
import { generateBookingReference } from '@/lib/reference';
import { holdExpiresAt, startCheckout } from '@/lib/payments';

const BookingSchema = z.object({
  name: z.string().trim().min(1, 'Please give us a name for the booking.').max(120),
  email: z.email('That email address does not look right.').max(200),
  phone: z.string().trim().min(6, 'We need a number in case we have to reach you.').max(40),
  partySize: z.coerce.number().int().min(1, 'At least one person.').max(50),
});

export type BookingState = {
  error?: string;
  errors?: Partial<Record<'name' | 'email' | 'phone' | 'partySize', string>>;
};

export async function createPendingBooking(
  sessionId: string,
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const parsed = BookingSchema.safeParse({
    name: formData.get('name'),
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    phone: formData.get('phone'),
    partySize: formData.get('partySize'),
  });

  if (!parsed.success) {
    const errors: BookingState['errors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof NonNullable<BookingState['errors']>;
      if (field && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const { name, email, phone, partySize } = parsed.data;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { sessionType: true },
  });
  if (!session || session.status !== 'scheduled') {
    return { error: 'That session is no longer available.' };
  }
  if (session.startsAt <= new Date()) {
    return { error: 'That session has already started.' };
  }

  // The last-seat re-check, immediately before the insert. Deliberately not
  // locked: an unlucky simultaneous double-book is acceptable for a demo, and a
  // SQLite lock would not survive the move to Postgres unchanged anyway.
  if (!(await hasRoomFor(session, partySize))) {
    return { error: 'Sorry — that session filled up while you were booking.' };
  }

  // Email is stored lowercased and matched exactly. mode:'insensitive' is
  // Postgres-only and throws on SQLite.
  const customer = await prisma.customer.upsert({
    where: { operatorId_email: { operatorId: session.operatorId, email } },
    update: { name, phone },
    create: { operatorId: session.operatorId, name, email, phone },
  });

  const total = totalPence(partySize, session.pricePerPersonPence);

  const booking = await prisma.booking.create({
    data: {
      reference: generateBookingReference(),
      operatorId: session.operatorId,
      sessionId: session.id,
      customerId: customer.id,
      partySize,
      // Snapshot: a later price change must not move what this customer owes.
      pricePerPersonPence: session.pricePerPersonPence,
      totalPence: total,
      depositPence: depositPence(
        partySize,
        session.pricePerPersonPence,
        session.sessionType.depositPercent,
      ),
      status: 'pending_payment',
      // Mirrors Stripe Checkout's 30-minute minimum. Until this passes, the
      // seats are held; after it, availability frees them with no job running.
      expiresAt: holdExpiresAt(),
    },
  });

  // The only door to payment. Nothing here knows whether Stripe exists.
  const { url } = await startCheckout(booking.id);
  redirect(url);
}
