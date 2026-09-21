import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { sortJot } from '@/app/admin/board/actions';
import { BoatField, PlaceField } from '@/components/admin/board/fields';
import { JOB_COLUMN, JOB_COLUMN_LABEL } from '@/lib/enums';
import { cardTitle } from '@/lib/board';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sort — Harbourside Marine Services' };

/**
 * SORT A JOT into a proper job.
 *
 * The captured text sits at the top, verbatim and unedited, because that is
 * what the trade recognises -- they wrote it, in their words, possibly at the
 * top of a mast. It stays on the row afterwards; this screen adds structure
 * around it rather than replacing it.
 */
export default async function SortPage(props: PageProps<'/admin/board/[id]/sort'>) {
  const { id } = await props.params;

  const [job, vessels, places] = await Promise.all([
    prisma.booking.findUnique({
      where: { id },
      select: { id: true, title: true, requestNotes: true, vessel: { select: { name: true } } },
    }),
    prisma.vessel.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
    prisma.place.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);
  if (!job) notFound();

  return (
    <AdminShell>
      <form action={sortJot.bind(null, job.id)} className="max-w-lg space-y-5 py-5">
        <div>
          <h1 className="font-condensed text-2xl font-semibold tracking-tight">Sort this out</h1>
        </div>

        {job.requestNotes && (
          <p className="whitespace-pre-wrap border-l-2 border-accent-700 bg-neutral-100 p-3 text-[14px] leading-snug">
            {job.requestNotes}
          </p>
        )}

        <BoatField vessels={vessels} defaultValue={job.vessel?.name ?? ''} autoFocus />

        <div>
          <label htmlFor="title" className="k">
            What needs doing
          </label>
          <input
            id="title"
            name="title"
            type="text"
            defaultValue={cardTitle(job)}
            className="mt-2 min-h-12 w-full border border-divider bg-bg px-3 text-[16px] outline-none focus:border-accent-700"
          />
        </div>

        <PlaceField places={places} />

        <div>
          <label htmlFor="column" className="k">
            Where it goes
          </label>
          <select
            id="column"
            name="column"
            defaultValue="enquiry"
            className="mt-2 min-h-12 w-full border border-divider bg-bg px-3 text-[16px] outline-none focus:border-accent-700"
          >
            {/* Waiting is absent on purpose: it needs a reason, and that is
                asked for on the card itself rather than smuggled in here. */}
            {JOB_COLUMN.filter((c) => c !== 'jotted' && c !== 'waiting').map((c) => (
              <option key={c} value={c}>
                {JOB_COLUMN_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="k min-h-14 flex-1 bg-accent-900 px-6 text-bg hover:bg-ink">
            Sort it
          </button>
          <Link
            href={`/admin/board/${job.id}`}
            className="k flex min-h-14 items-center border border-divider px-5"
          >
            Cancel
          </Link>
        </div>
      </form>
    </AdminShell>
  );
}
