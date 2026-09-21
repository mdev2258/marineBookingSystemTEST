import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { SessionForm } from '@/components/admin/session-form';
import { updateSession } from '@/app/admin/sessions/actions';
import { placesTaken, spacesLeftFrom } from '@/lib/availability';
import { formatPence } from '@/lib/money';
import { BOOKING_STATUS_LABEL, CANCELLATION_REASON_LABEL, type BookingStatus, type CancellationReason } from '@/lib/enums';
import { formatDateLong, formatTime, formatTimeRange, londonDateString } from '@/lib/time';
import { yardOnly } from '@/lib/features';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Slot — Harbourside Marine' };

export default async function SessionDetailPage(props: PageProps<'/admin/sessions/[id]'>) {
  yardOnly();
  const { id } = await props.params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      sessionType: true,
      cancellation: true,
      bookings: {
        orderBy: { createdAt: 'asc' },
        include: { customer: true, vessel: { include: { currentPlace: true } } },
      },
    },
  });
  if (!session) notFound();

  const [sessionTypes, taken] = await Promise.all([
    prisma.sessionType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    placesTaken(session.id),
  ]);

  const cancelled = session.status === 'cancelled';
  const left = spacesLeftFrom(session.capacity, taken);

  return (
    <AdminShell>
      <div className="py-6">
        <Link href="/admin/sessions" className="text-sm text-brand-700 underline">
          Back to the diary
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {session.sessionType.name}
        </h1>
        <p className="mt-1 text-neutral-700">
          {formatDateLong(session.startsAt)} · {formatTimeRange(session.startsAt, session.endsAt)}
        </p>
        {session.notes && <p className="mt-1 font-medium text-brand-700">{session.notes}</p>}
        <p className="mt-1 text-neutral-700">
          {taken} of {session.capacity} booked{cancelled ? '' : left === 0 ? ' · full' : ` · ${left} left`}
        </p>
      </div>

      {cancelled ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <h2 className="font-semibold text-red-900">This slot is cancelled</h2>
          <p className="mt-1 text-red-900">
            Reason:{' '}
            {CANCELLATION_REASON_LABEL[
              (session.cancellation?.reason ?? 'other') as CancellationReason
            ]}
          </p>
          {session.cancellation?.note && (
            <p className="mt-1 text-red-900">&ldquo;{session.cancellation.note}&rdquo;</p>
          )}
          {/* Without this the notified/rebooked counter is unreachable for any
              session that was already cancelled, including the seeded one. */}
          <Link
            href={`/admin/sessions/${session.id}/cancel`}
            className="mt-3 inline-block font-semibold text-red-900 underline"
          >
            Who was notified, and who has rebooked
          </Link>
        </div>
      ) : (
        <>
          <SessionForm
            action={updateSession.bind(null, session.id)}
            mode="edit"
            sessionTypes={sessionTypes}
            submitLabel="Save changes"
            initial={{
              sessionTypeId: session.sessionTypeId,
              date: londonDateString(session.startsAt),
              time: formatTime(session.startsAt),
              capacity: session.capacity,
              notes: session.notes ?? '',
            }}
          />

          <div className="mt-10 rounded-lg border border-red-300 p-4">
            <h2 className="font-semibold">Blown out?</h2>
            <p className="mt-1 text-neutral-700">
              Cancelling emails every owner booked in and gives them a link to rebook. Their
              deposit moves with them.
            </p>
            <Link
              href={`/admin/sessions/${session.id}/cancel`}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-md border-2 border-red-700 px-5 font-semibold text-red-800 hover:bg-red-50 sm:w-auto"
            >
              Cancel this session
            </Link>
          </div>
        </>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">
        Booked in ({session.bookings.length})
      </h2>

      {session.bookings.length === 0 ? (
        <p className="rounded-lg border border-divider p-4 text-neutral-600">Nothing booked in.</p>
      ) : (
        <ul className="divide-y divide-divider rounded-lg border border-divider">
          {session.bookings.map((booking) => {
            // PARKED yard screen. A slot only ever held jobs with a boat and
            // an owner; a board-era jot has neither.
            if (!booking.vessel || !booking.customer) return null;

            return (
            <li key={booking.id} className="p-4">
              <p className="font-semibold">{booking.vessel.name}</p>
              <p className="text-sm text-neutral-700">
                {[
                  booking.vessel.make,
                  booking.vessel.lengthMetres ? `${booking.vessel.lengthMetres}m` : null,
                  booking.vessel.keelType ? `${booking.vessel.keelType} keel` : null,
                  booking.vessel.currentPlace?.shortName ?? null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

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
                <a href={`mailto:${booking.customer.email}`} className="truncate text-brand-700 underline">
                  {booking.customer.email}
                </a>
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {booking.reference} · {BOOKING_STATUS_LABEL[booking.status as BookingStatus]}
                {booking.depositPence != null
                  ? ` · deposit ${formatPence(booking.depositPence)}`
                  : ''}
              </p>
            </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
