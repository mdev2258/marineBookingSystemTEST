'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  credentialsAreValid,
  signAdminToken,
  verifyAdminToken,
} from '@/lib/auth';
import { sendReminders } from '@/lib/reminders';

/**
 * src/proxy.ts already guards /admin/*, but a Server Action is a POST endpoint
 * in its own right and is reachable by anyone who knows its id. Every action
 * below re-checks the cookie itself rather than trusting the proxy -- the proxy
 * is a redirect for humans, not an authorisation boundary for requests.
 */
export async function requireAdmin(): Promise<void> {
  const store = await cookies();
  if (!(await verifyAdminToken(store.get(ADMIN_COOKIE)?.value))) {
    throw new Error('Not authorised.');
  }
}

export type LoginState = { error?: string; username?: string };

export async function adminLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '');

  if (!credentialsAreValid(username, password)) {
    // One message for both cases: naming which half was wrong tells an attacker
    // when they have found a real username.
    // The username comes back so React 19's post-action form reset does not
    // clear it; the password deliberately does not.
    return { error: 'Those details were not recognised.', username };
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, await signAdminToken(username), adminCookieOptions());

  // `next` arrives from the query string, so it is attacker-controlled. Only a
  // path inside /admin is allowed through; anything else is an open redirect.
  const target = next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
  redirect(target);
}

export async function adminLogout(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect('/admin/login');
}

export type ReminderActionState = { result?: { considered: number; sent: number; failed: number }; error?: string };

/**
 * The admin "send now" button runs the identical function as the cron, so what
 * the operator sees in a demo is exactly what happens at 17:00 unattended.
 */
export async function sendRemindersNow(
  _prev: ReminderActionState,
  _formData: FormData,
): Promise<ReminderActionState> {
  await requireAdmin();
  const result = await sendReminders();
  revalidatePath('/admin/sessions');
  return { result };
}

/**
 * Mark a job done, or the boat not ready, from the yard.
 *
 * Tapping the status a job already has clears it back to `paid`. That is
 * deliberate: this is used one-handed on a wet phone, and a mis-tap with no way
 * back would leave the day's record wrong with no obvious fix.
 */
export async function markAttendance(
  bookingId: string,
  status: 'completed' | 'no_show',
): Promise<void> {
  await requireAdmin();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  });
  if (!booking) throw new Error('Job not found.');

  // Only a job that has actually been paid for and scheduled can be marked. An
  // enquiry, a quote or a lapsed hold has no outcome to record.
  if (!['paid', 'completed', 'no_show'].includes(booking.status)) {
    throw new Error('That job cannot be marked.');
  }

  const clearing = booking.status === status;
  const now = new Date();

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: clearing ? 'paid' : status,
      attendanceMarkedAt: clearing ? null : now,
      completedAt: !clearing && status === 'completed' ? now : null,
    },
  });

  revalidatePath('/admin/day');
  revalidatePath('/admin/sessions');
}
