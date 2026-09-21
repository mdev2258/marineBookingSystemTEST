/**
 * Demo pre-flight. Run after seeding, ideally shortly before a demo:
 *   npm run check
 *
 * These are not unit tests of the libraries; they assert that the specific
 * moments the demo relies on are actually true in the seeded database. A seed
 * that silently drifts (a column rename, a date that rolled over midnight)
 * would otherwise be discovered in front of a prospect.
 *
 * It has earned its keep: in the yard era it caught an overbooked rebook
 * target, quotes seeded with no slot, a "1 space left" that was really 2, and
 * a midnight rollover that staled a whole seed mid-session. Trust it over
 * eyeballing the screens.
 *
 * The first section checks the calendar helpers rather than the data, because
 * every date below is computed with them and a clamping bug would make every
 * other assertion here agree with a wrong seed.
 */

import { PrismaClient } from '@prisma/client';
import {
  addMonths,
  addYears,
  monthsBetween,
  todayInLondon,
  yearsBetween,
} from '../src/lib/time';
import { JOB_COLUMN, WAITING_REASON } from '../src/lib/enums';

const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${expected}, got ${actual})`}`);
}

function atLeast(label: string, actual: number, min: number) {
  const ok = actual >= min;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (expected at least ${min}, got ${actual})`}`);
}

async function main() {
  const today = todayInLondon();

  // --- calendar helpers ----------------------------------------------------
  check('addMonths clamps 31 Jan + 1m to end of Feb', addMonths('2026-01-31', 1), '2026-02-28');
  check('addMonths clamps into a leap February', addMonths('2024-01-31', 1), '2024-02-29');
  check('addMonths rolls the year', addMonths('2026-12-15', 1), '2027-01-15');
  check('addMonths goes backwards', addMonths('2026-03-15', -3), '2025-12-15');
  check('addYears survives the BST boundary', addYears('2016-10-25', 10), '2026-10-25');
  check('yearsBetween counts completed anniversaries', yearsBetween('2015-10-25', '2026-09-21'), 10);
  check('yearsBetween on the anniversary itself', yearsBetween('2015-09-21', '2026-09-21'), 11);
  check('monthsBetween rounds down', monthsBetween('2025-11-30', '2026-09-21'), 9);

  // --- the business --------------------------------------------------------
  const op = await prisma.operator.findFirst();
  check('one business exists', op?.name, 'Harbourside Marine Services');
  // Every VAT-conditional branch in the app is exercised by this being false.
  check('business is not VAT-registered', op?.vatRegistered, false);
  check('invoice prefix is set', op?.invoicePrefix, 'HMS-');

  // --- the board (§4) ------------------------------------------------------
  // Every column populated, or the board demo has a hole in it.
  for (const column of JOB_COLUMN) {
    atLeast(`column "${column}" has a card`, await prisma.booking.count({ where: { column } }), 1);
  }

  // The whole premise: capture with no boat, no owner, no place.
  atLeast(
    'jotted cards exist with no boat and no owner',
    await prisma.booking.count({ where: { column: 'jotted', vesselId: null, customerId: null } }),
    2,
  );

  // A card in Waiting without a reason is the hole things fall through.
  check(
    'no waiting card is missing its reason',
    await prisma.booking.count({ where: { column: 'waiting', waitingReason: null } }),
    0,
  );

  for (const reason of WAITING_REASON) {
    atLeast(
      `waiting reason "${reason}" is represented`,
      await prisma.booking.count({ where: { column: 'waiting', waitingReason: reason } }),
      1,
    );
  }

  // §8: one waiting card past its date, so the flashing state is demoable.
  // String comparison is safe and index-friendly because every LondonDate is
  // stored zero-padded "yyyy-MM-dd".
  check(
    'exactly one waiting card is past its date',
    await prisma.booking.count({
      where: { column: 'waiting', waitingUntil: { lt: today } },
    }),
    1,
  );

  // --- boat records and the work they generate (§8) -------------------------
  check('25 boats', await prisma.vessel.count(), 25);
  atLeast(
    'four boats have standing rigging 10+ years old',
    await prisma.equipment.count({
      where: { kind: 'standing_rigging', installedOn: { lte: addYears(today, -10) } },
    }),
    4,
  );
  atLeast(
    'five engines are past their service interval',
    await prisma.equipment.count({
      where: {
        kind: { in: ['engine', 'outboard'] },
        serviceIntervalMonths: { not: null },
        lastServicedOn: { lt: addMonths(today, -12) },
      },
    }),
    5,
  );

  // The sales pitch: a batch worth sending.
  atLeast(
    'eight reminders are due',
    await prisma.reminder.count({ where: { status: 'upcoming' } }),
    8,
  );

  // --- estimates and variations (§8) ---------------------------------------
  atLeast('estimates are out and unanswered', await prisma.estimate.count({ where: { status: 'sent' } }), 1);
  atLeast(
    'an estimate was accepted by link',
    await prisma.estimate.count({ where: { status: 'accepted', decidedVia: 'link' } }),
    1,
  );
  // "Agreed by phone" is a first-class path, not a fallback (§3.5).
  atLeast(
    'an estimate was agreed by phone',
    await prisma.estimate.count({ where: { status: 'accepted', decidedVia: 'phone' } }),
    1,
  );

  check(
    'one variation is awaiting the owner (the dot on the card)',
    await prisma.variation.count({ where: { status: 'awaiting_owner' } }),
    1,
  );
  atLeast(
    'a variation was approved by link',
    await prisma.variation.count({ where: { status: 'approved', decidedVia: 'link' } }),
    1,
  );
  atLeast(
    'a variation was agreed by phone',
    await prisma.variation.count({ where: { status: 'approved', decidedVia: 'phone' } }),
    1,
  );

  // --- waiting on other people (§8) ----------------------------------------
  const postponed = await prisma.visit.findFirst({ where: { status: 'postponed' } });
  check('a visit was postponed', postponed?.postponeReason, 'weather');
  // The owner being told is the point; a postponement nobody heard about is
  // the thing this product exists to stop.
  atLeast(
    'the owner was emailed about the postponement',
    await prisma.emailLog.count({ where: { type: 'visit_postponed', status: 'sent' } }),
    1,
  );
  atLeast(
    'parts are on order with an ETA still ahead',
    await prisma.partOrder.count({ where: { arrivedOn: null, etaOn: { gt: today } } }),
    1,
  );

  // --- money (§8) ----------------------------------------------------------
  check('three invoices', await prisma.invoice.count(), 3);
  check('one invoice is paid', await prisma.invoice.count({ where: { status: 'paid' } }), 1);

  const overdue = await prisma.invoice.findMany({
    where: { status: 'sent', dueOn: { lt: today } },
  });
  check('one invoice is overdue', overdue.length, 1);
  if (overdue[0]) {
    const daysOverdue = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${overdue[0].dueOn}T00:00:00Z`)) / 86_400_000,
    );
    check('the overdue invoice is 19 days out', daysOverdue, 19);
  }

  const numbers = (await prisma.invoice.findMany({ select: { number: true } })).map((i) => i.number);
  check('invoice numbers are unique', new Set(numbers).size, numbers.length);
  check(
    'next invoice number is past every issued one',
    (op?.nextInvoiceNumber ?? 0) > numbers.length,
    true,
  );

  // A line total is stored, not derived, so nothing can re-total a sent
  // estimate underneath the owner. This asserts the stored value still agrees
  // with its own inputs.
  const lines = await prisma.quoteLineItem.findMany();
  const drifted = lines.filter((l) => l.amountPence !== Math.round(l.qty * l.unitPricePence));
  check('no line total has drifted from qty x unit price', drifted.length, 0);

  // --- freshness -----------------------------------------------------------
  // The seed is positioned relative to "now". If it was seeded yesterday and
  // left overnight, the dates above have all slid by a day.
  const newest = await prisma.booking.findFirst({ orderBy: { createdAt: 'desc' } });
  const seededToday = newest ? newest.createdAt >= new Date(`${today}T00:00:00Z`) : false;
  if (!seededToday) {
    console.log('WARN  seeded before today — re-run `npm run seed` before the demo');
  }

  console.log(failures === 0 ? '\nAll demo checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
