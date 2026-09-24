import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getBusiness } from '@/lib/business';
import { PublicShell } from '@/components/public-shell';
import { Plate } from '@/components/ui/plate';
import { formatPence } from '@/lib/money';
import { decideEstimate } from '@/app/estimate/[token]/actions';
import { DECISION_LINK_DAYS, decisionCutoff } from '@/app/estimate/[token]/expiry';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your estimate — Harbourside Marine Services' };

/**
 * The owner's estimate. One page, two buttons, no account.
 *
 * It says ESTIMATE everywhere and states plainly that it is not a fixed
 * price. That wording is not hedging -- it is what stops the first seized
 * fastening turning into an argument, and it is why extra work later arrives
 * as a variation the owner already expects rather than as a surprise on the
 * invoice.
 */
export default async function EstimatePage(props: PageProps<'/estimate/[token]'>) {
  const { token } = await props.params;

  const estimate = await prisma.estimate.findUnique({
    where: { token },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      booking: {
        include: {
          vessel: { select: { name: true } },
          customer: { select: { name: true } },
          lineItems: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });
  if (!estimate || estimate.status !== 'sent') notFound();

  const business = await getBusiness();
  if (!business) notFound();

  // What the owner is agreeing to is what was frozen at send. Estimates sent
  // before EstimateLine existed have none, so fall back to the job's lines.
  const lines = estimate.lines.length > 0 ? estimate.lines : estimate.booking.lineItems;
  // Also enforced in decideEstimate's WHERE; this just says so before they tap.
  const expired = !estimate.sentAt || estimate.sentAt <= decisionCutoff();

  return (
    <PublicShell business={business} width="narrow">
      <p className="k muted">Estimate</p>
      <h1 className="mt-2 font-condensed text-3xl font-semibold tracking-tight">
        {estimate.booking.vessel?.name ?? 'Your boat'}
      </h1>
      <p className="mt-1 text-[14px] muted">{estimate.booking.title}</p>

      <Plate className="mt-6 bg-bg p-4">
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-4 text-[14px]">
              <span>
                {l.description}
                {l.qty !== 1 && (
                  <span className="muted"> × {l.qty}{l.kind === 'labour' ? ' hrs' : ''}</span>
                )}
              </span>
              <span className="numeric shrink-0">{formatPence(l.amountPence)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-baseline justify-between border-t border-divider pt-3">
          <span className="k">Total</span>
          <span className="numeric text-2xl">{formatPence(estimate.totalPence)}</span>
        </div>

        {/* VAT is mentioned ONLY when the business is registered. When it is
            not, the word does not appear at all -- not even as a zero. */}
        {business.vatRegistered && estimate.vatPence > 0 && (
          <p className="mt-1 text-right text-[12.5px] muted">
            includes {formatPence(estimate.vatPence)} VAT
          </p>
        )}
      </Plate>

      {estimate.notes && (
        <p className="mt-4 whitespace-pre-wrap border-l-2 border-accent-700 bg-neutral-100 p-3 text-[14px]">
          {estimate.notes}
        </p>
      )}

      <p className="mt-4 text-[14px]">
        This is an <strong>estimate, not a fixed price</strong>. It is based on what we can see
        so far. If we find anything that adds to it, we will ask you first — every time.
      </p>

      {expired ? (
        <p className="mt-8 border-l-2 border-accent-700 bg-neutral-100 p-3 text-[15px]">
          <strong>This estimate has expired.</strong> Estimates are good for {DECISION_LINK_DAYS}{' '}
          days, so ring us on {business.phone} and we will check the price still stands.
        </p>
      ) : (
        <>
          <div className="mt-8 space-y-3">
            <form action={decideEstimate.bind(null, token)}>
              <input type="hidden" name="id" value={estimate.id} />
              <input type="hidden" name="decision" value="accept" />
              <button
                type="submit"
                className="k min-h-14 w-full bg-accent-900 px-6 text-bg hover:bg-ink"
              >
                Yes, go ahead
              </button>
            </form>

            <form action={decideEstimate.bind(null, token)}>
              <input type="hidden" name="id" value={estimate.id} />
              <input type="hidden" name="decision" value="decline" />
              <button
                type="submit"
                className="k min-h-14 w-full border border-divider px-6 hover:bg-neutral-200"
              >
                No, not for now
              </button>
            </form>
          </div>

          <p className="mt-6 text-[13px] muted">
            Would rather talk it through? Ring {business.phone} — we can mark it agreed at our end.
          </p>
        </>
      )}
    </PublicShell>
  );
}
