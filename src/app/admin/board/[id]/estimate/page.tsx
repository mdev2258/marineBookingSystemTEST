import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { saveLines, sendEstimate } from '@/app/admin/board/[id]/actions';
import { LINE_KIND, LINE_KIND_LABEL, type LineKind } from '@/lib/enums';
import { formatPence, penceToPoundsInput } from '@/lib/money';
import { totalsFor } from '@/lib/estimates';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Estimate — Harbourside Marine Services' };

/** Blank rows offered on every render, so a line can always be added without JS. */
const SPARE_ROWS = 3;

/**
 * Build the estimate.
 *
 * The line list belongs to the JOB, not to the estimate: this is the same
 * list the trade later ticks off as work gets done, and that the invoice
 * snapshots. Sending an estimate takes a copy of its total at that moment,
 * which is why editing here afterwards cannot change what the owner was sent.
 *
 * No JavaScript: the form always renders three spare rows, and rows with no
 * description are dropped on save. An "Add row" button would need a client
 * component and a hydration boundary to do something three empty inputs
 * already do.
 */
export default async function EstimatePage(props: PageProps<'/admin/board/[id]/estimate'>) {
  const { id } = await props.params;
  const params = await props.searchParams;

  const [job, business] = await Promise.all([
    prisma.booking.findUnique({
      where: { id },
      include: {
        vessel: { select: { name: true } },
        lineItems: { orderBy: { sortOrder: 'asc' } },
        estimates: { orderBy: { createdAt: 'desc' } },
      },
    }),
    prisma.operator.findFirst(),
  ]);
  if (!job || !business) notFound();

  const totals = totalsFor(job.lineItems, business.vatRegistered);
  const live = job.estimates.find((e) => e.status === 'sent');
  const rows = [...job.lineItems, ...Array(SPARE_ROWS).fill(null)];

  return (
    <AdminShell>
      <div className="py-5">
        <Link href={`/admin/board/${job.id}`} className="k muted">
          &lsaquo; Back to the job
        </Link>
        <h1 className="mt-3 font-condensed text-2xl font-semibold tracking-tight">
          {job.vessel?.name ?? 'No boat yet'}
        </h1>
        <p className="mt-1 text-[15px]">{job.title}</p>
        <p className="mt-1 text-[13px] muted">
          Labour is prefilled at {formatPence(business.defaultLabourRatePence)} an hour.
        </p>
      </div>

      {params.saved === '1' && (
        <p className="border border-divider bg-neutral-100 p-3 text-[13.5px]">Lines saved.</p>
      )}
      {params.error === 'empty' && (
        <p className="border border-accent-700 bg-accent-100 p-3 text-[13.5px]">
          Add at least one line before sending it.
        </p>
      )}
      {params.error === 'line' && (
        <p role="alert" className="border border-accent-700 bg-accent-100 p-3 text-[13.5px]">
          A quantity or price couldn’t be read — use numbers like 2.5 or 1,200. Nothing was saved.
        </p>
      )}

      <form action={saveLines.bind(null, job.id)} className="mt-4">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-divider text-left">
              <th className="k py-2 pr-2">Done</th>
              <th className="k py-2 pr-2">Kind</th>
              <th className="k py-2 pr-2">Description</th>
              <th className="k w-16 py-2 pr-2">Qty</th>
              <th className="k w-24 py-2">Unit £</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((line, i) => (
              <tr key={line?.id ?? `blank-${i}`} className="border-b border-divider align-top">
                <td className="py-2 pr-2">
                  {/* The index is the value, so a tick survives reordering
                      within a single save. */}
                  <input
                    type="checkbox"
                    name="done"
                    value={String(i)}
                    defaultChecked={line?.done ?? false}
                    aria-label="Work done"
                    className="mt-3 h-6 w-6 accent-accent-700"
                  />
                </td>
                <td className="py-2 pr-2">
                  <select
                    name="kind"
                    defaultValue={line?.kind ?? 'labour'}
                    aria-label="Kind"
                    className="min-h-11 w-full border border-divider bg-bg px-2"
                  >
                    {LINE_KIND.map((k) => (
                      <option key={k} value={k}>
                        {LINE_KIND_LABEL[k as LineKind]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    name="description"
                    defaultValue={line?.description ?? ''}
                    placeholder={i >= job.lineItems.length ? 'Add a line…' : ''}
                    aria-label="Description"
                    className="min-h-11 w-full border border-divider bg-bg px-2"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    name="qty"
                    inputMode="decimal"
                    defaultValue={line ? String(line.qty) : ''}
                    placeholder="1"
                    aria-label="Quantity"
                    className="min-h-11 w-full border border-divider bg-bg px-2"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="text"
                    name="unitPrice"
                    inputMode="decimal"
                    defaultValue={
                      line
                        ? penceToPoundsInput(line.unitPricePence)
                        : penceToPoundsInput(business.defaultLabourRatePence)
                    }
                    aria-label="Unit price in pounds"
                    className="min-h-11 w-full border border-divider bg-bg px-2"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex items-baseline justify-between border-t-2 border-ink pt-3">
          <span className="k">Total as it stands</span>
          <span className="numeric text-2xl">{formatPence(totals.gross)}</span>
        </div>
        {totals.vat !== null && (
          <p className="text-right text-[12.5px] muted">includes {formatPence(totals.vat)} VAT</p>
        )}

        <button
          type="submit"
          className="k mt-4 min-h-12 border border-ink px-5 hover:bg-neutral-200"
        >
          Save lines
        </button>
      </form>

      <form action={sendEstimate.bind(null, job.id)} className="mt-10 border border-divider p-4">
        <h2 className="k">Send it to the owner</h2>
        <p className="mt-1 text-[13.5px] muted">
          {live
            ? 'There is already an estimate out. Sending again supersedes it — the old one stays on record at its own price.'
            : 'Saves a copy of the total as it is now. Changing the total afterwards withdraws it, and you send a fresh one.'}
        </p>

        <label htmlFor="notes" className="k mt-4 block">
          Anything to say with it
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={job.quoteNotes ?? ''}
          placeholder="Assumes the mast comes down on a yard crane day. Time and materials beyond that."
          className="mt-2 w-full border border-divider bg-bg p-2 text-[14px]"
        />

        <button
          type="submit"
          className="k mt-3 min-h-14 w-full bg-accent-900 px-6 text-bg hover:bg-ink sm:w-auto"
        >
          {live ? 'Send a new estimate' : 'Send the estimate'}
        </button>
      </form>

      {job.estimates.length > 0 && (
        <section className="mt-10 pb-10">
          <h2 className="k border-b border-divider pb-2">Estimates on this job</h2>
          <ul className="mt-3 space-y-2">
            {job.estimates.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-[14px]">{formatPence(e.totalPence)}</span>
                <span className="k muted">
                  {e.status}
                  {e.decidedVia ? ` · ${e.decidedVia}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  );
}
