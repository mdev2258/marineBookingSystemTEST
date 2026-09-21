import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { QuoteAccept } from '@/components/quote-accept';
import { Plate } from '@/components/ui/plate';
import { depositPence, formatPence } from '@/lib/money';
import { formatDateLong, formatTimeRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your quote — Harbourside Marine' };

/** Direction 2b-C. The estimate plate is the screen; everything else frames it. */
export default async function QuotePage(props: PageProps<'/quote/[token]'>) {
  const { token } = await props.params;

  const booking = await prisma.booking.findFirst({
    where: { quoteToken: token, status: 'quoted' },
    include: {
      customer: true,
      vessel: true,
      lineItems: { orderBy: { sortOrder: 'asc' } },
      session: { include: { sessionType: true } },
    },
  });

  // Covers a spent link, a mistyped one, and a quote already answered.
  // Deliberately says nothing about which: the token is the only credential.
  if (
    !booking ||
    booking.quotedPence == null ||
    !booking.session ||
    !booking.vessel ||
    !booking.customer
  ) {
    return (
      <PublicShell width="narrow">
        <h1 className="text-3xl">This quote has been answered</h1>
        <p className="muted mt-3">
          If you have already accepted it, check your inbox for the confirmation. Otherwise give us
          a ring on 01590 000000 and we will send it again.
        </p>
      </PublicShell>
    );
  }

  // Shown, not stored. The figure is computed for real when they accept.
  const deposit = depositPence(booking.quotedPence, booking.session.sessionType.depositPercent);
  const balance = Math.max(0, booking.quotedPence - deposit);

  return (
    <PublicShell width="narrow">
      <p className="k text-accent-700">
        {booking.vessel.name} · Quote {booking.reference}
      </p>
      <h1 className="mt-1.5 text-[28px]">{booking.session.sessionType.name}</h1>
      <p className="muted mt-1.5 text-[13px]">
        {[booking.vessel.make, booking.vessel.lengthMetres ? `${booking.vessel.lengthMetres}m` : null]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {/* When she is booked in for. The yard picks the tide; the owner accepts it. */}
      <Plate className="mt-6 p-3.5">
        <p className="k text-accent-700">The slot we are holding for you</p>
        <p className="mt-2 font-condensed text-[21px] leading-none">
          {formatDateLong(booking.session.startsAt)}
        </p>
        <p className="muted mt-1.5 text-[13px]">
          {formatTimeRange(booking.session.startsAt, booking.session.endsAt)}
          {booking.session.notes ? ` · ${booking.session.notes}` : ''}
        </p>
      </Plate>

      <Plate className="mt-3.5 p-3.5">
        <p className="k text-accent-700">Estimate</p>

        <div className="mt-3 space-y-[7px]">
          {booking.lineItems.length > 0 ? (
            booking.lineItems.map((line) => (
              <div key={line.id} className="flex items-baseline gap-2 text-[13.5px]">
                <span className="flex-1 pr-2.5">{line.description}</span>
                <span className="muted w-14 shrink-0 text-[12.5px]">{line.qty === 1 ? '—' : line.qty}</span>
                <span className="shrink-0 font-semibold">{formatPence(line.amountPence)}</span>
              </div>
            ))
          ) : (
            <p className="muted text-[13.5px]">{booking.session.sessionType.name}</p>
          )}
        </div>

        <div className="mt-3 border-t border-divider pt-3">
          <div className="flex items-baseline justify-between">
            <span className="font-condensed text-[18px] font-semibold">Total</span>
            <span className="numeric text-[22px]">{formatPence(booking.quotedPence)}</span>
          </div>
          <p className="muted mt-2 text-[12px]">
            {booking.session.sessionType.depositPercent}% deposit to book her in, balance on
            completion. Work is scheduled once the deposit clears.
          </p>
        </div>
      </Plate>

      {booking.quoteNotes && (
        <Plate className="mt-3.5 p-3.5">
          <p className="k text-accent-700">What that covers</p>
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-[1.55]">
            {booking.quoteNotes}
          </p>
        </Plate>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2 text-center">
        <Plate className="p-2.5">
          <p className="k muted">Deposit now</p>
          <p className="numeric mt-1.5 text-[20px]">{formatPence(deposit)}</p>
        </Plate>
        <Plate className="p-2.5">
          <p className="k muted">On completion</p>
          <p className="numeric mt-1.5 text-[20px]">{formatPence(balance)}</p>
        </Plate>
      </div>

      <div className="mt-6">
        <QuoteAccept token={token} depositLabel={formatPence(deposit)} />
      </div>

      <p className="muted mt-4 text-[12px]">
        The date above isn&rsquo;t held until you accept — if someone else takes it first we will
        find you another.
      </p>
    </PublicShell>
  );
}
