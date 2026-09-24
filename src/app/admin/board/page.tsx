import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/shell';
import { BoardCard } from '@/components/admin/board/card';
import { loadBoard, isOverdue } from '@/lib/board';
import { JOB_COLUMN, JOB_COLUMN_LABEL, type JobColumn } from '@/lib/enums';
import { todayInLondon } from '@/lib/time';

// A board showing yesterday's state is worse than no board.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Board — Harbourside Marine Services' };

/**
 * THE BOARD. One screen that holds everything otherwise living in their head
 * and on bits of paper, and the first screen after login on every device.
 *
 * Phone: one column at a time behind tabs. Desktop: all eight side by side.
 * Both come from the same markup with the same server render -- the selected
 * column is a URL parameter, so there is no client state, no hydration and no
 * JavaScript between the trade and their job list.
 */
export default async function BoardPage(props: PageProps<'/admin/board'>) {
  const params = await props.searchParams;
  const requested = typeof params.col === 'string' ? params.col : '';
  const selected: JobColumn = (JOB_COLUMN as readonly string[]).includes(requested)
    ? (requested as JobColumn)
    : 'enquiry';

  const justJotted = params.jotted === '1';

  const board = await loadBoard();
  const today = todayInLondon();

  const overdueCount = (board.get('waiting') ?? []).filter((c) => isOverdue(c, today)).length;

  return (
    <AdminShell wide>
      <div className="py-5">
        <h1 className="font-condensed text-2xl font-semibold tracking-tight">The board</h1>
        <p className="mt-1 text-[13.5px] muted">
          {[...board.values()].reduce((n, c) => n + c.length, 0)} jobs in hand
          {overdueCount > 0 && ` · ${overdueCount} waiting past its date`}
        </p>
        {/* createJot lands here with ?jotted=1. role=status so the save is
            announced, not just shown (WCAG 4.1.3). */}
        <p role="status" className="mt-2 text-[13.5px] text-accent-800">
          {justJotted && 'Saved to Jotted.'}
        </p>
      </div>

      {/* Column tabs. Phone only -- on desktop every column is on screen, so
          tabs would be a control that does nothing. */}
      <nav
        aria-label="Board columns"
        className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-y border-divider bg-bg px-4 py-2 md:hidden"
      >
        {JOB_COLUMN.map((col) => {
          const count = board.get(col)?.length ?? 0;
          const active = col === selected;
          return (
            <Link
              key={col}
              href={`/admin/board?col=${col}`}
              aria-current={active ? 'page' : undefined}
              className={`k flex min-h-11 shrink-0 items-center gap-1.5 px-3 ${
                active ? 'bg-accent-900 text-bg' : 'border border-divider'
              }`}
            >
              {JOB_COLUMN_LABEL[col]}
              <span className={active ? 'text-accent-300' : 'muted'}>{count}</span>
            </Link>
          );
        })}
      </nav>

      {/*
        ponytail: every column renders its cards even when hidden on a phone,
        because that is what lets one server render serve both layouts with no
        client state. Fine at a few hundred jobs in hand; if a board ever gets
        big enough for that to hurt, render only the selected column on mobile
        and drop the desktop grid to its own branch.
      */}
      <div className="md:flex md:gap-4 md:overflow-x-auto md:pb-6">
        {JOB_COLUMN.map((col) => {
          const cards = board.get(col) ?? [];
          return (
            <section
              key={col}
              className={`${col === selected ? 'block' : 'hidden'} pt-5 md:block md:w-64 md:shrink-0`}
            >
              {/* Shown on a phone too: the active tab can be scrolled out of
                  the tab strip, and this is what says which column you are in. */}
              <h2 className="k flex items-baseline justify-between border-b border-divider pb-2">
                <span>{JOB_COLUMN_LABEL[col]}</span>
                <span className="muted">{cards.length}</span>
              </h2>

              {cards.length === 0 ? (
                <p className="py-6 text-[13.5px] muted">Nothing here.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {cards.map((card) => (
                    <BoardCard key={card.id} card={card} today={today} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="border-t border-divider py-6">
        <Link
          href="/admin/board/new"
          className="k inline-flex min-h-12 items-center border border-ink px-5 hover:bg-neutral-200"
        >
          Quick add a job
        </Link>
        <Link
          href="/admin/board/print"
          className="k ml-2 inline-flex min-h-12 items-center border border-divider px-4 hover:bg-neutral-200"
        >
          Print the board
        </Link>
      </div>
    </AdminShell>
  );
}
