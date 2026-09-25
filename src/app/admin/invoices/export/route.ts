import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/auth';
import { todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * One CSV cell.
 *
 * Quoted per RFC 4180 -- a boat called "Sea Breeze, II" must not split a row.
 *
 * And DEFANGED: a cell beginning with = + - @ (or a tab / carriage return) is
 * prefixed with an apostrophe. Owner names and job titles arrive from forms,
 * and a spreadsheet opens a cell like `=HYPERLINK(...)` as a live formula --
 * on the accountant's machine, which is exactly where you do not want it.
 * Excel and Sheets both render the apostrophe as nothing.
 */
function cell(value: string | number | null | undefined): string {
  if (value == null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Pence as pounds with two decimals, the way an accountant types it. */
function pounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

/**
 * Every invoice, for the accountant (§7 F6). Not an accounts package -- this
 * is the hand-off to one.
 *
 * Voided invoices are INCLUDED, with their status, rather than filtered out.
 * A gap in the number sequence is the first thing an accountant or HMRC asks
 * about, and the answer has to be in the file, not in somebody's memory. But
 * their money columns are 0.00: summing the Total column must give what was
 * actually billed, and a void billed nothing.
 *
 * Re-checks the cookie itself: src/proxy.ts is a redirect for humans, not an
 * authorisation boundary, and this is a GET anyone could request.
 */
export async function GET() {
  const store = await cookies();
  if (!(await verifyAdminToken(store.get(ADMIN_COOKIE)?.value))) {
    return new Response('Not authorised.', { status: 401 });
  }

  const [op, invoices] = await Promise.all([
    prisma.operator.findFirst({ select: { vatRegistered: true } }),
    prisma.invoice.findMany({
      orderBy: { number: 'asc' },
      include: {
        booking: {
          select: {
            title: true,
            customer: { select: { name: true, email: true } },
            vessel: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  // No VAT columns at all for an unregistered business -- the same rule as
  // every document it produces.
  const vat = op?.vatRegistered ?? false;
  const header = [
    'Invoice',
    'Issued',
    'Due',
    'Status',
    'Customer',
    'Email',
    'Boat',
    'Job',
    ...(vat ? ['Net', 'VAT'] : []),
    'Total',
    'Paid on',
    'Paid via',
  ];

  const billed = (i: { status: string; totalPence: number }) => (i.status === 'void' ? 0 : i.totalPence);
  const vatOf = (i: { status: string; vatPence: number }) => (i.status === 'void' ? 0 : i.vatPence);

  const rows = invoices.map((i) => [
    i.number,
    i.issuedOn,
    i.dueOn,
    i.status,
    // As issued, when the invoice has the snapshot.
    i.customerName ?? i.booking.customer?.name ?? '',
    i.booking.customer?.email ?? '',
    i.booking.vessel?.name ?? '',
    i.booking.title,
    ...(vat ? [pounds(billed(i) - vatOf(i)), pounds(vatOf(i))] : []),
    pounds(billed(i)),
    i.paidOn ?? '',
    i.paidVia ?? '',
  ]);

  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');

  // The byte-order mark makes Excel read the file as UTF-8, so "£" and "—"
  // in a job title do not arrive as mojibake.
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoices-${todayInLondon()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
