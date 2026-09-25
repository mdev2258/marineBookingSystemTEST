import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { quickAdd } from '@/app/admin/board/actions';
import { BoatField, PlaceField } from '@/components/admin/board/fields';
import { OwnerFields } from '@/app/admin/board/[id]/sort/owner-fields';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Quick add — Harbourside Marine Services' };

/**
 * QUICK ADD, for when they already know the details: boat, what, where.
 * Lands in Enquiry.
 *
 * Still nothing required. This is the shortcut past Jot, not a stricter form:
 * a card with a boat and no description is a better record than a scrap of
 * paper, so it saves either way.
 */
export default async function QuickAddPage(props: PageProps<'/admin/board/new'>) {
  const params = await props.searchParams;
  const [vessels, places] = await Promise.all([
    prisma.vessel.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
    prisma.place.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <AdminShell>
      <form action={quickAdd} className="max-w-lg space-y-5 py-5">
        <div>
          <h1 className="font-condensed text-2xl font-semibold tracking-tight">Quick add</h1>
          <p className="mt-1 text-[13.5px] muted">Boat, what, where. Everything else later.</p>
        </div>

        <BoatField vessels={vessels} autoFocus />

        <div>
          <label htmlFor="title" className="k">
            What
          </label>
          <input
            id="title"
            name="title"
            type="text"
            placeholder="Annual engine service"
            className="mt-2 min-h-12 w-full border border-divider bg-bg px-3 text-[16px] outline-none focus:border-accent-700"
          />
        </div>

        <OwnerFields error={params.error} />

        <PlaceField places={places} />

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="k min-h-14 flex-1 bg-accent-900 px-6 text-bg hover:bg-ink">
            Add to the board
          </button>
          <Link href="/admin/board" className="k flex min-h-14 items-center border border-divider px-5">
            Cancel
          </Link>
        </div>
      </form>
    </AdminShell>
  );
}
