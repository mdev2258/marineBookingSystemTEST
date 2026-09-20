import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { verifyAndMarkPaid } from '@/lib/payments';
import { formatPence } from '@/lib/money';
import { formatDateLong, formatTimeRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Booking confirmed — Harbourside Sailing' };

/**
 * Stripe's success_url lands here with ?cs={CHECKOUT_SESSION_ID}. The demo stub
 * has no Checkout Session to quote, so it sends ?ref= instead and
 * verifyAndMarkPaid resolves on either. When the specialist swaps the stub out,
 * only that function changes -- this page does not.
 *
 * Safe to refresh: marking paid is a status-predicated updateMany, so the
 * second call matches zero rows and sends no second confirmation email.
 */
export default async function ConfirmationPage(props: PageProps<'/book/confirmation'>) {
  const params = await props.searchParams;
  const cs = typeof params.cs === 'string' ? params.cs : null;
  const ref = typeof params.ref === 'string' ? params.ref : null;

  const key = cs ?? ref;
  const result = key ? await verifyAndMarkPaid(key) : null;

  if (!result) {
    return (
      <PublicShell width="narrow">
        <h1 className="text-2xl font-semibold tracking-tight">We couldn&rsquo;t find that payment</h1>
        <p className="mt-3 text-slate-700">
          If you have been charged, your confirmation email will still arrive. Give us a ring on
          01590 000000 and we will check.
        </p>
        <Link href="/book" className="mt-6 inline-block text-brand-700 underline">
          Back to what&rsquo;s on
        </Link>
      </PublicShell>
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { reference: result.bookingReference },
    include: { customer: true, session: { include: { sessionType: true } } },
  });
  if (!booking) return null;

  const balance = Math.max(0, booking.totalPence - booking.depositPence);

  return (
    <PublicShell width="narrow">
      <p className="font-semibold text-emerald-700">Deposit received</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        You&rsquo;re booked in, {booking.customer.name.split(' ')[0]}
      </h1>
      <p className="mt-3 text-slate-700">
        We&rsquo;ve emailed your confirmation to {booking.customer.email}.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 p-5">
        <p className="text-sm text-slate-600">Your reference</p>
        <p className="text-2xl font-semibold tracking-tight">{booking.reference}</p>

        <hr className="my-4 border-slate-200" />

        <p className="font-semibold">{booking.session.sessionType.name}</p>
        <p className="mt-0.5 text-slate-700">
          {formatDateLong(booking.session.startsAt)} ·{' '}
          {formatTimeRange(booking.session.startsAt, booking.session.endsAt)}
        </p>
        <p className="mt-2 text-slate-700">
          {booking.partySize} {booking.partySize === 1 ? 'person' : 'people'} · deposit paid{' '}
          {formatPence(booking.depositPence)} · {formatPence(balance)} due on the day
        </p>
      </div>

      <p className="mt-5 text-slate-700">Please arrive 15 minutes before your start time.</p>

      <Link
        href={`/booking/${booking.reference}`}
        className="mt-6 inline-block text-brand-700 underline"
      >
        View your booking
      </Link>
    </PublicShell>
  );
}
