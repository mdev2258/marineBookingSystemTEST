import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { ReminderButton } from '@/components/admin/reminder-button';
import { placesTakenBySession, spacesLeftFrom } from '@/lib/availability';
import { addDays, formatDateShort, formatTimeRange, londonDayBounds, todayInLondon } from '@/lib/time';
import { yardOnly } from '@/lib/features';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Diary — Harbourside Marine Services' };

export default async function SessionsPage() {
  yardOnly();
  const now = new Date();

  const sessions = await prisma.session.findMany({
    where: { startsAt: { gte: now } },
    orderBy: { startsAt: 'asc' },
    include: { sessionType: true },
  });

  const taken = await placesTakenBySession(sessions.map((s) => s.id), now);

  // Same predicate the cron uses, so the count and the button agree.
  const tomorrow = londonDayBounds(addDays(todayInLondon(now), 1));
  const dueReminders = await prisma.booking.count({
    where: {
      status: 'paid',
      reminderSentAt: null,
      session: { status: 'scheduled', startsAt: { gte: tomorrow.start, lt: tomorrow.end } },
    },
  });

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">The diary</h1>
        <Link
          href="/admin/sessions/new"
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700"
        >
          Open a slot
        </Link>
      </div>

      <div className="mb-6">
        <ReminderButton due={dueReminders} />
      </div>

      {sessions.length === 0 ? (
        <p className="py-12 text-center text-neutral-600">Nothing scheduled yet.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const seats = taken.get(session.id) ?? 0;
            const left = spacesLeftFrom(session.capacity, seats);
            const cancelled = session.status === 'cancelled';
            // Full bar on a cancelled session would read as a healthy sell-out.
            const fill = session.capacity > 0 ? Math.min(100, (seats / session.capacity) * 100) : 0;

            return (
              <li key={session.id}>
                <Link
                  href={`/admin/sessions/${session.id}`}
                  className={`block rounded-lg border p-4 hover:border-brand-500 ${
                    cancelled ? 'border-red-300 bg-red-50' : 'border-divider'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-semibold">
                      {formatDateShort(session.startsAt)} ·{' '}
                      {formatTimeRange(session.startsAt, session.endsAt)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-neutral-700">{session.sessionType.name}</p>
                  {session.notes && (
                    <p className="mt-0.5 text-sm font-medium text-brand-700">{session.notes}</p>
                  )}

                  {cancelled ? (
                    <p className="mt-2 text-sm font-semibold text-red-800">Cancelled</p>
                  ) : (
                    <>
                      <div
                        className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200"
                        role="presentation"
                      >
                        <div
                          className={`h-full ${left === 0 ? 'bg-red-600' : 'bg-brand-600'}`}
                          style={{ width: `${fill}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-sm text-neutral-700">
                        {seats} of {session.capacity} booked
                        {left === 0 ? ' · full' : ` · ${left} left`}
                      </p>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
