import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { Plate } from '@/components/ui/plate';
import { formatPence } from '@/lib/money';
import {
  JOB_COLUMN_OWNER_LABEL,
  WAITING_REASON_LABEL,
  type JobColumn,
  type WaitingReason,
} from '@/lib/enums';
import {
  isCompleted,
  loadBoatByToken,
  ownerHasSeenPrice,
  workDate,
} from '@/lib/boat';
import { formatLondonDateShort } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your boat' };

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
              const showPrice = ownerHasSeenPrice(job);
              const agreed = job.quotedPence;

              return (
                <Plate as="li" key={job.id} className="bg-bg p-4">
                  <p className="text-[16px] font-semibold">{job.title}</p>

                  <p className="mt-1 text-[14px] text-accent-800">
                    {job.column === 'waiting' && job.waitingReason ? (
                      <>
                        Waiting for{' '}
                        {(
                          WAITING_REASON_LABEL[job.waitingReason as WaitingReason] ??
                          job.waitingReason
                        ).toLowerCase()}
                        {job.waitingUntil
                          ? ` — expected ${formatLondonDateShort(job.waitingUntil)}`
                          : ''}
                      </>
                    ) : (
                      JOB_COLUMN_OWNER_LABEL[job.column as JobColumn]
                    )}
                  </p>

                  {showPrice && agreed != null && (
                    <p className="mt-2 text-[14px]">Agreed: {formatPence(agreed)}</p>
                  )}

                  {job.variations
                    .filter((v) => v.status === 'awaiting_owner')
                    .map((v) => (
                      <p key={v.id} className="mt-3 border-l-2 border-accent-700 pl-3 text-[14px]">
                        <span className="k">Needs your go-ahead</span>
                        <br />
                        {v.description} — {formatPence(v.estimatePence)}
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
                  {job.lineItems
                    .filter((l) => l.done)
                    .map((l) => (
                      <li key={l.id} className="text-[13.5px] muted">
                        {l.description}
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
