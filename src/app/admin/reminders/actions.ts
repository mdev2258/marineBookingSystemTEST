'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { generateRebookToken } from '@/lib/reference';
import { sendServiceReminderEmail } from '@/lib/notifications';
import { sweepDueWork } from '@/lib/due-work';

/**
 * Send the ticked ones. One button, many owners.
 *
 * Each reminder is handled on its own and stamped `sent` only AFTER its email
 * goes -- so a provider hiccup halfway down the list leaves the rest
 * `upcoming` and retryable, instead of silently marking eight owners as asked
 * when only three were. The same rule the yard's reminder cron always used.
 *
 * The token is minted in the WHERE-guarded update, so ticking the same boat in
 * two tabs cannot mint two links or send two emails.
 */
export async function sendReminderBatch(formData: FormData): Promise<void> {
  await requireAdmin();

  const ids = formData.getAll('reminderId').map(String).filter(Boolean);
  if (ids.length === 0) redirect('/admin/reminders?error=none');

  let sent = 0;
  let failed = 0;

  for (const id of ids) {
    const token = generateRebookToken();

    // Claim it. Only an upcoming reminder with no link yet can be claimed.
    const { count } = await prisma.reminder.updateMany({
      where: { id, status: 'upcoming', token: null },
      data: { token },
    });
    if (count === 0) continue;

    const result = await sendServiceReminderEmail(id);

    if (result?.ok) {
      await prisma.reminder.update({
        where: { id },
        data: { status: 'sent', sentAt: new Date() },
      });
      sent++;
    } else {
      // Put it back exactly as it was, so the next attempt is clean.
      await prisma.reminder.update({ where: { id }, data: { token: null } });
      failed++;
    }
  }

  revalidatePath('/admin/reminders');
  redirect(`/admin/reminders?sent=${sent}&failed=${failed}`);
}

/**
 * Not this time. A dismissed reminder does not come back tonight, but it is not
 * a permanent "never" either: next year the rigging is a year older and it is
 * a fair question again (see sweepDueWork).
 */
export async function dismissReminder(id: string): Promise<void> {
  await requireAdmin();

  await prisma.reminder.updateMany({
    where: { id, status: 'upcoming' },
    data: { status: 'dismissed' },
  });

  revalidatePath('/admin/reminders');
  redirect('/admin/reminders');
}

/** Run tonight's sweep now, from the screen. Same function the cron calls. */
export async function sweepNow(): Promise<void> {
  await requireAdmin();
  const result = await sweepDueWork();
  revalidatePath('/admin/reminders');
  redirect(`/admin/reminders?swept=${result.created}`);
}
