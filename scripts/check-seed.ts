/**
 * Demo pre-flight. Run after seeding, ideally shortly before a demo:
 *   npm run check
 *
 * These are not unit tests of the libraries; they assert that the specific
 * moments the demo relies on are actually true in the seeded database. A seed
 * that silently drifts (a capacity tweak, a status rename) would otherwise be
 * discovered in front of a prospect.
 */

import { PrismaClient } from '@prisma/client';
import { occupiedPlaceWhere } from '../src/lib/availability';
import { addDays, londonDayBounds, todayInLondon } from '../src/lib/time';

const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${expected}, got ${actual})`}`);
}

async function placesTaken(sessionId: string): Promise<number> {
  return prisma.booking.count({ where: { sessionId, ...occupiedPlaceWhere() } });
}

async function main() {
  const today = todayInLondon();
  const { start, end } = londonDayBounds(today);

  // The day view must not be empty on the day of the demo.
  const todaySlots = await prisma.session.findMany({
    where: { startsAt: { gte: start, lt: end } },
    orderBy: { startsAt: 'asc' },
    include: { sessionType: true },
  });
  check('today has 3 slots', todaySlots.length, 3);
  check("today's first slot is the liftout", todaySlots[0]?.sessionType.name, 'Liftout & pressure wash');

  // Work to mark off live, in front of the prospect.
  const todayJobs = await prisma.booking.count({
    where: { session: { startsAt: { gte: start, lt: end } }, status: 'paid' },
  });
  check("today has 4 jobs booked in", todayJobs, 4);
  check(
    'none of them are marked off yet',
    await prisma.booking.count({
      where: {
        session: { startsAt: { gte: start, lt: end } },
        attendanceMarkedAt: { not: null },
      },
    }),
    0,
  );

  // "1 space left" has to be literally true somewhere, or the urgency is fiction.
  const future = await prisma.session.findMany({
    where: { startsAt: { gt: end }, status: 'scheduled' },
    orderBy: { startsAt: 'asc' },
  });
  const spaces = await Promise.all(future.map(async (s) => s.capacity - (await placesTaken(s.id))));
  check('a future slot has exactly 1 space left', spaces.includes(1), true);
  check(
    'at least one future slot is completely empty',
    spaces.some((left, i) => left === future[i].capacity),
    true,
  );

  // The yard's inbox: the pivot's whole reason for existing.
  check(
    'there are 3 enquiries awaiting a quote',
    await prisma.booking.count({ where: { status: 'enquiry' } }),
    3,
  );
  check(
    'enquiries are unscheduled, with no price and no deposit',
    await prisma.booking.count({
      where: { status: 'enquiry', sessionId: null, quotedPence: null, depositPence: null },
    }),
    3,
  );
  check(
    'there are 2 quotes out, each with a live accept link',
    await prisma.booking.count({
      where: { status: 'quoted', quoteToken: { not: null }, quotedPence: { not: null } },
    }),
    2,
  );
  check(
    'a quoted job has no deposit until it is accepted',
    await prisma.booking.count({ where: { status: 'quoted', depositPence: { not: null } } }),
    0,
  );

  // Every job is a job on a boat. A yard talks about the vessel first.
  const jobs = await prisma.booking.count();
  check(
    'every job is attached to a vessel',
    await prisma.booking.count({ where: { vessel: { is: {} } } }),
    jobs,
  );

  // The cancel screen counts EmailLog rows. This is the number on the slide.
  const cancelled = await prisma.session.findFirst({
    where: { status: 'cancelled' },
    include: { cancellation: true },
  });
  check('there is a cancelled slot', cancelled != null, true);
  check('it was cancelled for weather', cancelled?.cancellation?.reason, 'weather');
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
    'one has already been moved onto a later slot',
    await prisma.booking.count({ where: { rebookedFromSessionId: cancelled?.id } }),
    1,
  );

  // A live deposit request must be holding its slot.
  check(
    'a live deposit hold exists',
    (await prisma.booking.count({
      where: { status: 'pending_payment', expiresAt: { gt: new Date() } },
    })) > 0,
    true,
  );

  // The reminder button needs something to send, or the demo shows "0 sent".
  const tomorrow = londonDayBounds(addDays(today, 1));
  check(
    'tomorrow has jobs with no reminder sent',
    (await prisma.booking.count({
      where: {
        status: 'paid',
        reminderSentAt: null,
        session: { startsAt: { gte: tomorrow.start, lt: tomorrow.end } },
      },
    })) > 0,
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
