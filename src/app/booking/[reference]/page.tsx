import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { balancePence, formatPence } from '@/lib/money';
import { BOOKING_STATUS_LABEL, type BookingStatus } from '@/lib/enums';
import { formatDateLong, formatTimeRange, minutesUntil } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your booking — Harbourside Sailing' };

/** The reference is the key customers actually have, from their email. */
export default async function BookingPage(props: PageProps<'/booking/[reference]'>) {
  const { reference } = await props.params;

  const booking = await prisma.booking.findUnique({
    where: { reference: reference.toUpperCase() },
    include: {
      customer: true,
      session: { include: { sessionType: true, cancellation: true } },
    },
  });
  if (!booking) notFound();

  const balance = balancePence(booking.totalPence, booking.depositPence);
  const cancelled = booking.session.status === 'cancelled';
  const holdMinutes = booking.expiresAt ? minutesUntil(booking.expiresAt) : 0;

  // "Deposit paid" under "Status: Awaiting payment" is a contradiction the
  // customer is right to distrust. Only say paid when it actually was.
  const settled = !['pending_payment', 'expired'].includes(booking.status);
  const depositLabel = settled
    ? 'Deposit paid'
    : booking.status === 'expired'
      ? 'Deposit (never paid)'
      : 'Deposit to pay';

  return (
    <PublicShell width="narrow">
      <p className="text-sm text-slate-600">Booking reference</p>
      <h1 className="text-2xl font-semibold tracking-tight">{booking.reference}</h1>

      {cancelled && (
        <div className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-900">This session was cancelled</p>
          {booking.session.cancellation?.note && (
            <p className="mt-1 text-red-900">
              &ldquo;{booking.session.cancellation.note}&rdquo;
            </p>
          )}
          <p className="mt-2 text-red-900">
            Your deposit is safe.{' '}
            {booking.rebookToken
              ? 'Use the link in your email to pick a new date.'
              : 'We will be in touch with new dates.'}
          </p>
        </div>
      )}

      {booking.status === 'pending_payment' && holdMinutes > 0 && (
        <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          We&rsquo;re holding your place for another {holdMinutes} minutes while you pay.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 p-5">
        <p className="font-semibold">{booking.session.sessionType.name}</p>
        <p className="mt-0.5 text-slate-700">
          {formatDateLong(booking.session.startsAt)} ·{' '}
          {formatTimeRange(booking.session.startsAt, booking.session.endsAt)}
        </p>

        <hr className="my-4 border-slate-200" />

        <dl className="space-y-2">
          <Row label="Name" value={booking.customer.name} />
          <Row
            label="Party size"
            value={`${booking.partySize} ${booking.partySize === 1 ? 'person' : 'people'}`}
          />
          <Row label="Status" value={BOOKING_STATUS_LABEL[booking.status as BookingStatus]} />
          <Row label="Total" value={formatPence(booking.totalPence)} />
          <Row label={depositLabel} value={formatPence(booking.depositPence)} />
          {settled && <Row label="Due on the day" value={formatPence(balance)} />}
        </dl>
      </div>

      <p className="mt-5 text-slate-700">
        Need to change something? Ring us on{' '}
        <a href="tel:01590000000" className="text-brand-700 underline">
          01590 000000
        </a>
        .
      </p>

      <Link href="/book" className="mt-6 inline-block text-brand-700 underline">
        See what else is on
      </Link>
    </PublicShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
