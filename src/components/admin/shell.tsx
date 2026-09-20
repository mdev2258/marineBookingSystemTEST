import Link from 'next/link';
import { adminLogout } from '@/app/admin/actions';

/**
 * Used by the authenticated admin pages rather than an admin/layout.tsx, so
 * that /admin/login does not inherit navigation it cannot use.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <nav className="flex items-center gap-4">
            <Link href="/admin/day" className="font-semibold tracking-tight hover:text-brand-700">
              Day
            </Link>
            <Link href="/admin/sessions" className="font-semibold tracking-tight hover:text-brand-700">
              Sessions
            </Link>
          </nav>
          <form action={adminLogout}>
            <button type="submit" className="text-sm text-slate-600 underline hover:text-brand-700">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">{children}</main>
    </>
  );
}
