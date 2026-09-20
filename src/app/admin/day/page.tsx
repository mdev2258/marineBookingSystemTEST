import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { AttendanceButtons } from '@/components/admin/attendance-buttons';
import { seatsTakenBySession, spacesLeftFrom } from '@/lib/availability';
import { formatPenceShort } from '@/lib/money';
import {
  addDays,
  formatLondonDateString,
  formatTimeRange,
  londonDayBounds,
  minutesUntil,
  todayInLondon,
} from '@/lib/time';

// Without this a prospect can be shown a cached "3 spaces left" after the last
// seat has gone.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Day view — Harbourside Sailing' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Statuses worth showing a skipper. An expired hold or a refunded cancellation is noise. */
const VISIBLE = ['paid', 'attended', 'no_show', 'pending_payment', 'awaiting_rebook'] as const;

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
        include: { customer: true },
      },
    },
  });

  // One grouped query rather than one per card: this screen is opened on a
  // phone with one bar of signal.
  const taken = await seatsTakenBySession(sessions.map((s) => s.id), now);
  const isToday = date === todayInLondon();

  return (
    <AdminShell>
      <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/admin/day?date=${addDays(date, -1)}`}
            aria-label="Previous day"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-slate-300 text-2xl font-semibold hover:bg-slate-50"
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
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-slate-300 text-2xl font-semibold hover:bg-slate-50"
          >
            &rsaquo;
          </Link>
        </div>
      </div>

      {sessions.length === 0 && (
        <p className="py-16 text-center text-slate-600">Nothing on the water today.</p>
      )}

      <div className="space-y-6 pt-6">
        {sessions.map((session) => {
          const seats = taken.get(session.id) ?? 0;
          const left = spacesLeftFrom(session.capacity, seats);
          const cancelled = session.status === 'cancelled';

          return (
            <section
              key={session.id}
              className={`rounded-lg border ${cancelled ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
            >
              <div className="border-b border-inherit p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {formatTimeRange(session.startsAt, session.endsAt)}
                  </h2>
                  <span className="text-sm font-medium text-slate-600">
                    {formatPenceShort(session.pricePerPersonPence)} pp
                  </span>
                </div>
                <p className="mt-0.5 text-slate-700">{session.sessionType.name}</p>

                <p className="mt-2 text-sm font-medium">
                  {cancelled ? (
                    <span className="text-red-800">
                      Cancelled
                      {session.cancellation?.note ? ` — ${session.cancellation.note}` : ''}
                    </span>
                  ) : (
                    <span className="text-slate-700">
                      {seats} of {session.capacity} booked
                      {left > 0 ? ` · ${left} space${left === 1 ? '' : 's'} left` : ' · full'}
                    </span>
                  )}
                </p>

                <Link
                  href={`/admin/sessions/${session.id}`}
                  className="mt-2 inline-block text-sm text-brand-700 underline"
                >
                  Edit session
                </Link>
              </div>

              {session.bookings.length === 0 ? (
                <p className="p-4 text-slate-600">No bookings yet.</p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {session.bookings.map((booking) => {
                    const markable =
                      booking.status === 'paid' ||
                      booking.status === 'attended' ||
                      booking.status === 'no_show';
                    const holdMinutes = booking.expiresAt ? minutesUntil(booking.expiresAt, now) : 0;

                    // A lapsed hold has already stopped holding a seat; showing
                    // it as live would contradict the count above.
                    if (booking.status === 'pending_payment' && holdMinutes <= 0) return null;

                    return (
                      <li key={booking.id} className="p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <p className="font-semibold">{booking.customer.name}</p>
                          <p className="text-sm font-medium text-slate-700">
                            {booking.partySize} {booking.partySize === 1 ? 'person' : 'people'}
                          </p>
                        </div>

                        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
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

                        <p className="mt-1 text-sm text-slate-500">{booking.reference}</p>

                        {booking.status === 'pending_payment' && (
                          <p className="mt-2 text-sm font-medium text-amber-800">
                            Holding a seat — expires in {holdMinutes} min
                          </p>
                        )}
                        {booking.status === 'awaiting_rebook' && (
                          <p className="mt-2 text-sm font-medium text-slate-700">
                            Awaiting rebook
                          </p>
                        )}

                        {markable && (
                          <AttendanceButtons
                            bookingId={booking.id}
                            status={booking.status as 'paid' | 'attended' | 'no_show'}
                            name={booking.customer.name}
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
