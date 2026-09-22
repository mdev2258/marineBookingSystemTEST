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
import { buildTimeline } from '@/lib/timeline';
import { DecidedViaField } from '@/components/admin/board/decided-via';
import { formatPence } from '@/lib/money';
import {
  DECIDED_VIA_LABEL,
  DECIDED_VIA_PLAIN,
  POSTPONE_REASON,
  POSTPONE_REASON_LABEL,
  type DecidedVia,
  type PostponeReason,
} from '@/lib/enums';
import {
  addPartOrder,
  markPartArrived,
  markVisitDone,
  planVisit,
  postponeVisit,
  raiseVariation,
  recordEstimateDecision,
  recordVariationDecision,
} from '@/app/admin/board/[id]/actions';
import {
  daysBetween,
  formatDateShort,
  formatLondonDateShort,
  formatTime,
  londonDateString,
  todayInLondon,
} from '@/lib/time';

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
      variations: { orderBy: { createdAt: 'desc' } },
      estimates: { orderBy: { createdAt: 'desc' } },
      lineItems: { orderBy: { sortOrder: 'asc' } },
      partOrders: { orderBy: [{ arrivedOn: 'asc' }, { etaOn: 'asc' }] },
      visits: { orderBy: { startsAt: 'desc' }, include: { place: { select: { name: true } } } },
      emailLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!job) notFound();

  const places = await prisma.place.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  });

  const today = todayInLondon();
  const column = job.column as JobColumn;
  const inColumnFor = daysBetween(londonDateString(job.columnChangedAt), today);
  const isJot = column === 'jotted';
  const missingReason = params.error === 'reason';
  const badVariation = params.error === 'variation';

  const liveEstimate = job.estimates.find((e) => e.status === 'sent');
  // The last one the owner actually answered. Without this, a job whose
  // estimate was accepted reads "nothing sent yet" -- which is not merely
  // untidy, it is the screen telling the trade the opposite of what happened.
  const decidedEstimate = job.estimates.find(
    (e) => e.status === 'accepted' || e.status === 'declined',
  );
  const awaiting = job.variations.filter((v) => v.status === 'awaiting_owner');
  const settled = job.variations.filter((v) => v.status !== 'awaiting_owner');
  const timeline = buildTimeline(job);

  const outstandingParts = job.partOrders.filter((p) => p.arrivedOn == null);
  const plannedVisit = job.visits.find((v) => v.status === 'planned');
  // The last part landing is the moment this card stops being stuck. The app
  // OFFERS the move and never makes it: only the trade knows whether the tide,
  // the crane and their own week also line up.
  const partsAllIn =
    job.column === 'waiting' &&
    job.waitingReason === 'parts' &&
    job.partOrders.length > 0 &&
    outstandingParts.length === 0;

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

      {/* ---- Estimate ---- */}
      <section className="mt-8">
        <h2 className="k flex items-baseline justify-between border-b border-divider pb-2">
          <span>Estimate</span>
          <Link href={`/admin/board/${job.id}/estimate`} className="underline">
            {job.lineItems.length > 0 ? 'Edit lines' : 'Build one'}
          </Link>
        </h2>

        {liveEstimate ? (
          <div className="mt-3">
            <p className="text-[15px]">
              <span className="numeric text-xl">{formatPence(liveEstimate.totalPence)}</span>{' '}
              <span className="muted">sent, waiting on the owner</span>
            </p>

            {/* The owner may well answer by ringing. Recording that here is
                the normal case, not the exception. */}
            <form
              action={recordEstimateDecision.bind(null, liveEstimate.id)}
              className="mt-4 border border-divider p-3"
            >
              <p className="k">They got back to you?</p>
              <DecidedViaField />

              <label htmlFor="estimateNote" className="k mt-3 block muted">
                What they said
              </label>
              <input
                id="estimateNote"
                name="decisionNote"
                type="text"
                placeholder="Rang back first thing, said go ahead"
                className="mt-1 min-h-11 w-full border border-divider bg-bg px-2 text-[14px]"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="accepted"
                  className="k min-h-12 bg-accent-900 px-4 text-bg hover:bg-ink"
                >
                  They said yes
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="declined"
                  className="k min-h-12 border border-divider px-4 hover:bg-neutral-200"
                >
                  They said no
                </button>
              </div>
            </form>
          </div>
        ) : decidedEstimate ? (
          <div className="mt-3">
            <p className="text-[15px]">
              <span className="numeric text-xl">{formatPence(decidedEstimate.totalPence)}</span>{' '}
              <span className="muted">
                {decidedEstimate.status === 'accepted' ? 'agreed' : 'declined'}
                {decidedEstimate.decidedVia
                  ? ` ${DECIDED_VIA_PLAIN[decidedEstimate.decidedVia as DecidedVia]}`
                  : ''}
              </span>
            </p>
            {decidedEstimate.decisionNote && (
              <p className="mt-1 text-[13.5px] muted">
                &ldquo;{decidedEstimate.decisionNote}&rdquo;
              </p>
            )}
            {/* Lines can be edited after acceptance -- that is how extra work
                gets ticked off -- so say plainly that the agreed figure is the
                snapshot and not whatever the list adds up to now. */}
            <p className="mt-2 text-[12.5px] muted">
              That is the figure they agreed. Editing lines does not change it.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[13.5px] muted">
            {job.lineItems.length > 0
              ? `${job.lineItems.length} line${job.lineItems.length === 1 ? '' : 's'} drafted, nothing sent yet.`
              : 'Nothing priced up yet.'}
          </p>
        )}
      </section>

      {/* ---- Extra work ---- */}
      <section className="mt-8">
        <h2 className="k border-b border-divider pb-2">Extra work</h2>

        {awaiting.map((v) => (
          <Plate key={v.id} className="mt-3 bg-accent-100 p-3">
            <p className="k">Waiting on the owner</p>
            <p className="mt-1 text-[15px] font-semibold">{v.description}</p>
            {v.reason && <p className="mt-1 text-[13.5px]">{v.reason}</p>}
            <p className="numeric mt-1 text-[16px]">{formatPence(v.estimatePence)}</p>

            <form action={recordVariationDecision.bind(null, v.id)} className="mt-3">
              <DecidedViaField />
              <label htmlFor={`vnote-${v.id}`} className="k mt-3 block muted">
                What they said
              </label>
              <input
                id={`vnote-${v.id}`}
                name="decisionNote"
                type="text"
                className="mt-1 min-h-11 w-full border border-divider bg-bg px-2 text-[14px]"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="approved"
                  className="k min-h-12 bg-accent-900 px-4 text-bg hover:bg-ink"
                >
                  Approved
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="declined"
                  className="k min-h-12 border border-divider px-4 hover:bg-neutral-200"
                >
                  Declined
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="withdrawn"
                  className="k min-h-12 border border-divider px-4 muted hover:bg-neutral-200"
                >
                  Withdraw it
                </button>
              </div>
            </form>
          </Plate>
        ))}

        {settled.map((v) => (
          <p key={v.id} className="mt-2 flex flex-wrap items-baseline gap-x-3 text-[13.5px]">
            <span>{v.description}</span>
            <span className="numeric">{formatPence(v.estimatePence)}</span>
            <span className="k muted">
              {v.status}
              {v.decidedVia ? ` · ${DECIDED_VIA_LABEL[v.decidedVia as DecidedVia]}` : ''}
            </span>
          </p>
        ))}

        {/* Three fields, typed one-handed with the thing still in shot. */}
        <form
          id="variation"
          action={raiseVariation.bind(null, job.id)}
          className="mt-4 border border-divider p-3"
        >
          <p className="k">Found something?</p>

          {badVariation && (
            <p className="mt-2 text-[13.5px] font-semibold text-accent-800">
              Needs at least what it is and what it costs.
            </p>
          )}

          <label htmlFor="vdesc" className="k mt-3 block muted">
            What
          </label>
          <input
            id="vdesc"
            name="description"
            type="text"
            placeholder="Galley seacock seized"
            className="mt-1 min-h-12 w-full border border-divider bg-bg px-2 text-[15px]"
          />

          <label htmlFor="vreason" className="k mt-3 block muted">
            Why it matters
          </label>
          <input
            id="vreason"
            name="reason"
            type="text"
            placeholder="Corroded solid. Not safe to leave another season."
            className="mt-1 min-h-12 w-full border border-divider bg-bg px-2 text-[15px]"
          />

          <label htmlFor="vamount" className="k mt-3 block muted">
            &pound;
          </label>
          <input
            id="vamount"
            name="amount"
            type="text"
            inputMode="decimal"
            placeholder="140"
            className="mt-1 min-h-12 w-full max-w-40 border border-divider bg-bg px-2 text-[15px]"
          />

          <button
            type="submit"
            className="k mt-4 min-h-14 w-full bg-accent-900 px-6 text-bg hover:bg-ink sm:w-auto"
          >
            Ask the owner
          </button>
        </form>
      </section>

      {isJot && (
        <Link
          href={`/admin/board/${job.id}/sort`}
          className="k mt-6 flex min-h-14 items-center justify-center bg-accent-900 px-6 text-bg hover:bg-ink"
        >
          Sort this into a job
        </Link>
      )}

      {/* ---- Parts ---- */}
      <section id="parts" className="mt-8">
        <h2 className="k border-b border-divider pb-2">Parts on order</h2>

        {partsAllIn && (
          <Plate className="mt-3 bg-accent-100 p-3">
            <p className="text-[14px] font-semibold">Everything is in.</p>
            <p className="mt-1 text-[13.5px]">
              Nothing is outstanding on this job any more. Move it out of Waiting?
            </p>
            <form action={moveJob.bind(null, job.id)} className="mt-3">
              <input type="hidden" name="column" value="on_it" />
              <button
                type="submit"
                className="k min-h-12 bg-accent-900 px-4 text-bg hover:bg-ink"
              >
                Move to On it
              </button>
            </form>
          </Plate>
        )}

        {job.partOrders.length > 0 && (
          <ul className="mt-3 space-y-2">
            {job.partOrders.map((p) => {
              const late = p.arrivedOn == null && p.etaOn != null && p.etaOn < today;
              return (
                <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13.5px]">
                  <span className={p.arrivedOn ? 'muted' : 'font-semibold'}>{p.item}</span>
                  {p.supplier && <span className="k muted">{p.supplier}</span>}

                  {p.arrivedOn ? (
                    <span className="k muted">arrived {formatLondonDateShort(p.arrivedOn)}</span>
                  ) : (
                    <>
                      <span className={`k ${late ? 'font-bold text-accent-800' : 'muted'}`}>
                        {p.etaOn ? `eta ${formatLondonDateShort(p.etaOn)}` : 'no eta'}
                        {late ? ' · late' : ''}
                      </span>
                      <form action={markPartArrived.bind(null, p.id, job.id)}>
                        <button
                          type="submit"
                          className="k min-h-11 border border-divider px-3 hover:bg-neutral-200"
                        >
                          It&rsquo;s here
                        </button>
                      </form>
                    </>
                  )}
                  {p.costPence != null && (
                    <span className="numeric ml-auto">{formatPence(p.costPence)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form action={addPartOrder.bind(null, job.id)} className="mt-4 border border-divider p-3">
          <p className="k">Order a part</p>
          {params.error === 'part' && (
            <p className="mt-2 text-[13.5px] font-semibold text-accent-800">
              Needs at least what the part is.
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="item" className="k block muted">What</label>
              <input
                id="item"
                name="item"
                type="text"
                placeholder="Cutless bearing 25mm"
                className="mt-1 min-h-12 w-full border border-divider bg-bg px-2 text-[15px]"
              />
            </div>
            <div>
              <label htmlFor="supplier" className="k block muted">Supplier</label>
              <input
                id="supplier"
                name="supplier"
                type="text"
                className="mt-1 min-h-12 w-full border border-divider bg-bg px-2 text-[15px]"
              />
            </div>
            <div>
              <label htmlFor="etaOn" className="k block muted">Expected</label>
              <input
                id="etaOn"
                name="etaOn"
                type="date"
                className="mt-1 min-h-12 w-full border border-divider bg-bg px-2 text-[15px]"
              />
            </div>
            <div>
              <label htmlFor="cost" className="k block muted">&pound; (optional)</label>
              <input
                id="cost"
                name="cost"
                type="text"
                inputMode="decimal"
                className="mt-1 min-h-12 w-full border border-divider bg-bg px-2 text-[15px]"
              />
            </div>
          </div>
          <button
            type="submit"
            className="k mt-3 min-h-12 border border-ink px-4 hover:bg-neutral-200"
          >
            Add it
          </button>
        </form>
      </section>

      {/* ---- Visits ---- */}
      <section id="visits" className="mt-8">
        <h2 className="k border-b border-divider pb-2">Going down to her</h2>

        {params.postponed === '1' && (
          <p className="mt-3 border border-divider bg-neutral-100 p-3 text-[13.5px]">
            Owner emailed.
          </p>
        )}

        {job.visits.length > 0 && (
          <ul className="mt-3 space-y-2">
            {job.visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 text-[13.5px]">
                <span className={v.status === 'postponed' ? 'muted line-through' : 'font-semibold'}>
                  {formatDateShort(v.startsAt)} {formatTime(v.startsAt)}
                </span>
                {v.place && <span className="k muted">{v.place.name}</span>}
                <span className="k muted">{v.status}</span>
                {v.postponeReason && (
                  <span className="k muted">
                    {POSTPONE_REASON_LABEL[v.postponeReason as PostponeReason] ?? v.postponeReason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {plannedVisit ? (
          <div className="mt-4 border border-divider p-3">
            <p className="k">
              Next: {formatDateShort(plannedVisit.startsAt)} {formatTime(plannedVisit.startsAt)}
            </p>

            <form action={markVisitDone.bind(null, plannedVisit.id, job.id)} className="mt-3">
              <button
                type="submit"
                className="k min-h-12 border border-ink px-4 hover:bg-neutral-200"
              >
                That&rsquo;s done
              </button>
            </form>

            {/* The email is the point. A slipped date nobody mentions is the
                complaint this whole feature exists to stop. */}
            <form
              action={postponeVisit.bind(null, plannedVisit.id, job.id)}
              className="mt-4 border-t border-divider pt-3"
            >
              <p className="k">Not going to make it?</p>
              <p className="mt-1 text-[13px] muted">
                Emails the owner the reason and a new date, or tells them we&rsquo;ll be in touch.
              </p>

              {params.error === 'postpone' && (
                <p className="mt-2 text-[13.5px] font-semibold text-accent-800">
                  Pick a reason — the owner is going to ask.
                </p>
              )}

              <fieldset className="mt-3">
                <legend className="sr-only">Why</legend>
                <div className="flex flex-wrap gap-2">
                  {POSTPONE_REASON.map((r) => (
                    <label
                      key={r}
                      className="k flex min-h-11 cursor-pointer items-center gap-2 border border-divider px-3 has-[:checked]:border-accent-700 has-[:checked]:bg-accent-100"
                    >
                      <input
                        type="radio"
                        name="postponeReason"
                        value={r}
                        required
                        className="accent-accent-700"
                      />
                      {POSTPONE_REASON_LABEL[r as PostponeReason]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label htmlFor="postponeNote" className="k mt-3 block muted">
                Anything to add
              </label>
              <input
                id="postponeNote"
                name="postponeNote"
                type="text"
                placeholder="Forecast 30kt gusting 40 — the crane will not lift in that"
                className="mt-1 min-h-11 w-full border border-divider bg-bg px-2 text-[14px]"
              />

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="newDate" className="k block muted">New date (optional)</label>
                  <input
                    id="newDate"
                    name="newDate"
                    type="date"
                    className="mt-1 min-h-12 border border-divider bg-bg px-2 text-[15px]"
                  />
                </div>
                <div>
                  <label htmlFor="newTime" className="k block muted">Time</label>
                  <input
                    id="newTime"
                    name="newTime"
                    type="time"
                    defaultValue="09:00"
                    className="mt-1 min-h-12 border border-divider bg-bg px-2 text-[15px]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="k mt-4 min-h-14 w-full border border-ink px-6 hover:bg-neutral-200 sm:w-auto"
              >
                Postpone and tell them
              </button>
            </form>
          </div>
        ) : (
          <form action={planVisit.bind(null, job.id)} className="mt-4 border border-divider p-3">
            <p className="k">Put a day in</p>
            {params.error === 'visit' && (
              <p className="mt-2 text-[13.5px] font-semibold text-accent-800">
                Needs a date.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="date" className="k block muted">Date</label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  className="mt-1 min-h-12 border border-divider bg-bg px-2 text-[15px]"
                />
              </div>
              <div>
                <label htmlFor="time" className="k block muted">Time</label>
                <input
                  id="time"
                  name="time"
                  type="time"
                  defaultValue="09:00"
                  className="mt-1 min-h-12 border border-divider bg-bg px-2 text-[15px]"
                />
              </div>
              <div>
                <label htmlFor="visitPlace" className="k block muted">Where</label>
                <select
                  id="visitPlace"
                  name="placeId"
                  className="mt-1 min-h-12 border border-divider bg-bg px-2 text-[15px]"
                >
                  <option value="">Where the boat is</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="k mt-3 min-h-12 border border-ink px-4 hover:bg-neutral-200"
            >
              Plan it
            </button>
          </form>
        )}
      </section>

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

      {/* ---- Timeline ---- */}
      <section className="mt-10 pb-10">
        <h2 className="k border-b border-divider pb-2">What happened, and how</h2>
        <ul className="mt-3 space-y-2">
          {timeline.map((entry, i) => (
            <li key={i} className="flex gap-3 text-[13.5px]">
              <span className="k w-28 shrink-0 muted">{formatDateShort(entry.at)}</span>
              <span>
                <span className={entry.emphasis ? 'font-semibold' : ''}>{entry.label}</span>
                {entry.detail && <span className="block muted">{entry.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}
