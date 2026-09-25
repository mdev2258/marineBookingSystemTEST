import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/shell';
import { Plate } from '@/components/ui/plate';
import { formatPence } from '@/lib/money';
import { JOB_COLUMN_LABEL, WAITING_REASON_LABEL, type JobColumn, type WaitingReason } from '@/lib/enums';
import {
  describeEquipment,
  isCompleted,
  isRigEquipment,
  isRigJob,
  loadBoatById,
  workDate,
} from '@/lib/boat';
import { setBoatOwner } from '@/app/admin/board/actions';
import { regenerateOwnerLink } from '@/app/admin/boat-link-actions';
import { OwnerFields } from '@/app/admin/board/[id]/sort/owner-fields';
import { formatLondonDateShort, todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Boat — Harbourside Marine Services' };

/**
 * THE BOAT FILE. Everything ever done to this boat, newest first.
 *
 * This is the half of the product that is not the board: records that matter
 * for years. Insurers and surveyors ask the age of standing rigging and want
 * dated receipts, and the trade who holds those records gets the next job
 * (ANALYSIS-TRADES.md §1.4).
 */
export default async function BoatPage(props: PageProps<'/admin/boats/[id]'>) {
  const { id } = await props.params;
  const params = await props.searchParams;
  const boat = await loadBoatById(id);
  if (!boat) notFound();

  const today = todayInLondon();
  const equipment = boat.equipment.map((e) => ({ e, age: describeEquipment(e, today) }));
  const detail = [
    boat.make,
    boat.model,
    boat.year,
    boat.lengthMetres ? `${boat.lengthMetres}m` : null,
    boat.keelType ? `${boat.keelType} keel` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // A motor boat has no rig, and an empty rig record is worse than none.
  const hasRig = boat.equipment.some(isRigEquipment) || boat.bookings.some(isRigJob);

  return (
    <AdminShell>
      <div className="py-5">
        <h1 className="font-condensed text-3xl font-semibold tracking-tight">{boat.name}</h1>
        {detail && <p className="mt-1 text-[14px] muted">{detail}</p>}

        {boat.customer ? (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[14px]">
            <span className="font-semibold">{boat.customer.name}</span>
            {boat.customer.phone && (
              <a href={`tel:${boat.customer.phone.replace(/\s/g, '')}`} className="underline">
                {boat.customer.phone}
              </a>
            )}
            <a href={`mailto:${boat.customer.email}`} className="truncate underline">
              {boat.customer.email}
            </a>
          </p>
        ) : (
          <form id="owner" action={setBoatOwner.bind(null, boat.id)} className="mt-4 max-w-lg space-y-3 border border-divider p-3">
            <p className="text-[14px] muted">
              No owner on file yet, so nothing about this boat can be emailed.
            </p>
            <OwnerFields error={params.error} note="Estimates, extra work and the owner's boat link go to this email." />
            <button type="submit" className="k min-h-12 border border-ink px-4 hover:bg-neutral-200">
              Add the owner
            </button>
          </form>
        )}
        {params.owner === '1' && (
          <p role="status" className="mt-3 border border-divider bg-neutral-100 p-3 text-[13.5px]">
            Owner added. Their jobs on this boat will now email them.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-y border-divider py-4">
        <Link
          href={`/admin/boats/${boat.id}/record`}
          className="k flex min-h-12 items-center border border-ink px-4 hover:bg-neutral-200"
        >
          Work record
        </Link>
        {hasRig && (
          <Link
            href={`/admin/boats/${boat.id}/rig`}
            className="k flex min-h-12 items-center border border-ink px-4 hover:bg-neutral-200"
          >
            Rig record
          </Link>
        )}
        {boat.ownerToken && (
          <>
            <Link
              href={`/boat/${boat.ownerToken}`}
              className="k flex min-h-12 items-center border border-divider px-4 hover:bg-neutral-200"
            >
              What the owner sees
            </Link>
            <form action={regenerateOwnerLink.bind(null, boat.id)}>
              <button
                type="submit"
                className="k flex min-h-12 items-center border border-divider px-4 hover:bg-neutral-200"
              >
                New owner link (old one stops working)
              </button>
            </form>
          </>
        )}
      </div>

      <section className="py-6">
        <h2 className="k border-b border-divider pb-2">Where she is</h2>
        <p className="mt-3 text-[15px] font-semibold">
          {boat.currentPlace ? boat.currentPlace.name : 'Not recorded'}
        </p>
        {boat.currentPlace?.notes && (
          <p className="mt-1 text-[13.5px] muted">{boat.currentPlace.notes}</p>
        )}

        {boat.moves.length > 0 && (
          <ul className="mt-4 space-y-1">
            {boat.moves.map((m) => (
              <li key={m.id} className="text-[13.5px] muted">
                {formatLondonDateShort(m.movedOn)} — {m.fromName ? `${m.fromName} → ` : ''}
                {m.toName}
                {m.note ? ` · ${m.note}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pb-6">
        <h2 className="k border-b border-divider pb-2">Kit and ages</h2>
        {equipment.length === 0 ? (
          <p className="mt-3 text-[13.5px] muted">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {equipment.map(({ e, age }) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-[14px] font-semibold">{age.label}</span>
                {e.make && <span className="text-[13.5px] muted">{e.make}</span>}
                {age.age && (
                  <span className={`k ${age.due ? 'text-accent-800' : 'muted'}`}>
                    {age.age}
                    {age.due ? ' · due' : ''}
                  </span>
                )}
                {age.note && <span className="w-full text-[12.5px] muted">{age.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pb-10">
        <h2 className="k border-b border-divider pb-2">
          Everything ever done ({boat.bookings.length})
        </h2>

        {boat.bookings.length === 0 ? (
          <p className="mt-3 text-[13.5px] muted">Nothing on the books yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {boat.bookings.map((job) => {
              const done = isCompleted(job);
              const owed = job.invoices
                .filter((i) => i.status === 'sent')
                .reduce((n, i) => n + i.totalPence, 0);

              return (
                <Plate as="li" key={job.id} className="bg-bg p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <Link
                      href={`/admin/board/${job.id}`}
                      className="text-[15px] font-semibold underline"
                    >
                      {job.title}
                    </Link>
                    <span className="k muted">
                      {done
                        ? formatLondonDateShort(workDate(job))
                        : JOB_COLUMN_LABEL[job.column as JobColumn]}
                    </span>
                  </div>

                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {job.place && <span className="k muted">{job.place.shortName}</span>}
                    {job.column === 'waiting' && job.waitingReason && (
                      <span className="k muted">
                        {WAITING_REASON_LABEL[job.waitingReason as WaitingReason] ??
                          job.waitingReason}
                      </span>
                    )}
                    {owed > 0 && (
                      <span className="k text-accent-800">{formatPence(owed)} outstanding</span>
                    )}
                  </p>

                  {job.lineItems.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {job.lineItems.map((l) => (
                        <li key={l.id} className="flex justify-between gap-3 text-[13px]">
                          <span className={l.done ? '' : 'muted'}>{l.description}</span>
                          <span className="numeric shrink-0">{formatPence(l.amountPence)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {job.variations
                    .filter((v) => v.status === 'approved')
                    .map((v) => (
                      <p key={v.id} className="mt-2 text-[13px]">
                        <span className="k muted">Extra</span> {v.description} ·{' '}
                        {formatPence(v.estimatePence)}
                      </p>
                    ))}
                </Plate>
              );
            })}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
