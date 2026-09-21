import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { Plate } from '@/components/ui/plate';
import { moveJob } from '@/app/admin/board/actions';
import {
  JOB_COLUMN,
  JOB_COLUMN_LABEL,
  WAITING_REASON,
  WAITING_REASON_LABEL,
  type JobColumn,
  type WaitingReason,
} from '@/lib/enums';
import { cardTitle } from '@/lib/board';
import { daysBetween, formatLondonDateShort, londonDateString, todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Job — Harbourside Marine Services' };

/**
 * The card, opened. "Move to…" is the whole point of the screen.
 *
 * Every column except Waiting is a one-tap button. Waiting is the single
 * exception in the entire app: it is reachable ONLY through the form below,
 * which cannot be submitted without a reason. That is structural rather than
 * a validation message -- there is no path through this UI that produces a
 * waiting card with no reason, and moveJob() refuses one anyway for the
 * callers this screen doesn't own.
 */
export default async function JobPage(props: PageProps<'/admin/board/[id]'>) {
  const { id } = await props.params;
  const params = await props.searchParams;

  const job = await prisma.booking.findUnique({
    where: { id },
    include: {
      vessel: { select: { id: true, name: true, make: true, model: true } },
      customer: { select: { name: true, phone: true, email: true } },
      place: { select: { name: true } },
      variations: { where: { status: 'awaiting_owner' }, select: { id: true, description: true } },
    },
  });
  if (!job) notFound();

  const today = todayInLondon();
  const column = job.column as JobColumn;
  const inColumnFor = daysBetween(londonDateString(job.columnChangedAt), today);
  const isJot = column === 'jotted';
  const missingReason = params.error === 'reason';

  return (
    <AdminShell>
      <div className="py-5">
        <Link href={`/admin/board?col=${column}`} className="k muted">
          &lsaquo; Back to the board
        </Link>

        {/* Card -> here -> the boat file is two taps, which is the §7 F2
            acceptance criterion. The boat name IS the link, because that is
            what the trade reaches for. */}
        <h1 className="mt-3 font-condensed text-2xl font-semibold tracking-tight">
          {job.vessel ? (
            <Link href={`/admin/boats/${job.vessel.id}`} className="underline decoration-1 underline-offset-4">
              {job.vessel.name}
            </Link>
          ) : (
            'No boat yet'
          )}
        </h1>
        <p className="mt-1 text-[15px]">{cardTitle(job)}</p>

        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <span className="k muted">{JOB_COLUMN_LABEL[column]}</span>
          <span className="k muted">
            {inColumnFor <= 0 ? 'today' : `${inColumnFor} day${inColumnFor === 1 ? '' : 's'}`}
          </span>
          {job.place && <span className="k muted">{job.place.name}</span>}
          <span className="ref muted">{job.reference}</span>
        </p>
      </div>

      {job.requestNotes && (
        <p className="whitespace-pre-wrap border-l-2 border-accent-700 bg-neutral-100 p-3 text-[14px] leading-snug">
          {job.requestNotes}
        </p>
      )}

      {job.customer && (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[14px]">
          <span className="font-semibold">{job.customer.name}</span>
          {job.customer.phone && (
            <a href={`tel:${job.customer.phone.replace(/\s/g, '')}`} className="underline">
              {job.customer.phone}
            </a>
          )}
          <a href={`mailto:${job.customer.email}`} className="truncate underline">
            {job.customer.email}
          </a>
        </p>
      )}

      {job.variations.length > 0 && (
        <Plate className="mt-5 bg-accent-100 p-3">
          <p className="k">Waiting on the owner</p>
          {job.variations.map((v) => (
            <p key={v.id} className="mt-1 text-[14px]">
              {v.description}
            </p>
          ))}
        </Plate>
      )}

      {isJot && (
        <Link
          href={`/admin/board/${job.id}/sort`}
          className="k mt-6 flex min-h-14 items-center justify-center bg-accent-900 px-6 text-bg hover:bg-ink"
        >
          Sort this into a job
        </Link>
      )}

      <h2 className="k mt-8 border-b border-divider pb-2">Move to</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {JOB_COLUMN.filter((c) => c !== column && c !== 'waiting' && c !== 'jotted').map((c) => (
          <form key={c} action={moveJob.bind(null, job.id)}>
            <input type="hidden" name="column" value={c} />
            <button
              type="submit"
              className="k min-h-12 border border-ink px-4 hover:bg-neutral-200"
            >
              {JOB_COLUMN_LABEL[c]}
            </button>
          </form>
        ))}
      </div>

      {/* The one save in the app that can be refused. */}
      <form
        id="waiting"
        action={moveJob.bind(null, job.id)}
        className="mt-8 border border-divider p-4"
      >
        <input type="hidden" name="column" value="waiting" />

        <h2 className="k">Put it on hold</h2>
        <p className="mt-1 text-[13.5px] muted">
          A card in Waiting always says what it is waiting for. That is the whole point of
          the column.
        </p>

        {missingReason && (
          <p className="mt-3 text-[13.5px] font-semibold text-accent-800">
            Pick what it&rsquo;s waiting on first.
          </p>
        )}

        <fieldset className="mt-4">
          <legend className="sr-only">What it is waiting on</legend>
          <div className="flex flex-wrap gap-2">
            {WAITING_REASON.map((r) => (
              <label
                key={r}
                className="k flex min-h-12 cursor-pointer items-center gap-2 border border-divider px-3 has-[:checked]:border-accent-700 has-[:checked]:bg-accent-100"
              >
                <input
                  type="radio"
                  name="waitingReason"
                  value={r}
                  required
                  defaultChecked={job.waitingReason === r}
                  className="accent-accent-700"
                />
                {WAITING_REASON_LABEL[r as WaitingReason]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 max-w-xs">
          <label htmlFor="waitingUntil" className="k">
            Until (optional)
          </label>
          <input
            id="waitingUntil"
            name="waitingUntil"
            type="date"
            defaultValue={job.waitingUntil ?? ''}
            className="mt-2 min-h-12 w-full border border-divider bg-bg px-3 text-[16px] outline-none focus:border-accent-700"
          />
          <p className="mt-1 text-[12.5px] muted">
            {job.waitingUntil
              ? `Currently ${formatLondonDateShort(job.waitingUntil)}. `
              : ''}
            Once the date passes, the card flashes.
          </p>
        </div>

        <button
          type="submit"
          className="k mt-4 min-h-14 w-full border border-ink px-6 hover:bg-neutral-200 sm:w-auto"
        >
          {column === 'waiting' ? 'Update the hold' : 'Move to Waiting'}
        </button>
      </form>
    </AdminShell>
  );
}
