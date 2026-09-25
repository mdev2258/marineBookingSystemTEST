import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { JOB_COLUMN, type JobColumn } from '@/lib/enums';
import { todayInLondon, type LondonDate } from '@/lib/time';

/**
 * THE board query. Every surface that draws a card resolves it through here,
 * so there is exactly one definition of what a card shows.
 *
 * `paid` is deliberately excluded: a paid job drops off the board into the
 * boat's history (ANALYSIS-TRADES.md §4).
 */
const BOARD_INCLUDE = {
  vessel: { select: { id: true, name: true, make: true, model: true } },
  place: { select: { shortName: true } },
  // The dot on the card. Only ever "is there one", never a list.
  variations: { where: { status: 'awaiting_owner' }, select: { id: true } },
  // £ shown on an Invoiced card is what is still owed, not what was billed.
  invoices: { where: { status: 'sent' }, select: { totalPence: true, issuedOn: true, dueOn: true } },
} as const;

export type BoardCard = Awaited<ReturnType<typeof loadBoardCards>>[number];

async function loadBoardCards() {
  return prisma.booking.findMany({
    where: { column: { in: [...JOB_COLUMN] } },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: BOARD_INCLUDE,
  });
}

/** Every column, in board order, always present even when empty. */
export async function loadBoard(): Promise<Map<JobColumn, BoardCard[]>> {
  const cards = await loadBoardCards();
  const byColumn = new Map<JobColumn, BoardCard[]>(JOB_COLUMN.map((c) => [c, []]));
  for (const card of cards) {
    byColumn.get(card.column as JobColumn)?.push(card);
  }
  return byColumn;
}

/**
 * A waiting card whose date has passed. These flash, so nothing rots in the
 * Waiting column -- the whole reason a waiting reason carries a date.
 *
 * String comparison, not Date: every LondonDate is zero-padded "yyyy-MM-dd",
 * so lexical order is calendar order and there is no instant to mis-zone.
 */
export function isOverdue(
  card: { waitingUntil: string | null },
  today: LondonDate = todayInLondon(),
): boolean {
  return card.waitingUntil != null && card.waitingUntil < today;
}

/** What is still owed on this card, or 0. */
export function unpaidPence(card: { invoices: { totalPence: number }[] }): number {
  return card.invoices.reduce((sum, i) => sum + i.totalPence, 0);
}

/**
 * Where a card lands when it arrives in a column: the end.
 *
 * Positions are sparse (100, 200, 300) so a card can later be dropped between
 * two others without renumbering the whole column.
 *
 * PASS `tx` WHEN CALLING FROM INSIDE A TRANSACTION. DATABASE_URL carries a
 * small `connection_limit` for pgbouncer, so a transaction can hold the last
 * connection in the pool. A query on the global client from inside it then
 * waits for a connection the transaction will never give back -- a
 * deterministic deadlock that surfaces five seconds later as P2028
 * "Transaction already closed". It took down issueInvoice the first time it
 * ran, and had been sitting unexercised in sendEstimate since F3.
 */
export async function nextPosition(
  column: string,
  db: Prisma.TransactionClient = prisma,
): Promise<number> {
  const last = await db.booking.findFirst({
    where: { column },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  return (last?.position ?? 0) + 100;
}

/**
 * A value that came in on a request and is about to reach a Prisma WHERE.
 * `undefined` (or an object) there does not fail -- Prisma drops the filter
 * and the write matches every row. Bound action arguments come from the
 * client, so every action checks its ids with this first.
 */
export function isId(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= 64;
}

/**
 * A real calendar day as "yyyy-MM-dd", not just the shape: 2026-02-31 passes
 * the regex, is stored, and then throws in every formatter that renders it --
 * which takes the board down for everyone. Round-trips through Date.UTC, so
 * it is refused unless the date names itself.
 */
// ponytail: belongs in lib/time.ts beside LondonDate; lives here because that file is someone else's this round.
export function isLondonDate(x: unknown): x is LondonDate {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Columns that are claims about paperwork, and what a job needs to be in them. */
export async function paperworkAllows(
  bookingId: string,
  column: string,
  db: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  if (column === 'estimate_sent') {
    return (await db.estimate.count({ where: { bookingId, status: 'sent' } })) > 0;
  }
  if (column === 'invoiced') {
    return (await db.invoice.count({ where: { bookingId, status: 'sent' } })) > 0;
  }
  return true;
}

/**
 * Nothing is out with the owner any more -- the estimate was withdrawn by a
 * price edit, or declined. A card left in Estimate sent would say "waiting for
 * you" with nothing to answer, so it goes back to Enquiry: the job still
 * exists and still needs a price the owner agrees to, which is exactly what
 * Enquiry means. Not Jotted -- the job was sorted enough to price, and
 * nothing remembers which column it came from. Only a card IN Estimate sent
 * moves; one the trade put anywhere else stays put.
 */
export async function releaseEstimateSentCard(
  bookingId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  await db.booking.updateMany({
    where: { id: bookingId, column: 'estimate_sent', estimates: { none: { status: 'sent' } } },
    data: {
      column: 'enquiry',
      columnChangedAt: new Date(),
      position: await nextPosition('enquiry', db),
    },
  });
}

/**
 * An estimate was accepted -- by the owner's link or by phone. Record the price,
 * and move the card to Booked only if it was waiting on that answer: in
 * Estimate sent, or parked in Waiting on the owner's decision. A card the trade
 * has since put On it (or anywhere else) stays where they put it; the column
 * is in the WHERE so that holds even against a concurrent move.
 */
export async function bookAcceptedEstimate(bookingId: string, totalPence: number): Promise<void> {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { acceptedAt: new Date(), quotedPence: totalPence },
  });
  await prisma.booking.updateMany({
    where: {
      id: bookingId,
      OR: [{ column: 'estimate_sent' }, { column: 'waiting', waitingReason: 'owner_decision' }],
    },
    data: {
      column: 'booked',
      columnChangedAt: new Date(),
      position: await nextPosition('booked'),
      waitingReason: null,
      waitingUntil: null,
    },
  });
}

/**
 * The card's one line. A sorted job has a title; a raw jot has only the text
 * the trade typed, so the first line of it stands in until it is sorted.
 */
export function cardTitle(card: { title: string; requestNotes: string | null }): string {
  if (card.title.trim()) return card.title;
  const firstLine = (card.requestNotes ?? '').split('\n')[0]?.trim() ?? '';
  return firstLine || 'Untitled';
}

/** Derive a title from captured text. Jot asks for one field; this makes the rest. */
export function titleFromJot(text: string): string {
  const line = text.trim().split('\n')[0]?.trim() ?? '';
  return line.length > 70 ? `${line.slice(0, 69)}…` : line;
}
