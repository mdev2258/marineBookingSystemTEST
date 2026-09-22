import { prisma } from '@/lib/prisma';
import { sendReminderEmail, sendVariationEmail } from '@/lib/notifications';
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

/**
 * Chase variations the owner has not answered.
 *
 * EXACTLY ONE chase, 24 hours after it was raised, and then the app stops
 * (ANALYSIS-TRADES.md §7 F3). Not a drip campaign: the boat is opened up and
 * the trade is waiting, so one nudge is useful and a second is nagging a
 * customer the trade has to keep.
 *
 * `reminderSentAt` is the thing that makes it exactly one, and it is stamped
 * only on a successful send -- a provider outage retries on the next run
 * rather than silently swallowing the chase.
 */
export async function chaseVariations(now: Date = new Date()): Promise<ReminderResult> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const due = await prisma.variation.findMany({
    where: {
      status: 'awaiting_owner',
      reminderSentAt: null,
      createdAt: { lte: cutoff },
      // No token means nothing for the owner to click, so there is nothing
      // worth chasing them about.
      token: { not: null },
    },
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;

  for (const variation of due) {
    const result = await sendVariationEmail(variation.id, true);
    if (result?.ok) {
      await prisma.variation.update({
        where: { id: variation.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } else {
      failed++;
    }
  }

  return { considered: due.length, sent, failed };
}
