import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { formatPence } from '@/lib/money';
import { daysOverdue } from '@/lib/invoices';
import { formatLondonDateShort, todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Invoices — Harbourside Marine Services' };

/**
 * Every invoice, with what is owed at the top.
 *
 * The one number that matters here is the outstanding total, so it leads.
 * Overdue invoices sort first and say how late they are, because "19 days"
 * is what makes a trade pick up the phone and "£1,240" on its own is not.
 */
export default async function InvoicesPage() {
  const today = todayInLondon();

  const invoices = await prisma.invoice.findMany({
    orderBy: { number: 'desc' },
    include: {
      booking: {
        select: { id: true, title: true, vessel: { select: { name: true } } },
      },
    },
  });

  const unpaid = invoices.filter((i) => i.status === 'sent');
  const owed = unpaid.reduce((n, i) => n + i.totalPence, 0);
  const overdue = unpaid
    .filter((i) => daysOverdue(i, today) > 0)
    .sort((a, b) => daysOverdue(b, today) - daysOverdue(a, today));
  const overdueIds = new Set(overdue.map((i) => i.id));

  // Overdue first, worst first; then everything else, newest first.
  const ordered = [...overdue, ...invoices.filter((i) => !overdueIds.has(i.id))];

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-3 py-5">
        <div>
          <h1 className="font-condensed text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="mt-1 text-[14px]">
            <span className="numeric text-xl">{formatPence(owed)}</span>{' '}
            <span className="muted">
              owed across {unpaid.length} invoice{unpaid.length === 1 ? '' : 's'}
              {overdue.length > 0 && ` · ${overdue.length} overdue`}
            </span>
          </p>
        </div>
        {/* A plain link to a route handler; the browser downloads it. No JS. */}
        <a
          href="/admin/invoices/export"
          className="k flex min-h-12 items-center border border-ink px-4 hover:bg-neutral-200"
        >
          CSV for the accountant
        </a>
      </div>

      {ordered.length === 0 ? (
        <p className="py-10 text-center text-[14px] muted">No invoices yet.</p>
      ) : (
        <ul className="divide-y divide-divider border-y border-divider">
          {ordered.map((i) => {
            const late = i.status === 'sent' ? daysOverdue(i, today) : 0;
            const tone =
              late > 0 ? 'font-bold text-accent-800' : i.status === 'void' ? 'muted line-through' : 'muted';
            const label =
              i.status === 'paid'
                ? `paid ${i.paidOn ? formatLondonDateShort(i.paidOn) : ''}`
                : i.status === 'void'
                  ? 'void'
                  : late > 0
                    ? `${late} days overdue`
                    : `due ${formatLondonDateShort(i.dueOn)}`;

            return (
              <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <Link href={`/admin/board/${i.booking.id}#invoice`} className="ref underline">
                  {i.number}
                </Link>
                <span className="text-[14px] font-semibold">{i.booking.vessel?.name ?? '—'}</span>
                <span className="text-[13.5px] muted">{i.booking.title}</span>
                <span className="numeric ml-auto">{formatPence(i.totalPence)}</span>
                <span className={`k w-full sm:w-auto ${tone}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
