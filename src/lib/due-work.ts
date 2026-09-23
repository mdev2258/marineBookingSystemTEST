import { prisma } from '@/lib/prisma';
import {
  addMonths,
  addYears,
  londonDayBounds,
  londonMonth,
  todayInLondon,
  yearsBetween,
  type LondonDate,
} from '@/lib/time';

/**
 * WORK THIS BOAT IS DUE.
 *
 * This is the sales pitch (ANALYSIS-TRADES.md §7 F5). Everything else in the
 * app helps the trade keep hold of work they already have; this is the only
 * part that GOES AND FINDS SOME. It is also the argument for keeping boat
 * records at all: the rigger who holds the dated history is the one whose
 * email lands when the insurer starts asking questions.
 *
 * Nothing here contacts anybody. It only works out what is due; sending is a
 * separate, deliberate act by the trade on the "due this month" screen. An app
 * that emailed customers on a timer, unattended, would burn the relationship
 * this whole product is built on.
 */

/**
 * The line insurers draw. Policies commonly want standing rigging replaced or
 * professionally inspected somewhere in the 10-15 year range, so 10 is when
 * the conversation becomes worth having rather than when the rig is unsafe.
 */
const RIG_YEARS = 10;

/** Sailing boats lay up; motor boats mostly do not. */
const WINTERISE_MONTH = 9;
/** Everyone wants the same fortnight in spring, so ask early. */
const COMMISSION_MONTH = 2;

export type DueReminder = {
  vesselId: string;
  equipmentId: string | null;
  kind: string;
  dueOn: LondonDate;
  message: string;
};

/**
 * Work out what is due, without writing anything.
 *
 * Split out from the writing so it can be reasoned about and tested on its
 * own -- the rules are the interesting part, the insert is not.
 */
export async function findDueWork(today: LondonDate = todayInLondon()): Promise<DueReminder[]> {
  const due: DueReminder[] = [];

  const equipment = await prisma.equipment.findMany({
    select: {
      id: true,
      vesselId: true,
      kind: true,
      installedOn: true,
      lastServicedOn: true,
      serviceIntervalMonths: true,
    },
  });

  for (const e of equipment) {
    if (e.kind === 'standing_rigging' && e.installedOn && e.installedOn <= addYears(today, -RIG_YEARS)) {
      const years = yearsBetween(e.installedOn, today);
      due.push({
        vesselId: e.vesselId,
        equipmentId: e.id,
        kind: 'rig_age',
        dueOn: today,
        message: `Standing rigging is ${years} years old. Most insurers want it replaced or professionally inspected somewhere around 10-15 years, and they will ask for a dated receipt.`,
      });
      continue;
    }

    if (
      (e.kind === 'engine' || e.kind === 'outboard') &&
      e.serviceIntervalMonths &&
      e.lastServicedOn &&
      e.lastServicedOn < addMonths(today, -e.serviceIntervalMonths)
    ) {
      due.push({
        vesselId: e.vesselId,
        equipmentId: e.id,
        kind: 'service_due',
        dueOn: today,
        message: `The ${e.kind === 'outboard' ? 'outboard' : 'engine'} is past its service interval.`,
      });
    }
  }

  // Seasonal sweeps. A boat with standing rigging is a sailing boat -- derived
  // rather than stored, because a `isSailingBoat` column would be one more
  // thing to get wrong on a boat created from a jot.
  const month = londonMonth(today);
  if (month === WINTERISE_MONTH || month === COMMISSION_MONTH) {
    const vessels = await prisma.vessel.findMany({
      select: { id: true, equipment: { select: { kind: true } } },
    });

    for (const v of vessels) {
      const sails = v.equipment.some((e) => e.kind === 'standing_rigging');
      if (month === WINTERISE_MONTH && sails) {
        due.push({
          vesselId: v.id,
          equipmentId: null,
          kind: 'winterise',
          dueOn: today,
          message: 'Worth booking winterisation before the first hard frost.',
        });
      }
      if (month === COMMISSION_MONTH) {
        due.push({
          vesselId: v.id,
          equipmentId: null,
          kind: 'commission',
          dueOn: today,
          message: 'Spring commissioning — everyone wants the same fortnight, so worth booking early.',
        });
      }
    }
  }

  return due;
}

export type SweepResult = { found: number; created: number; alreadyOpen: number };

/**
 * How long a CLOSED reminder -- skipped by the trade, or answered "yes" by the
 * owner -- keeps the same question from being asked again.
 *
 * Eleven months, not twelve, so the seasonal ones come round again: a
 * winterisation reminder closed in late September must not block the next
 * one in early September a year later.
 *
 * Without this, "Skip" lasted until midnight. The sweep runs nightly and the
 * rigging is still old tomorrow, so a skipped boat was back on the list by
 * morning -- and an owner who said "yes, book me in" was asked again the
 * following week, because the rig stays old until the job is DONE. That is
 * the difference between a reminder and spam.
 */
const QUIET_MONTHS = 11;

/**
 * Write the ones that are not already on the list.
 *
 * IDEMPOTENT BY DESIGN, and it has to be: this runs nightly, and the rules
 * above keep returning "the rigging is still old" every single night until
 * somebody does something about it. Without the open-reminder check the trade
 * would open the screen to forty copies of the same boat and stop opening it.
 *
 * "Open" means upcoming or sent, OR closed (skipped, or said yes to) within
 * the last QUIET_MONTHS. After that the question is fair again -- the rigging
 * is a year older and the owner may have changed their mind.
 */
export async function sweepDueWork(today: LondonDate = todayInLondon()): Promise<SweepResult> {
  const due = await findDueWork(today);
  const quietSince = londonDayBounds(addMonths(today, -QUIET_MONTHS)).start;

  let created = 0;
  let alreadyOpen = 0;

  for (const d of due) {
    const open = await prisma.reminder.count({
      where: {
        vesselId: d.vesselId,
        kind: d.kind,
        equipmentId: d.equipmentId,
        OR: [
          // Still in play.
          { status: { in: ['upcoming', 'sent'] } },
          // Closed recently -- skipped, or said yes to. Leave them be.
          { status: { in: ['dismissed', 'booked'] }, createdAt: { gte: quietSince } },
        ],
      },
    });

    if (open > 0) {
      alreadyOpen++;
      continue;
    }

    await prisma.reminder.create({
      data: {
        vesselId: d.vesselId,
        equipmentId: d.equipmentId,
        kind: d.kind,
        dueOn: d.dueOn,
        status: 'upcoming',
        message: d.message,
      },
    });
    created++;
  }

  return { found: due.length, created, alreadyOpen };
}
