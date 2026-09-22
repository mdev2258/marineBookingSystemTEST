import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Thanks' };

/**
 * Where a spent estimate link lands -- whether it was just answered, or
 * answered last week and clicked again from an old email.
 *
 * Both cases read the same on purpose. "This link has expired" is alarming
 * and unhelpful; the owner does not care about token lifecycles, only that
 * their answer got through.
 */
export default async function EstimateDonePage(props: PageProps<'/estimate/done'>) {
  const params = await props.searchParams;
  const declined = params.d === 'declined';

  return (
    <PublicShell width="narrow">
      <h1 className="font-condensed text-3xl font-semibold tracking-tight">
        {declined ? 'Thanks for letting us know' : 'Thanks — that’s booked in'}
      </h1>
      <p className="mt-3 text-[15px]">
        {declined
          ? 'No problem at all. We have not booked anything in, and nothing is owed. Give us a ring any time if you change your mind.'
          : 'We have got that. We will be in touch to sort out when, and we will always check with you before doing anything that adds to the estimate.'}
      </p>
      <p className="mt-6 text-[13px] muted">You can close this page.</p>
    </PublicShell>
  );
}
