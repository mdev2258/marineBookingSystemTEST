import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { Plate } from '@/components/ui/plate';
import { formatPence } from '@/lib/money';
import { decideVariation } from '@/app/variation/[token]/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Extra work' };

/**
 * Extra work found once the boat was open. Yes or no, on a phone, in a car
 * park, in under ten seconds.
 *
 * "Nothing happens until you say so" is the most important sentence on the
 * page: the owner is inland, the boat is opened up, and the trade is waiting.
 * Saying it plainly is what makes this feel like being asked rather than told.
 */
export default async function VariationPage(props: PageProps<'/variation/[token]'>) {
  const { token } = await props.params;

  const variation = await prisma.variation.findUnique({
    where: { token },
    include: {
      booking: {
        include: { vessel: { select: { name: true } } },
      },
    },
  });
  if (!variation || variation.status !== 'awaiting_owner') notFound();

  const business = await prisma.operator.findFirst();
  if (!business) notFound();

  return (
    <PublicShell business={business} width="narrow">
      <p className="k muted">Extra work</p>
      <h1 className="mt-2 font-condensed text-3xl font-semibold tracking-tight">
        {variation.booking.vessel?.name ?? 'Your boat'}
      </h1>
      <p className="mt-1 text-[14px] muted">While we were doing: {variation.booking.title}</p>

      <Plate className="mt-6 bg-bg p-4">
        <p className="text-[16px] font-semibold">{variation.description}</p>
        {variation.reason && <p className="mt-2 text-[14px]">{variation.reason}</p>}

        <div className="mt-4 flex items-baseline justify-between border-t border-divider pt-3">
          <span className="k">Estimated cost</span>
          <span className="numeric text-2xl">{formatPence(variation.estimatePence)}</span>
        </div>
      </Plate>

      <p className="mt-4 text-[15px] font-semibold">Nothing happens until you say so.</p>

      <div className="mt-6 space-y-3">
        <form action={decideVariation.bind(null, token)}>
          <input type="hidden" name="decision" value="approve" />
          <button
            type="submit"
            className="k min-h-14 w-full bg-accent-900 px-6 text-bg hover:bg-ink"
          >
            Yes, do it
          </button>
        </form>

        <form action={decideVariation.bind(null, token)}>
          <input type="hidden" name="decision" value="decline" />
          <button
            type="submit"
            className="k min-h-14 w-full border border-divider px-6 hover:bg-neutral-200"
          >
            No, leave it
          </button>
        </form>
      </div>

      <p className="mt-6 text-[13px] muted">
        Rather talk first? Ring {business.phone}.
      </p>
    </PublicShell>
  );
}
