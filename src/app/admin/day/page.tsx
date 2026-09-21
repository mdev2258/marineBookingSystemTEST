import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { AttendanceButtons } from '@/components/admin/attendance-buttons';
import { placesTakenBySession, spacesLeftFrom } from '@/lib/availability';
import { formatPence } from '@/lib/money';
import {
  addDays,
  formatLondonDateString,
  formatTimeRange,
  londonDayBounds,
  minutesUntil,
  todayInLondon,
} from '@/lib/time';

// Without this a prospect can be shown a cached "1 space left" after the last
// place has gone.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Day view — Harbourside Marine' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Statuses worth showing the yard. A lapsed hold or a declined quote is noise. */
const VISIBLE = ['paid', 'completed', 'no_show', 'pending_payment', 'awaiting_rebook'] as const;

export default async function DayPage(props: PageProps<'/admin/day'>) {
  const params = await props.searchParams;
  const raw = typeof params.date === 'string' ? params.date : '';
  const date = DATE_RE.test(raw) ? raw : todayInLondon();

  const { start, end } = londonDayBounds(date);
  // A well-formed but impossible date (2026-13-45) parses to Invalid Date and
  // would otherwise reach Prisma as one.
  if (Number.isNaN(start.getTime())) notFound();

  const now = new Date();

  const sessions = await prisma.session.findMany({
    where: { startsAt: { gte: start, lt: end } },
    orderBy: { startsAt: 'asc' },
    include: {
      sessionType: true,
      cancellation: true,
      bookings: {
        where: { status: { in: [...VISIBLE] } },
        orderBy: { createdAt: 'asc' },
        include: { customer: true, vessel: true },
      },
    },
  });

  // One grouped query rather than one per card: this screen is opened on a
  // phone with one bar of signal.
  const taken = await placesTakenBySession(sessions.map((s) => s.id), now);
  const isToday = date === todayInLondon();

  return (
    <AdminShell>
      <div className="sticky top-0 z-10 -mx-4 border-b border-divider bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/admin/day?date=${addDays(date, -1)}`}
            aria-label="Previous day"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-neutral-300 text-2xl font-semibold hover:bg-neutral-100"
          >
            &lsaquo;
          </Link>

          <div className="min-w-0 text-center">
            <p className="truncate font-semibold tracking-tight">{formatLondonDateString(date)}</p>
            {!isToday && (
              <Link
                href={`/admin/day?date=${todayInLondon()}`}
                className="text-sm text-brand-700 underline"
              >
                Back to today
              </Link>
            )}
          </div>

          <Link
            href={`/admin/day?date=${addDays(date, 1)}`}
            aria-label="Next day"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-neutral-300 text-2xl font-semibold hover:bg-neutral-100"
          >
            &rsaquo;
          </Link>
        </div>
      </div>

      {sessions.length === 0 && (
        <p className="py-16 text-center text-neutral-600">Nothing in the yard today.</p>
      )}

      <div className="space-y-6 pt-6">
        {sessions.map((session) => {
          const places = taken.get(session.id) ?? 0;
          const left = spacesLeftFrom(session.capacity, places);
          const cancelled = session.status === 'cancelled';

          return (
            <section
              key={session.id}
              className={`rounded-lg border ${cancelled ? 'border-red-300 bg-red-50' : 'border-divider'}`}
            >
              <div className="border-b border-inherit p-4">
                <h2 className="text-lg font-semibold tracking-tight">
                  {formatTimeRange(session.startsAt, session.endsAt)}
                </h2>
                <p className="mt-0.5 text-neutral-700">{session.sessionType.name}</p>
                {session.notes && (
                  <p className="mt-0.5 text-sm font-medium text-brand-700">{session.notes}</p>
                )}

                <p className="mt-2 text-sm font-medium">
                  {cancelled ? (
                    <span className="text-red-800">
                      Cancelled
                      {session.cancellation?.note ? ` — ${session.cancellation.note}` : ''}
                    </span>
                  ) : (
                    <span className="text-neutral-700">
                      {places} of {session.capacity} booked
                      {left > 0 ? ` · ${left} space${left === 1 ? '' : 's'} left` : ' · full'}
                    </span>
                  )}
                </p>

                <Link
                  href={`/admin/sessions/${session.id}`}
                  className="mt-2 inline-block text-sm text-brand-700 underline"
                >
                  Edit slot
                </Link>
              </div>

              {session.bookings.length === 0 ? (
                <p className="p-4 text-neutral-600">Nothing booked in.</p>
              ) : (
                <ul className="divide-y divide-divider">
                  {session.bookings.map((booking) => {
                    const markable =
                      booking.status === 'paid' ||
                      booking.status === 'completed' ||
                      booking.status === 'no_show';
                    const holdMinutes = booking.expiresAt ? minutesUntil(booking.expiresAt, now) : 0;

                    // A lapsed hold has already stopped holding a place; showing
                    // it as live would contradict the count above.
                    if (booking.status === 'pending_payment' && holdMinutes <= 0) return null;

                    return (
                      <li key={booking.id} className="p-4">
                        {/* Vessel first: the yard thinks in boats, not owners. */}
                        <p className="font-semibold">{booking.vessel.name}</p>
                        <p className="text-sm text-neutral-700">
                          {[
                            booking.vessel.make,
                            booking.vessel.lengthMetres ? `${booking.vessel.lengthMetres}m` : null,
                            booking.vessel.keelType ? `${booking.vessel.keelType} keel` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {booking.vessel.berth && (
                          <p className="text-sm text-neutral-600">{booking.vessel.berth}</p>
                        )}

                        <p className="mt-2 text-sm font-medium">{booking.customer.name}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          {booking.customer.phone && (
                            <a
                              href={`tel:${booking.customer.phone.replace(/\s/g, '')}`}
                              className="text-brand-700 underline"
                            >
                              {booking.customer.phone}
                            </a>
                          )}
                          <a
                            href={`mailto:${booking.customer.email}`}
                            className="truncate text-brand-700 underline"
                          >
                            {booking.customer.email}
                          </a>
                        </p>

                        <p className="mt-1 text-sm text-neutral-500">
                          {booking.reference}
                          {booking.quotedPence != null ? ` · ${formatPence(booking.quotedPence)}` : ''}
                        </p>

                        {booking.status === 'pending_payment' && (
                          <p className="mt-2 text-sm font-medium text-amber-800">
                            Holding the slot — deposit due, expires in {holdMinutes} min
                          </p>
                        )}
                        {booking.status === 'awaiting_rebook' && (
                          <p className="mt-2 text-sm font-medium text-neutral-700">Awaiting rebook</p>
                        )}

                        {markable && (
                          <AttendanceButtons
                            bookingId={booking.id}
                            status={booking.status as 'paid' | 'completed' | 'no_show'}
                            vesselName={booking.vessel.name}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </AdminShell>
  );
}
