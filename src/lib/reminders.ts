import { prisma } from '@/lib/prisma';
import {
  sendInvoiceReminderEmail,
  sendReminderEmail,
  sendVariationEmail,
} from '@/lib/notifications';
import { addDays, londonDayBounds, todayInLondon, type LondonDate } from '@/lib/time';

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

/**
 * Chase unpaid invoices: one email on the due date, one a week later, then
 * the app stops for good (§7 F6).
 *
 * AT MOST ONE EMAIL PER INVOICE PER NIGHT. An invoice that is already more
 * than a week overdue the first time this sees it -- an old one, or one whose
 * due-date run was missed -- gets the overdue email ONLY, and the due-date
 * stamp is set alongside it so the "due today" message can never arrive after
 * the "a week late" one. Two emails in one night reads as a system gone wrong.
 *
 * CLAIM, THEN SEND. The stamp is written first, guarded by `null` in the WHERE,
 * so of two overlapping runs only one matches a row and emails; the other gets
 * count 0 and moves on. A failed send puts the stamps back, so an outage still
 * retries on the next run.
 */
export function invoiceChaseStage(
  inv: { dueOn: LondonDate; dueReminderSentAt: Date | null; overdueReminderSentAt: Date | null },
  today: LondonDate,
): 'due' | 'overdue' | null {
  if (inv.dueOn > today) return null;
  if (inv.dueOn <= addDays(today, -7) && !inv.overdueReminderSentAt) return 'overdue';
  if (!inv.dueReminderSentAt) return 'due';
  return null;
}

export async function chaseInvoices(now: Date = new Date()): Promise<ReminderResult> {
  const today = todayInLondon(now);

  const unpaid = await prisma.invoice.findMany({
    where: {
      status: 'sent',
      dueOn: { lte: today },
      OR: [{ dueReminderSentAt: null }, { overdueReminderSentAt: null }],
    },
    select: { id: true, dueOn: true, dueReminderSentAt: true, overdueReminderSentAt: true },
  });

  let sent = 0;
  let failed = 0;
  let considered = 0;

  for (const inv of unpaid) {
    const stage = invoiceChaseStage(inv, today);
    if (!stage) continue;
    considered++;

    const stamp = new Date();
    const { count } = await prisma.invoice.updateMany({
      where:
        stage === 'overdue'
          ? { id: inv.id, status: 'sent', overdueReminderSentAt: null }
          : { id: inv.id, status: 'sent', dueReminderSentAt: null },
      data:
        stage === 'overdue'
          ? { overdueReminderSentAt: stamp, dueReminderSentAt: inv.dueReminderSentAt ?? stamp }
          : { dueReminderSentAt: stamp },
    });
    if (count === 0) continue;

    const result = await sendInvoiceReminderEmail(inv.id, stage);
    if (result?.ok) {
      sent++;
    } else {
      // Put it back exactly as it was, so the next run retries.
      await prisma.invoice.update({
        where: { id: inv.id },
        data:
          stage === 'overdue'
            ? { overdueReminderSentAt: null, dueReminderSentAt: inv.dueReminderSentAt }
            : { dueReminderSentAt: null },
      });
      failed++;
    }
  }

  return { considered, sent, failed };
}
