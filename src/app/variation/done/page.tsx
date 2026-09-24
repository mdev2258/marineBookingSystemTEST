import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';
import { getBusiness } from '@/lib/business';
import { DECISION_LINK_DAYS } from '@/app/estimate/[token]/expiry';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Extra work — answer received — Harbourside Marine Services' };

/** Where a variation decision lands. Renders from the outcome decideVariation
 *  read back from the database; see /estimate/done for why. */
export default async function VariationDonePage(props: PageProps<'/variation/done'>) {
  const { o } = await props.searchParams;
  const business = await getBusiness();
  const ring = business?.phone ? `Give us a ring on ${business.phone}` : 'Give us a ring';

  const copy: Record<string, [string, string]> = {
    approved: [
      'Thanks — we’ll crack on',
      'That is noted against the job, with the time and date. It will appear on your invoice as agreed extra work.',
    ],
    declined: [
      'Understood',
      'We will leave that one and carry on with the rest. It is on the boat’s record either way, so it will not get forgotten next time she is out.',
    ],
    already_approved: [
      'You’ve already said yes to this one',
      'We have it on record that you agreed this extra work. Nothing more to do.',
    ],
    already_declined: [
      'You’ve already said no to this one',
      `We have it on record that you said no, so we are leaving it. ${ring} if you have changed your mind.`,
    ],
    withdrawn: [
      'We’ve withdrawn this one',
      `We no longer need an answer on this, and nothing has been added to your bill. ${ring} if you have any questions.`,
    ],
    expired: [
      'This has expired',
      `We ask for an answer within ${DECISION_LINK_DAYS} days and this one is older than that, so nothing has been added. ${ring} and we will sort it out.`,
    ],
    gone: [
      'This link has already been used',
      `This has already been answered or withdrawn, so nothing new was recorded just now. ${ring} if you are not sure where things stand.`,
    ],
  };
  const [heading, body] = copy[typeof o === 'string' && Object.hasOwn(copy, o) ? o : 'gone'];

  return (
    <PublicShell width="narrow">
      <h1 className="font-condensed text-3xl font-semibold tracking-tight">{heading}</h1>
      <p className="mt-3 text-[15px]">{body}</p>
      <p className="mt-6 text-[13px] muted">You can close this page.</p>
    </PublicShell>
  );
}
