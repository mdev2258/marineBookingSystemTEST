import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CAPACITY_CONSUMING_STATUSES } from '@/lib/enums';

/**
 * THE capacity predicate. Every surface that shows how full a slot is -- the
 * public slot list, the booking form, the admin day view, the rebook picker,
 * and the last-place re-check before a job is scheduled -- resolves it through
 * here. There is exactly one definition of an occupied place in this codebase.
 *
 *   occupied  =  status in (paid, completed, no_show)
 *                OR (status = pending_payment AND expiresAt > now)
 *
 * One booking is one vessel, so a place is counted per row rather than summed:
 * a crane lifts one boat at a time whatever the owner brings with them.
 *
 * enquiry and quoted are deliberately NOT occupying. A customer who asks for a
 * price and never replies must not hold a crane slot open indefinitely.
 * cancelled, declined, expired and awaiting_rebook never consume capacity
 * either (awaiting_rebook belongs to a slot that was cancelled, so by
 * definition it is not occupying a live one).
 *
 * Note the time predicate is inside the query, not a background job: a place is
 * free the instant its hold lapses, even if no webhook and no cron ever fire.
 */
export function occupiedPlaceWhere(now: Date = new Date()): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: { in: [...CAPACITY_CONSUMING_STATUSES] } },
      { status: 'pending_payment', expiresAt: { gt: now } },
    ],
  };
}

/** Places taken in one slot. */
export async function placesTaken(sessionId: string, now: Date = new Date()): Promise<number> {
  return prisma.booking.count({
    where: { sessionId, ...occupiedPlaceWhere(now) },
  });
}

/**
 * Places taken across many slots in one round trip. Use this on list screens;
 * calling placesTaken() in a loop is an N+1 and it shows on the day view.
 */
export async function placesTakenBySession(
  sessionIds: string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const map = new Map<string, number>(sessionIds.map((id) => [id, 0]));
  if (sessionIds.length === 0) return map;

  const rows = await prisma.booking.groupBy({
    by: ['sessionId'],
    where: { sessionId: { in: sessionIds }, ...occupiedPlaceWhere(now) },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (row.sessionId) map.set(row.sessionId, row._count._all);
  }
  return map;
}

export function spacesLeftFrom(capacity: number, taken: number): number {
  return Math.max(0, capacity - taken);
}

/** Places left in one slot, straight from the database. */
export async function spacesLeft(
  session: { id: string; capacity: number },
  now: Date = new Date(),
): Promise<number> {
  return spacesLeftFrom(session.capacity, await placesTaken(session.id, now));
}

/**
 * The last-place re-check. Called immediately before a job is scheduled into a
 * slot. Deliberately not locked -- an unlucky simultaneous double-book is
 * acceptable for a demo. Postgres could hold a real lock here; doing so is a
 * production concern and nothing on the board reads this path.
 */
export async function hasRoom(
  session: { id: string; capacity: number },
  now: Date = new Date(),
): Promise<boolean> {
  return (await spacesLeft(session, now)) >= 1;
}
