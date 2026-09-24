import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';
import { getBusiness } from '@/lib/business';
import { DECISION_LINK_DAYS } from '@/app/estimate/[token]/expiry';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Estimate — answer received — Harbourside Marine Services' };

/**
 * Where an estimate decision lands. It renders from `o`, the outcome
 * decideEstimate read back from the database -- never from which button was
 * pressed. An owner told "booked in" when the row says declined is worse than
 * no page at all. A hand-edited `o` only misleads the person who edited it.
 */
export default async function EstimateDonePage(props: PageProps<'/estimate/done'>) {
  const { o } = await props.searchParams;
  const business = await getBusiness();
  const ring = business?.phone ? `Give us a ring on ${business.phone}` : 'Give us a ring';

  const copy: Record<string, [string, string]> = {
    accepted: [
      'Thanks — that’s booked in',
      'We have got that. We will be in touch to sort out when, and we will always check with you before doing anything that adds to the estimate.',
    ],
    declined: [
      'Thanks for letting us know',
      `No problem at all. We have not booked anything in, and nothing is owed. ${ring} any time if you change your mind.`,
    ],
    already_accepted: [
      'You’ve already said yes to this one',
      'We have it on record that you accepted this estimate, so it is booked in. Nothing more to do.',
    ],
    already_declined: [
      'You’ve already said no to this one',
      `We have it on record that you declined this estimate, so nothing is booked. ${ring} if you have changed your mind.`,
    ],
    withdrawn: [
      'This estimate has been replaced',
      `We have changed the price since this was sent, so this one no longer stands and nothing has been booked from it. ${ring} and we will talk you through the new one.`,
    ],
    expired: [
      'This estimate has expired',
      `Estimates are good for ${DECISION_LINK_DAYS} days and this one is older than that, so nothing has been booked from it. ${ring} and we will check the price still stands.`,
    ],
    gone: [
      'This link has already been used',
      `This estimate has already been answered or replaced, so nothing new was recorded just now. ${ring} if you are not sure where things stand.`,
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
