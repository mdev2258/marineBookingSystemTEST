/**
 * Demo pre-flight. Run after seeding, ideally on the morning of a demo:
 *   npm run check
 *
 * These are not unit tests of the libraries; they assert that the specific
 * moments the demo relies on are actually true in the seeded database. A seed
 * that silently drifts (a capacity tweak, a status rename) would otherwise be
 * discovered in front of a prospect.
 */

import { PrismaClient } from '@prisma/client';
import { occupiedSeatWhere } from '../src/lib/availability';
import { londonDayBounds, todayInLondon } from '../src/lib/time';

const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${expected}, got ${actual})`}`);
}

async function seatsTaken(sessionId: string): Promise<number> {
  const agg = await prisma.booking.aggregate({
    where: { sessionId, ...occupiedSeatWhere() },
    _sum: { partySize: true },
  });
  return agg._sum.partySize ?? 0;
}

async function main() {
  const today = todayInLondon();
  const { start, end } = londonDayBounds(today);

  // The day view must not be empty on the day of the demo.
  const todaySessions = await prisma.session.findMany({
    where: { startsAt: { gte: start, lt: end } },
    orderBy: { startsAt: 'asc' },
    include: { sessionType: true },
  });
  check('today has 3 sessions', todaySessions.length, 3);

  // The session marked live in front of the prospect: 5 of 6 seats, none marked yet.
  const first = todaySessions[0];
  if (first) {
    check("today's first session is the dinghy", first.sessionType.name, 'RYA Level 1 Dinghy');
    check('it has 5 of 6 seats taken', await seatsTaken(first.id), 5);
    check(
      'none of its bookings are marked yet',
      await prisma.booking.count({
        where: { sessionId: first.id, attendanceMarkedAt: { not: null } },
      }),
      0,
    );
  }

  // "1 space left" has to be literally true somewhere, or the urgency is fiction.
  const future = await prisma.session.findMany({
    where: { startsAt: { gt: end }, status: 'scheduled' },
    orderBy: { startsAt: 'asc' },
  });
  const spacesLeft = await Promise.all(
    future.map(async (s) => s.capacity - (await seatsTaken(s.id))),
  );
  check('a future session has exactly 1 space left', spacesLeft.includes(1), true);

  // The cancel screen counts EmailLog rows. This is the number on the slide.
  const cancelled = await prisma.session.findFirst({
    where: { status: 'cancelled' },
    include: { cancellation: true },
  });
  check('there is a cancelled session', cancelled != null, true);
  check('it has a cancellation reason of weather', cancelled?.cancellation?.reason, 'weather');
  check(
    'it reports 3 customers notified',
    await prisma.emailLog.count({
      where: { sessionId: cancelled?.id, type: 'cancellation', status: 'sent' },
    }),
    3,
  );
  check(
    'two of its customers are still awaiting a rebook',
    await prisma.booking.count({ where: { sessionId: cancelled?.id, status: 'awaiting_rebook' } }),
    2,
  );
  check(
    'one has already been moved onto a later session',
    await prisma.booking.count({ where: { rebookedFromSessionId: cancelled?.id } }),
    1,
  );

  // A live hold must be holding seats, or "spaces left" is just a static number.
  const held = await prisma.booking.findFirst({
    where: { status: 'pending_payment', expiresAt: { gt: new Date() } },
  });
  check('a live pending hold exists', held != null, true);

  // The reminder button needs something to send, or the demo shows "0 sent".
  const tomorrow = londonDayBounds(
    `${new Date(end.getTime() + 43_200_000).toISOString().slice(0, 10)}`,
  );
  check(
    "tomorrow has paid bookings with no reminder sent",
    (await prisma.booking.count({
      where: {
        status: 'paid',
        reminderSentAt: null,
        session: { startsAt: { gte: tomorrow.start, lt: tomorrow.end } },
      },
    })) > 0,
    true,
  );

  // An empty session proves the availability query is not faking it.
  check(
    'at least one future session is completely empty',
    (
      await prisma.session.findMany({
        where: { startsAt: { gt: end }, status: 'scheduled' },
        include: { _count: { select: { bookings: true } } },
      })
    ).some((s) => s._count.bookings === 0),
    true,
  );

  console.log(failures === 0 ? '\nAll demo checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
