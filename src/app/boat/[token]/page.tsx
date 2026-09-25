import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { Plate } from '@/components/ui/plate';
import { formatPence } from '@/lib/money';
import { JOB_COLUMN_OWNER_LABEL, type JobColumn, type WaitingReason } from '@/lib/enums';
import { isCompleted, loadBoatByToken, workDate, workDoneItems } from '@/lib/boat';
import { formatLondonDateShort, todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your boat — Harbourside Marine Services' };

/** The admin labels ("Owner decision") are the trade's words; these are the owner's. */
const OWNER_WAITING: Record<WaitingReason, string> = {
  yard_lift: 'Waiting for the yard to lift her',
  crane: 'Waiting for the crane',
  parts: 'Waiting for parts',
  owner_decision: 'Waiting for your decision',
  weather: 'Waiting for the weather',
  tide: 'Waiting for the right tide',
  access: 'Waiting for access to the boat',
  other: 'On hold for now',
};

/**
 * WHAT THE OWNER SEES. No account, no password, no app: one link, emailed.
 *
 * The job of this page is to kill the "any update on my boat?" phone call,
 * so every status is written in plain English -- "Waiting for parts,
 * expected Tue 22nd", never "done_to_invoice". The owner is inland on a
 * Tuesday and has never seen a kanban board.
 *
 * MONEY ONLY APPEARS WHERE THE TRADE ALREADY PUT A NUMBER IN FRONT OF THEM.
 * Lines still being priced up are internal. An owner discovering a running
 * total they were never quoted is how a good relationship becomes an argument
 * -- see ownerHasSeenPrice().
 */
export default async function OwnerBoatPage(props: PageProps<'/boat/[token]'>) {
  const { token } = await props.params;

  const boat = await loadBoatByToken(token);
  if (!boat) notFound();

  const business = await prisma.operator.findFirst();
  if (!business) notFound();

  const live = boat.bookings.filter((j) => !isCompleted(j) && j.column !== 'jotted');
  const done = boat.bookings.filter(isCompleted);
  const today = todayInLondon();

  return (
    <PublicShell business={business}>
      <h1 className="font-condensed text-3xl font-semibold tracking-tight">{boat.name}</h1>
      <p className="mt-1 text-[14px] muted">
        {[boat.make, boat.model, boat.currentPlace?.name].filter(Boolean).join(' · ')}
      </p>

      <section className="mt-8">
        <h2 className="k border-b border-divider pb-2">What we&rsquo;re doing</h2>

        {live.length === 0 ? (
          <p className="mt-4 text-[15px]">
            Nothing in hand for {boat.name} at the moment.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {live.map((job) => {
              // Newest estimate the owner has actually been sent. Only an
              // accepted one is "agreed"; a sent one is still their call.
              const estimate = job.estimates.find(
                (e) => e.status === 'sent' || e.status === 'accepted',
              );

              return (
                <Plate as="li" key={job.id} className="bg-bg p-4">
                  <p className="text-[16px] font-semibold">{job.title}</p>

                  <p className="mt-1 text-[14px] text-accent-800">
                    {job.column === 'waiting' && job.waitingReason ? (
                      <>
                        {OWNER_WAITING[job.waitingReason as WaitingReason] ?? 'Waiting'}
                        {/* A date already gone is not "expected" -- say nothing rather than something false. */}
                        {job.waitingUntil && job.waitingUntil >= today
                          ? ` — expected ${formatLondonDateShort(job.waitingUntil)}`
                          : ''}
                      </>
                    ) : (
                      JOB_COLUMN_OWNER_LABEL[job.column as JobColumn]
                    )}
                  </p>

                  {estimate?.status === 'accepted' && (
                    <p className="mt-2 text-[14px]">Agreed: {formatPence(estimate.totalPence)}</p>
                  )}
                  {estimate?.status === 'sent' && (
                    <p className="mt-3 border-l-2 border-accent-700 pl-3 text-[14px]">
                      <span className="k">Estimate — needs your go-ahead</span>
                      <br />
                      {formatPence(estimate.totalPence)}
                      {estimate.token && (
                        <>
                          {' · '}
                          <Link href={`/estimate/${estimate.token}`} className="text-accent-700 underline">
                            Have a look
                          </Link>
                        </>
                      )}
                    </p>
                  )}

                  {job.variations
                    .filter((v) => v.status === 'awaiting_owner')
                    .map((v) => (
                      <p key={v.id} className="mt-3 border-l-2 border-accent-700 pl-3 text-[14px]">
                        <span className="k">Needs your go-ahead</span>
                        <br />
                        {v.description} — {formatPence(v.estimatePence)}
                        {v.token && (
                          <>
                            {' · '}
                            <Link href={`/variation/${v.token}`} className="text-accent-700 underline">
                              Yes or no
                            </Link>
                          </>
                        )}
                      </p>
                    ))}
                </Plate>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="k border-b border-divider pb-2">Work we&rsquo;ve done</h2>

        {done.length === 0 ? (
          <p className="mt-4 text-[15px] muted">Nothing on record yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {done.map((job) => (
              <li key={job.id} className="border-b border-divider pb-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-[15px] font-semibold">{job.title}</span>
                  <span className="k muted">{formatLondonDateShort(workDate(job))}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {workDoneItems(job).map((d, i) => (
                    <li key={i} className="text-[13.5px] muted">
                      {d}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-[13px] muted">
        Anything look wrong? Give us a ring on {business.phone} — this page is just so you
        don&rsquo;t have to.
      </p>
    </PublicShell>
  );
}
