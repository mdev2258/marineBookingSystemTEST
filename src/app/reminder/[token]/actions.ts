'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { generateBookingReference } from '@/lib/reference';
import { nextPosition } from '@/lib/board';
import { REMINDER_JOB_TITLE, type ReminderKind } from '@/lib/enums';

/**
 * "Yes, book me in." The owner turns a reminder into work.
 *
 * CLAIM FIRST, THEN ACT. The reminder is claimed with its token and status in
 * the WHERE and the token cleared in the same statement; only if that matched
 * exactly one row is a card created. Doing it the other way round -- create
 * the card, then mark the reminder -- means a double-tap or a mail client
 * prefetching the link puts two identical enquiries on the board, and the
 * trade prices the same job twice.
 *
 * It creates an ENQUIRY, not a booking. The owner has said "yes, I'm
 * interested", not agreed a price, and the board should say exactly that.
 */
export async function bookFromReminder(token: string): Promise<void> {
  const reminder = await prisma.reminder.findUnique({
    where: { token },
    include: { vessel: { select: { id: true, operatorId: true, customerId: true, currentPlaceId: true } } },
  });
  if (!reminder) redirect('/reminder/done');

  const { count } = await prisma.reminder.updateMany({
    where: { token, status: 'sent' },
    data: { status: 'booked', token: null, closedAt: new Date() },
  });
  if (count === 0) redirect('/reminder/done');

  const title = REMINDER_JOB_TITLE[reminder.kind as ReminderKind] ?? 'Booked from a reminder';

  const card = await prisma.booking.create({
    data: {
      reference: generateBookingReference('HMS'),
      operatorId: reminder.vessel.operatorId,
      vesselId: reminder.vessel.id,
      customerId: reminder.vessel.customerId,
      placeId: reminder.vessel.currentPlaceId,
      column: 'enquiry',
      title,
      // The reminder's own wording rides along, so the trade opening the card
      // knows WHY this owner said yes without cross-referencing anything.
      requestNotes: `Booked from a reminder: ${reminder.message ?? title}`,
      position: await nextPosition('enquiry'),
    },
    select: { id: true },
  });

  // Keep the link both ways: the reminder knows the job it became.
  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { bookingId: card.id },
  });

  revalidatePath('/admin/board');
  revalidatePath('/admin/reminders');
  redirect('/reminder/done?booked=1');
}
