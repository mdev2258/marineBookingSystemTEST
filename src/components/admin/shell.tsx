import Link from 'next/link';
import { adminLogout } from '@/app/admin/actions';
import { prisma } from '@/lib/prisma';
import { FEATURE_YARD } from '@/lib/features';

/**
 * Used by the authenticated admin pages rather than an admin/layout.tsx, so
 * that /admin/login does not inherit navigation it cannot use.
 *
 * The board is wider than the old three-column-max screens, so the container
 * widens on desktop to let eight columns breathe. On a phone it is unchanged.
 */
export async function AdminShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  // Unsorted captures are the ones most likely to be forgotten, so the count
  // goes where it cannot be missed rather than only on the board.
  const jotted = await prisma.booking.count({ where: { column: 'jotted' } });

  return (
    <>
      {/* 2.4.1: one tab past the nav on every admin screen. */}
      <a
        href="#main"
        className="k sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:bg-accent-900 focus:px-4 focus:py-3 focus:text-bg"
      >
        Skip to content
      </a>
      {/*
        JOT, one tap away from every screen (ANALYSIS-TRADES.md §7 F1).
        Fixed to the bottom right rather than in the header, because the target
        is a thumb on a 390px phone held in one hand -- the top of the screen
        is the part a thumb cannot reach. pb-28 on <main> keeps it from
        covering the last card. Placed straight after the skip link in the DOM
        so it is the second Tab stop, not the last (QA r2 #21); position:fixed
        keeps it visually where it was.
      */}
      {/* no-print: a fixed element prints on EVERY page, so without this the
          rig record handed to an insurer came out with a black "JOT" box in
          the corner. Found in F7; had been on every F2 record since F2. */}
      <Link
        href="/admin/jot"
        aria-label="Jot something down"
        className="no-print k fixed bottom-5 right-5 z-20 flex h-16 min-w-16 items-center justify-center bg-accent-900 px-5 text-bg shadow-lg hover:bg-ink"
      >
        Jot
      </Link>
      <header className="border-b border-divider bg-bg">
        <div
          className={`mx-auto flex ${wide ? 'max-w-none' : 'max-w-3xl'} items-center justify-between gap-3 px-4 py-3`}
        >
          <nav className="flex items-center gap-4">
            {/* Day and Diary were the yard's screens and are parked behind
                FEATURE_YARD (ANALYSIS-TRADES.md §5). The board replaces them
                as the first screen after login, on every device. */}
            <Link href="/admin/board" className="font-condensed font-semibold tracking-tight hover:text-accent-700">
              Board
              {jotted > 0 && (
                <span className="ml-1.5 bg-accent-700 px-1.5 py-0.5 text-[11px] font-bold text-bg">
                  {jotted}
                </span>
              )}
            </Link>
            <Link
              href="/admin/reminders"
              className="font-condensed font-semibold tracking-tight hover:text-accent-700"
            >
              Due
            </Link>
            <Link
              href="/admin/invoices"
              className="font-condensed font-semibold tracking-tight hover:text-accent-700"
            >
              Invoices
            </Link>
            {/* The Inbox is the yard's enquiry screen; it has no meaning for a
                trades job (QA r2 #17). */}
            {FEATURE_YARD && (
              <Link
                href="/admin/enquiries"
                className="font-condensed font-semibold tracking-tight hover:text-accent-700"
              >
                Inbox
              </Link>
            )}
          </nav>
          <form action={adminLogout}>
            <button type="submit" className="text-sm muted underline hover:text-accent-700">
              Log out
            </button>
          </form>
        </div>
      </header>

      <main id="main" className={`mx-auto w-full ${wide ? 'max-w-none' : 'max-w-3xl'} flex-1 px-4 pb-28`}>
        {children}
      </main>

    </>
  );
}
