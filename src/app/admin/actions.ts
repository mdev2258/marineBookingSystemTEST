'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  credentialsAreValid,
  revokeAdminToken,
  signAdminToken,
  verifyAdminToken,
} from '@/lib/auth';
import { sendReminders } from '@/lib/reminders';
import { yardOnly } from '@/lib/features';

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

// ponytail: in-memory, per-process failed-login counter keyed by client IP.
// Each serverless instance / restart starts from zero, and the IP comes from
// x-forwarded-for, which is only trustworthy behind a proxy that sets it (as
// Vercel does). Upgrade path: a shared store (Redis/Postgres) keyed by IP and
// username. FREE_ATTEMPTS failures, then a lockout that doubles each time.
const FREE_ATTEMPTS = 5;
const MAX_LOCK_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; lockedUntil: number }>();

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

export async function adminLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '');

  const ip = await clientIp();
  const record = failures.get(ip);
  if (record && record.lockedUntil > Date.now()) {
    return { error: 'Too many attempts. Wait a few minutes and try again.', username };
  }

  if (!credentialsAreValid(username, password)) {
    const count = (record?.count ?? 0) + 1;
    const lockMs = count > FREE_ATTEMPTS ? Math.min(1000 * 2 ** (count - FREE_ATTEMPTS), MAX_LOCK_MS) : 0;
    if (failures.size > 10_000) failures.clear(); // bound memory under a spray from many IPs
    failures.set(ip, { count, lockedUntil: Date.now() + lockMs });
    // One message for both cases: naming which half was wrong tells an attacker
    // when they have found a real username.
    // The username comes back so React 19's post-action form reset does not
    // clear it; the password deliberately does not.
    return { error: 'Those details were not recognised.', username };
  }

  failures.delete(ip);
  const store = await cookies();
  store.set(ADMIN_COOKIE, await signAdminToken(username), adminCookieOptions());

  // `next` arrives from the query string, so it is attacker-controlled. Only a
  // path inside /admin is allowed through; anything else is an open redirect.
  const target = next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
  redirect(target);
}

export async function adminLogout(): Promise<void> {
  const store = await cookies();
  await revokeAdminToken(store.get(ADMIN_COOKIE)?.value);
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
  yardOnly(); // its only button is on the parked /admin/sessions screen
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
  yardOnly();
  await requireAdmin();
  if (typeof bookingId !== 'string' || !bookingId) throw new Error('Job not found.');
  if (status !== 'completed' && status !== 'no_show') throw new Error('That job cannot be marked.');

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
