import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { formatPence } from '@/lib/money';
import { BOOKING_STATUS_LABEL, type BookingStatus } from '@/lib/enums';
import { formatDateLong, formatTimeRange, minutesUntil } from '@/lib/time';
import { yardOnly } from '@/lib/features';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your job — Harbourside Marine' };

/** The reference is the key customers actually have, from their email. */
export default async function BookingPage(props: PageProps<'/booking/[reference]'>) {
  yardOnly();
  const { reference } = await props.params;

  const booking = await prisma.booking.findUnique({
    where: { reference: reference.toUpperCase() },
    include: {
      customer: true,
      vessel: true,
      session: { include: { sessionType: true, cancellation: true } },
    },
  });
  // A job with no boat or owner is an unsorted jot, which has no public page.
  if (!booking || !booking.vessel || !booking.customer) notFound();

  const cancelled = booking.session?.status === 'cancelled';
  const holdMinutes = booking.expiresAt ? minutesUntil(booking.expiresAt) : 0;

  const quoted = booking.quotedPence;
  const deposit = booking.depositPence;
  const balance = quoted != null ? Math.max(0, quoted - (deposit ?? 0)) : null;

  // A deposit only exists once a quote has been accepted, so nothing here may
  // say "paid" before that has happened.
  const depositSettled = ['paid', 'completed', 'no_show', 'awaiting_rebook'].includes(
    booking.status,
  );

  return (
    <PublicShell width="narrow">
      <p className="text-sm text-neutral-600">Reference</p>
      <h1 className="text-2xl font-semibold tracking-tight">{booking.reference}</h1>
      <p className="mt-1 text-lg font-medium">{booking.vessel.name}</p>

      {cancelled && (
        <div className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-900">We had to call this off</p>
          {booking.session?.cancellation?.note && (
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

      {booking.status === 'enquiry' && (
        <p className="mt-5 rounded-lg border border-brand-200 bg-brand-50 p-4 text-brand-800">
          We have your request and we&rsquo;re working out a price. Nothing is booked and nothing
          is owed yet.
        </p>
      )}

      {booking.status === 'quoted' && (
        <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          Your quote is with you — check your email to accept it. The slot isn&rsquo;t held until
          you do.
        </p>
      )}

      {booking.status === 'pending_payment' && holdMinutes > 0 && (
        <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          We&rsquo;re holding the slot for another {holdMinutes} minutes while the deposit goes
          through.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-divider p-5">
        {booking.session ? (
          <>
            <p className="font-semibold">{booking.session.sessionType.name}</p>
            <p className="mt-0.5 text-neutral-700">
              {formatDateLong(booking.session.startsAt)} ·{' '}
              {formatTimeRange(booking.session.startsAt, booking.session.endsAt)}
            </p>
            {booking.session.notes && (
              <p className="mt-0.5 font-medium text-brand-700">{booking.session.notes}</p>
            )}
          </>
        ) : (
          <p className="font-semibold">Not yet scheduled</p>
        )}

        <hr className="my-4 border-divider" />

        <dl className="space-y-2">
          <Row
            label="Vessel"
            value={[
              booking.vessel.name,
              booking.vessel.make,
              booking.vessel.lengthMetres ? `${booking.vessel.lengthMetres}m` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <Row label="Owner" value={booking.customer.name} />
          <Row label="Status" value={BOOKING_STATUS_LABEL[booking.status as BookingStatus]} />
          <Row label="Quote" value={quoted != null ? formatPence(quoted) : 'To be confirmed'} />
          {deposit != null && (
            <Row
              label={depositSettled ? 'Deposit paid' : 'Deposit due'}
              value={formatPence(deposit)}
            />
          )}
          {depositSettled && balance != null && (
            <Row label="Due on completion" value={formatPence(balance)} />
          )}
        </dl>

        {booking.requestNotes && (
          <>
            <hr className="my-4 border-divider" />
            <p className="text-sm text-neutral-600">What you asked for</p>
            <p className="mt-1 whitespace-pre-wrap text-neutral-800">{booking.requestNotes}</p>
          </>
        )}

        {booking.quoteNotes && (
          <>
            <hr className="my-4 border-divider" />
            <p className="text-sm text-neutral-600">What the quote covers</p>
            <p className="mt-1 whitespace-pre-wrap text-neutral-800">{booking.quoteNotes}</p>
          </>
        )}
      </div>

      <p className="mt-5 text-neutral-700">
        Need to change something? Ring us on{' '}
        <a href="tel:01590000000" className="text-brand-700 underline">
          01590 000000
        </a>
        .
      </p>

      <Link href="/book" className="mt-6 inline-block text-brand-700 underline">
        See the yard diary
      </Link>
    </PublicShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
