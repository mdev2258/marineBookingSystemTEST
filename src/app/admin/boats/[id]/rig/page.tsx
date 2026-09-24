import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { RecordSheet, printQty } from '@/components/admin/record-sheet';
import { describeEquipment, isCompleted, isRigEquipment, isRigJob, loadBoatById, workDate } from '@/lib/boat';
import { formatLondonDateLong, formatLondonDateShort, todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Rig record — Harbourside Marine Services' };

/**
 * THE RIG RECORD. The one an insurer actually asks for.
 *
 * Policies commonly want standing rigging replaced or professionally
 * inspected somewhere in the 10-15 year range, and want a dated receipt as
 * proof. So this sheet leads with the AGE, states it in years rather than
 * leaving the reader to subtract dates, and then lists the rigging work with
 * its dates underneath.
 *
 * It deliberately carries no prices. An insurer is being asked to accept that
 * the work happened, not what it cost, and a document that answers only the
 * question asked is a document that gets accepted.
 */
export default async function RigRecordPage(props: PageProps<'/admin/boats/[id]/rig'>) {
  const { id } = await props.params;

  const [boat, business] = await Promise.all([loadBoatById(id), prisma.operator.findFirst()]);
  if (!boat || !business) notFound();

  const today = todayInLondon();
  const rig = boat.equipment.filter(isRigEquipment);
  const jobs = boat.bookings.filter((j) => isCompleted(j) && isRigJob(j));

  return (
    <AdminShell>
      <RecordSheet
        business={business}
        title="Standing rigging record"
        boat={boat}
        owner={boat.customer}
        issuedOn={today}
      >
        <section className="sheet-row mt-6">
          <h2 className="k border-b border-divider pb-2">Rig as fitted</h2>

          {rig.length === 0 ? (
            <p className="mt-3 text-[14px] muted">No rigging recorded for this boat.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {rig.map((e) => {
                const age = describeEquipment(e, today);
                return (
                  <li key={e.id} className="sheet-row">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="text-[14.5px] font-semibold">{age.label}</span>
                      <span className={`k ${age.due ? 'text-accent-800' : 'muted'}`}>
                        {age.age ?? 'age not recorded'}
                      </span>
                    </div>
                    <p className="text-[13px] muted">
                      {[e.make, e.model, e.serial ? `serial ${e.serial}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                      {e.installedOn ? ` · fitted ${formatLondonDateLong(e.installedOn)}` : ''}
                    </p>
                    {age.note && <p className="text-[12.5px] muted">{age.note}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="sheet-row mt-6">
          <h2 className="k border-b border-divider pb-2">Rigging work carried out</h2>

          {jobs.length === 0 ? (
            <p className="mt-3 text-[14px] muted">No completed rigging work on record.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {jobs.map((job) => (
                <li key={job.id} className="sheet-row">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-[14.5px] font-semibold">{job.title}</span>
                    <span className="k muted">{formatLondonDateShort(workDate(job))}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {job.lineItems
                      .filter((l) => l.done)
                      .map((l) => (
                        <li key={l.id} className="text-[13.5px]">
                          {l.description}
                          {l.qty !== 1 || l.kind === 'labour' ? ` — ${printQty(l)}` : ''}
                        </li>
                      ))}
                    {job.variations
                      .filter((v) => v.status === 'approved')
                      .map((v) => (
                        <li key={v.id} className="text-[13.5px]">
                          {v.description}
                          <span className="muted"> (additional work, approved)</span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="sheet-row mt-6 text-[12px] muted">
          This record covers work carried out by {business.name} and rig details recorded by us.
          It is not a rig survey.
        </p>
      </RecordSheet>
    </AdminShell>
  );
}
