import Link from 'next/link';
import { adminLogout } from '@/app/admin/actions';
import { prisma } from '@/lib/prisma';

/**
 * Used by the authenticated admin pages rather than an admin/layout.tsx, so
 * that /admin/login does not inherit navigation it cannot use.
 */
export async function AdminShell({ children }: { children: React.ReactNode }) {
  // Unpriced work is money not yet earned, so the count goes where it cannot
  // be missed rather than only on the screen that lists it.
  const waiting = await prisma.booking.count({ where: { status: 'enquiry' } });

  return (
    <>
      <header className="border-b border-divider bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <nav className="flex items-center gap-4">
            {/* Day and Diary were the yard's screens and are parked behind
                FEATURE_YARD (ANALYSIS-TRADES.md §5). The board replaces them
                as the first screen after login. */}
            <Link
              href="/admin/enquiries"
              className="flex items-center gap-1.5 font-semibold tracking-tight hover:text-brand-700"
            >
              Inbox
              {waiting > 0 && (
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">
                  {waiting}
                </span>
              )}
            </Link>
          </nav>
          <form action={adminLogout}>
            <button type="submit" className="text-sm text-neutral-600 underline hover:text-brand-700">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">{children}</main>
    </>
  );
}
