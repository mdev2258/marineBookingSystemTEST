import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * THE capacity predicate. Every surface that shows "spaces left" -- the public
 * list, the booking form, the admin day view, the rebook picker, and the
 * last-seat re-check inside createPendingBooking -- resolves it through here.
 * There is exactly one definition of an occupied seat in this codebase.
 *
 *   occupied  =  status in (paid, attended, no_show)
 *                OR (status = pending_payment AND expiresAt > now)
 *
 * cancelled, expired and awaiting_rebook never consume capacity.
 * (awaiting_rebook belongs to a session that was cancelled, so by definition it
 * is not occupying a live one.)
 *
 * Note the time predicate is inside the query, not a background job: a seat is
 * free the instant its hold lapses, even if no webhook and no cron ever fire.
 */
export function occupiedSeatWhere(now: Date = new Date()): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: ['paid', 'attended', 'no_show'] } },
      { status: 'pending_payment', expiresAt: { gt: now } },
    ],
  };
}

/** Seats taken on one session. */
export async function seatsTaken(sessionId: string, now: Date = new Date()): Promise<number> {
  const agg = await prisma.booking.aggregate({
    where: { sessionId, ...occupiedSeatWhere(now) },
    _sum: { partySize: true },
  });
  return agg._sum.partySize ?? 0;
}

/**
 * Seats taken across many sessions in one round trip. Use this on list screens;
 * calling seatsTaken() in a loop is an N+1 and it shows on the day view.
 */
export async function seatsTakenBySession(
  sessionIds: string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const map = new Map<string, number>(sessionIds.map((id) => [id, 0]));
  if (sessionIds.length === 0) return map;

  const rows = await prisma.booking.groupBy({
    by: ['sessionId'],
    where: { sessionId: { in: sessionIds }, ...occupiedSeatWhere(now) },
    _sum: { partySize: true },
  });

  for (const row of rows) map.set(row.sessionId, row._sum.partySize ?? 0);
  return map;
}

export function spacesLeftFrom(capacity: number, taken: number): number {
  return Math.max(0, capacity - taken);
}

/** Spaces left on one session, straight from the database. */
export async function spacesLeft(
  session: { id: string; capacity: number },
  now: Date = new Date(),
): Promise<number> {
  return spacesLeftFrom(session.capacity, await seatsTaken(session.id, now));
}

/**
 * The last-seat re-check. Called immediately before the Booking insert in
 * createPendingBooking. Deliberately not locked -- an unlucky simultaneous
 * double-book is acceptable for a demo, and a SQLite transaction would not
 * survive the move to Postgres unchanged anyway.
 */
export async function hasRoomFor(
  session: { id: string; capacity: number },
  partySize: number,
  now: Date = new Date(),
): Promise<boolean> {
  return (await spacesLeft(session, now)) >= partySize;
}
