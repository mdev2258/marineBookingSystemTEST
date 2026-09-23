import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { RecordSheet } from '@/components/admin/record-sheet';
import { cardTitle } from '@/lib/board';
import { DECIDED_VIA_PLAIN, type DecidedVia } from '@/lib/enums';
import { formatDateShort, formatLondonDateShort, formatTime, todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Job sheet — Harbourside Marine Services' };

/**
 * THE JOB SHEET (ANALYSIS-TRADES.md §7 F7): lines, parts, variations and a
 * signature box, for the piece of paper that goes onto the boat.
 *
 * NO PRICES, deliberately. A job sheet is a work instruction. It gets left in
 * a cockpit, handed to a helper, clipped to a mast; the owner's partner reads
 * it. The prices are on the estimate and the invoice, where they are the
 * point, and not here, where they would only start a conversation on the
 * pontoon that belongs in an email.
 *
 * Every line has a box to tick, so the work can be done off paper by someone
 * who never logs in -- then typed in later, or not. Lines already done print
 * ticked.
 */
export default async function JobSheetPage(props: PageProps<'/admin/board/[id]/print'>) {
  const { id } = await props.params;

  const [job, business] = await Promise.all([
    prisma.booking.findUnique({
      where: { id },
      include: {
        vessel: true,
        customer: { select: { name: true, phone: true } },
        place: { select: { name: true, notes: true } },
        lineItems: { orderBy: { sortOrder: 'asc' } },
        partOrders: { orderBy: { item: 'asc' } },
        variations: { where: { status: 'approved' }, orderBy: { createdAt: 'asc' } },
        visits: { where: { status: 'planned' }, orderBy: { startsAt: 'asc' }, take: 1 },
      },
    }),
    prisma.operator.findFirst(),
  ]);
  if (!job || !business) notFound();

  // A sheet can be printed for a jot that has no boat yet. Say so plainly
  // rather than refusing -- the paper still has a job on it.
  const boat = job.vessel ?? { name: 'No boat yet', make: null, model: null, year: null, lengthMetres: null };

  return (
    <AdminShell>
      <RecordSheet
        business={business}
        title="Job sheet"
        boat={boat}
        owner={job.customer}
        issuedOn={todayInLondon()}
      >
        <section className="sheet-row mt-5">
          <p className="text-[17px] font-semibold">{cardTitle(job)}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 text-[13px]">
            <span className="ref">{job.reference}</span>
            {job.place && <span>{job.place.name}</span>}
            {job.vessel?.keelType && <span>{job.vessel.keelType} keel</span>}
            {job.customer?.phone && <span>Owner: {job.customer.phone}</span>}
          </p>
          {job.place?.notes && <p className="mt-1 text-[12.5px] muted">{job.place.notes}</p>}
          {job.requestNotes && (
            <p className="mt-2 whitespace-pre-wrap border-l-2 border-ink pl-2 text-[13px]">
              {job.requestNotes}
            </p>
          )}
        </section>

        <section className="sheet-row mt-5">
          <h2 className="k border-b border-ink pb-1">Work</h2>
          {job.lineItems.length === 0 ? (
            <p className="mt-2 text-[13px] muted">No lines yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {job.lineItems.map((l) => (
                <li key={l.id} className="flex gap-3 text-[13.5px]">
                  {/* Real characters, not styled boxes: a background colour
                      is dropped by most print dialogs, a glyph is not. */}
                  <span className="w-5 shrink-0 text-[15px] leading-none">{l.done ? '☑' : '☐'}</span>
                  <span className="flex-1">{l.description}</span>
                  {l.qty !== 1 && <span className="shrink-0 muted">{l.qty}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {job.variations.length > 0 && (
          <section className="sheet-row mt-5">
            <h2 className="k border-b border-ink pb-1">Extra work the owner agreed</h2>
            <ul className="mt-2 space-y-1.5">
              {job.variations.map((v) => (
                <li key={v.id} className="flex gap-3 text-[13.5px]">
                  <span className="w-5 shrink-0 text-[15px] leading-none">☐</span>
                  <span className="flex-1">
                    {v.description}
                    {v.decidedVia && (
                      <span className="muted">
                        {' '}
                        — agreed {DECIDED_VIA_PLAIN[v.decidedVia as DecidedVia] ?? ''}
                        {v.decidedAt ? ` ${formatDateShort(v.decidedAt)}` : ''}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {job.partOrders.length > 0 && (
          <section className="sheet-row mt-5">
            <h2 className="k border-b border-ink pb-1">Parts</h2>
            <ul className="mt-2 space-y-1">
              {job.partOrders.map((p) => (
                <li key={p.id} className="flex gap-3 text-[13px]">
                  <span className="flex-1">{p.item}</span>
                  <span className="shrink-0 muted">
                    {p.arrivedOn
                      ? 'in'
                      : p.etaOn
                        ? `due ${formatLondonDateShort(p.etaOn)}`
                        : 'on order'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Room to write what the lines did not anticipate. On a boat, that is
            usually the most useful part of the sheet. */}
        <section className="sheet-row mt-5">
          <h2 className="k border-b border-ink pb-1">Notes</h2>
          <div className="mt-2 space-y-6">
            <div className="border-b border-divider" />
            <div className="border-b border-divider" />
            <div className="border-b border-divider" />
          </div>
        </section>

        {job.visits[0] && (
          <p className="sheet-row mt-4 text-[12.5px] muted">
            Next visit planned {formatDateShort(job.visits[0].startsAt)}{' '}
            {formatTime(job.visits[0].startsAt)}
          </p>
        )}
      </RecordSheet>
    </AdminShell>
  );
}
