import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { verifyAndMarkPaid } from '@/lib/payments';
import { formatPence } from '@/lib/money';
import { formatDateLong, formatTimeRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Deposit received — Harbourside Marine' };

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
          Back to the yard diary
        </Link>
      </PublicShell>
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { reference: result.bookingReference },
    include: {
      customer: true,
      vessel: true,
      session: { include: { sessionType: true } },
    },
  });
  if (!booking) return null;

  const deposit = booking.depositPence ?? 0;
  const balance = Math.max(0, (booking.quotedPence ?? 0) - deposit);

  return (
    <PublicShell width="narrow">
      <p className="font-semibold text-emerald-700">Deposit received</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {booking.vessel.name} is booked in
      </h1>
      <p className="mt-3 text-slate-700">
        We&rsquo;ve emailed your confirmation to {booking.customer.email}.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 p-5">
        <p className="text-sm text-slate-600">Your reference</p>
        <p className="text-2xl font-semibold tracking-tight">{booking.reference}</p>

        <hr className="my-4 border-slate-200" />

        {booking.session ? (
          <>
            <p className="font-semibold">{booking.session.sessionType.name}</p>
            <p className="mt-0.5 text-slate-700">
              {formatDateLong(booking.session.startsAt)} ·{' '}
              {formatTimeRange(booking.session.startsAt, booking.session.endsAt)}
            </p>
            {booking.session.notes && (
              <p className="mt-0.5 font-medium text-brand-700">{booking.session.notes}</p>
            )}
          </>
        ) : (
          <p className="text-slate-700">We will confirm a date with you shortly.</p>
        )}

        <p className="mt-3 text-slate-700">
          Deposit paid {formatPence(deposit)} · {formatPence(balance)} due on completion
        </p>
      </div>

      <p className="mt-5 text-slate-700">
        Please clear the cockpit and side decks, and make sure we can get to her.
      </p>

      <Link
        href={`/booking/${booking.reference}`}
        className="mt-6 inline-block text-brand-700 underline"
      >
        View this job
      </Link>
    </PublicShell>
  );
}
