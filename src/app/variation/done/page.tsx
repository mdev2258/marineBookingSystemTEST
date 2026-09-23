import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Extra work — answer received' };

/** Where a spent variation link lands. See /estimate/done for why both
 *  outcomes and both timings read alike. */
export default async function VariationDonePage(props: PageProps<'/variation/done'>) {
  const params = await props.searchParams;
  const declined = params.d === 'declined';

  return (
    <PublicShell width="narrow">
      <h1 className="font-condensed text-3xl font-semibold tracking-tight">
        {declined ? 'Understood' : 'Thanks — we’ll crack on'}
      </h1>
      <p className="mt-3 text-[15px]">
        {declined
          ? 'We will leave that one and carry on with the rest. It is on the boat’s record either way, so it will not get forgotten next time she is out.'
          : 'That is noted against the job, with the time and date. It will appear on your invoice as agreed extra work.'}
      </p>
      <p className="mt-6 text-[13px] muted">You can close this page.</p>
    </PublicShell>
  );
}
