import { prisma } from '@/lib/prisma';
import { sendReminderEmail } from '@/lib/notifications';
import { addDays, londonDayBounds, todayInLondon } from '@/lib/time';

export type ReminderResult = { considered: number; sent: number; failed: number };

/**
 * "The evening before" means the evening before in Lymington, not in UTC.
 * Tomorrow is resolved as a London calendar day and converted to the instants
 * bracketing it, so a 09:30 session is included whichever side of 25 October
 * the run happens to fall.
 *
 * reminderSentAt lives on Booking, not Session: two people on the same session
 * are two reminders, and one failing must not mark the other as done.
 */
export async function sendReminders(now: Date = new Date()): Promise<ReminderResult> {
  const { start, end } = londonDayBounds(addDays(todayInLondon(now), 1));

  const due = await prisma.booking.findMany({
    where: {
      status: 'paid',
      reminderSentAt: null,
      session: { status: 'scheduled', startsAt: { gte: start, lt: end } },
    },
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;

  for (const booking of due) {
    const result = await sendReminderEmail(booking.id);
    if (result?.ok) {
      // Stamped only on success, so a provider outage retries on the next run
      // instead of silently swallowing the reminder.
      await prisma.booking.update({
        where: { id: booking.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } else {
      failed++;
    }
  }

  return { considered: due.length, sent, failed };
}

/**
 * Tidiness only. Availability already treats a lapsed hold as free via the
 * expiresAt predicate, so nothing depends on this having run -- it just stops
 * the admin screens showing stale "pending" rows forever.
 */
export async function sweepExpiredHolds(now: Date = new Date()): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: { status: 'pending_payment', expiresAt: { lt: now } },
    data: { status: 'expired' },
  });
  return result.count;
}
