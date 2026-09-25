import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { saveLines, sendEstimate } from '@/app/admin/board/[id]/actions';
import { formatPence, penceToPoundsInput } from '@/lib/money';
import { workingTotals } from '@/lib/estimates';
import { LinesForm } from './lines-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Estimate — Harbourside Marine Services' };

/**
 * Build the estimate.
 *
 * The line list belongs to the JOB, not to the estimate: this is the same
 * list the trade later ticks off as work gets done, and that the invoice
 * snapshots. Sending an estimate copies the lines as they are at that moment;
 * changing the total afterwards withdraws it (saveLines) rather than drift.
 *
 * The form always renders three spare rows, and rows with no description are
 * dropped on save. The table is a small client component only so that a
 * refused save can hand the typing back (see LinesForm).
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

  const totals = workingTotals(job.lineItems, business.vatRegistered);
  const live = job.estimates.find((e) => e.status === 'sent');
  // Billed, or billed and paid: the price is settled, so nothing more goes out.
  const locked = job.column === 'invoiced' || job.column === 'paid';

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
        <p role="status" className="border border-divider bg-neutral-100 p-3 text-[13.5px]">
          Lines saved.
        </p>
      )}
      {params.saved === 'withdrawn' && (
        <p role="status" className="border border-accent-700 bg-accent-100 p-3 text-[13.5px]">
          Lines saved. The total changed, so the estimate the owner had is withdrawn — send them a fresh one below.
        </p>
      )}
      {params.error === 'empty' && (
        <p role="alert" className="border border-accent-700 bg-accent-100 p-3 text-[13.5px]">
          Add at least one line before sending it.
        </p>
      )}
      {params.error === 'total' && (
        <p role="alert" className="border border-accent-700 bg-accent-100 p-3 text-[13.5px]">
          The total is too big to send. Check the lines for a typo.
        </p>
      )}
      {params.error === 'locked' && (
        <p role="alert" className="border border-accent-700 bg-accent-100 p-3 text-[13.5px]">
          This job has been invoiced, so no new estimate can go out on it.
        </p>
      )}

      <LinesForm
        action={saveLines.bind(null, job.id)}
        saved={job.lineItems.map((l) => ({
          kind: l.kind,
          description: l.description,
          qty: String(l.qty),
          unitPrice: penceToPoundsInput(l.unitPricePence),
          done: l.done,
        }))}
        defaultUnitPrice={penceToPoundsInput(business.defaultLabourRatePence)}
      >
        <div className="mt-4 flex items-baseline justify-between border-t-2 border-ink pt-3">
          <span className="k">Total as it stands</span>
          <span className="numeric text-2xl">{formatPence(totals.gross)}</span>
        </div>
        {totals.vat !== null && (
          <p className="text-right text-[12.5px] muted">includes {formatPence(totals.vat)} VAT</p>
        )}
      </LinesForm>

      {!locked && (
        <form action={sendEstimate.bind(null, job.id)} className="mt-10 border border-divider p-4">
          {/* What this form last saw. The action claims the send against it,
              so the same form submitted twice sends once. */}
          <input type="hidden" name="seen" value={job.quotedAt?.toISOString() ?? ''} />
          <h2 className="k">Send it to the owner</h2>
          <p className="mt-1 text-[13.5px] muted">
            {live
              ? 'There is already an estimate out. Sending again supersedes it — the old one stays on record at its own price.'
              : 'Saves a copy of the lines as they are now. Changing the total afterwards withdraws it, and you send a fresh one.'}
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
      )}

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
