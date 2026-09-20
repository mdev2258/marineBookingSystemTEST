import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { QuoteAccept } from '@/components/quote-accept';
import { depositPence, formatPence } from '@/lib/money';
import { formatDateLong, formatTimeRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your quote — Harbourside Marine' };

export default async function QuotePage(props: PageProps<'/quote/[token]'>) {
  const { token } = await props.params;

  const booking = await prisma.booking.findFirst({
    where: { quoteToken: token, status: 'quoted' },
    include: {
      customer: true,
      vessel: true,
      session: { include: { sessionType: true } },
    },
  });

  // Covers a spent link, a mistyped one, and a quote already answered.
  // Deliberately says nothing about which: the token is the only credential.
  if (!booking || booking.quotedPence == null || !booking.session) {
    return (
      <PublicShell width="narrow">
        <h1 className="text-2xl font-semibold tracking-tight">This quote has been answered</h1>
        <p className="mt-3 text-slate-700">
          If you have already accepted it, check your inbox for the confirmation. Otherwise give us
          a ring on 01590 000000 and we will send it again.
        </p>
      </PublicShell>
    );
  }

  // Shown, not stored. The figure is computed for real when they accept.
  const deposit = depositPence(
    booking.quotedPence,
    booking.session.sessionType.depositPercent,
  );
  const balance = Math.max(0, booking.quotedPence - deposit);

  return (
    <PublicShell width="narrow">
      <p className="text-sm text-slate-600">Quote for</p>
      <h1 className="text-2xl font-semibold tracking-tight">{booking.vessel.name}</h1>
      <p className="mt-1 text-slate-700">
        {[booking.vessel.make, booking.vessel.lengthMetres ? `${booking.vessel.lengthMetres}m` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 p-5">
        <p className="font-semibold">{booking.session.sessionType.name}</p>
        <p className="mt-0.5 text-slate-700">
          {formatDateLong(booking.session.startsAt)} ·{' '}
          {formatTimeRange(booking.session.startsAt, booking.session.endsAt)}
        </p>
        {booking.session.notes && (
          <p className="mt-0.5 font-medium text-brand-700">{booking.session.notes}</p>
        )}

        <hr className="my-4 border-slate-200" />

        <p className="text-4xl font-semibold tracking-tight">
          {formatPence(booking.quotedPence)}
        </p>
        <p className="mt-2 text-slate-700">
          {formatPence(deposit)} deposit to book her in · {formatPence(balance)} on completion
        </p>

        {booking.quoteNotes && (
          <>
            <hr className="my-4 border-slate-200" />
            <p className="text-sm text-slate-600">What that covers</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-800">{booking.quoteNotes}</p>
          </>
        )}
      </div>

      <div className="mt-6">
        <QuoteAccept token={token} depositLabel={formatPence(deposit)} />
      </div>

      <p className="mt-4 text-sm text-slate-600">
        The date above isn&rsquo;t held until you accept — if someone else takes it first we will
        find you another.
      </p>
    </PublicShell>
  );
}
