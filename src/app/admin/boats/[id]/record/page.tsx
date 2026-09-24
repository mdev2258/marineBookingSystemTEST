import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { RecordSheet, printQty } from '@/components/admin/record-sheet';
import { formatPence } from '@/lib/money';
import { isCompleted, loadBoatById, workDate } from '@/lib/boat';
import { formatLondonDateShort, todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Work record — Harbourside Marine Services' };

/**
 * THE WORK RECORD. What was done to this boat, and when.
 *
 * This is the dated receipt (ANALYSIS-TRADES.md §6). It lists only work that
 * is actually finished -- an estimate nobody accepted is not a record of
 * anything, and putting it on the same sheet would make the whole document
 * arguable.
 *
 * `?job=<id>` narrows it to one job, for when an insurer asks about one piece
 * of work rather than the boat's whole life.
 */
export default async function WorkRecordPage(props: PageProps<'/admin/boats/[id]/record'>) {
  const { id } = await props.params;
  const params = await props.searchParams;
  const onlyJob = typeof params.job === 'string' ? params.job : null;

  const [boat, business] = await Promise.all([loadBoatById(id), prisma.operator.findFirst()]);
  if (!boat || !business) notFound();

  const jobs = boat.bookings
    .filter(isCompleted)
    .filter((j) => (onlyJob ? j.id === onlyJob : true));

  return (
    <AdminShell>
      <RecordSheet
        business={business}
        title="Record of work"
        boat={boat}
        owner={boat.customer}
        issuedOn={todayInLondon()}
      >
        {jobs.length === 0 ? (
          <p className="mt-6 text-[14px] muted">No completed work on record for this boat.</p>
        ) : (
          <div className="mt-6 space-y-6">
            {jobs.map((job) => {
              // The invoice total is what was actually billed; the lines are
              // what was actually done. An approved variation is part of the
              // work whether or not it was on the original estimate.
              const approved = job.variations.filter((v) => v.status === 'approved');
              const done = job.lineItems.filter((l) => l.done);
              const parts = job.partOrders.filter((p) => p.arrivedOn);
              const invoice = job.invoices[0];

              return (
                <section key={job.id} className="sheet-row border-t border-divider pt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <h2 className="font-condensed text-[17px] font-semibold">{job.title}</h2>
                    <p className="k muted">{formatLondonDateShort(workDate(job))}</p>
                  </div>

                  {done.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {done.map((l) => (
                        <li key={l.id} className="flex justify-between gap-4 text-[13.5px]">
                          <span>
                            {l.description}
                            {l.qty !== 1 || l.kind === 'labour' ? ` — ${printQty(l)}` : ''}
                          </span>
                          <span className="numeric shrink-0">{formatPence(l.amountPence)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {approved.map((v) => (
                    <p key={v.id} className="mt-1 flex justify-between gap-4 text-[13.5px]">
                      <span>
                        {v.description}
                        <span className="muted"> (additional work, approved)</span>
                      </span>
                      <span className="numeric shrink-0">{formatPence(v.estimatePence)}</span>
                    </p>
                  ))}

                  {parts.length > 0 && (
                    <p className="mt-2 text-[13px] muted">
                      Parts fitted: {parts.map((p) => p.item).join(', ')}
                    </p>
                  )}

                  {invoice && (
                    <p className="mt-2 text-[13px] muted">
                      Invoice {invoice.number}
                      {invoice.status === 'paid' && invoice.paidOn
                        ? ` · paid ${formatLondonDateShort(invoice.paidOn)}`
                        : ''}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </RecordSheet>
    </AdminShell>
  );
}
