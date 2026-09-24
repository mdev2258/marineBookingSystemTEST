import { prisma } from '@/lib/prisma';
import {
  addDays,
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
/**
 * Every boat kept afloat, sail or motor, is antifouled once a year at the
 * spring lift-out. Asked a month ahead of commissioning so the lift gets booked
 * before the yard's hoist fills up.
 */
const ANTIFOUL_MONTH = 1;

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
  if (month === WINTERISE_MONTH || month === COMMISSION_MONTH || month === ANTIFOUL_MONTH) {
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
      if (month === ANTIFOUL_MONTH) {
        due.push({
          vesselId: v.id,
          equipmentId: null,
          kind: 'antifoul',
          dueOn: today,
          message: 'Antifoul for the coming season — worth booking the lift-out before the spring rush.',
        });
      }
    }
  }

  return due;
}

export type SweepResult = { found: number; created: number; alreadyOpen: number; lapsed: number };

/**
 * How long a CLOSED non-seasonal reminder -- skipped by the trade, or answered
 * "yes" by the owner -- keeps the same question from being asked again,
 * counted from the answer (closedAt ?? createdAt).
 *
 * Without this, "Skip" lasted until midnight. The sweep runs nightly and the
 * rigging is still old tomorrow, so a skipped boat was back on the list by
 * morning -- and an owner who said "yes, book me in" was asked again the
 * following week, because the rig stays old until the job is DONE. That is
 * the difference between a reminder and spam.
 */
const QUIET_MONTHS = 11;

/**
 * Seasonal kinds are asked ONCE PER SEASON, keyed to the year, not by a quiet
 * period. Counting 11 months from a late answer (a February ask answered in
 * April) would block the next February, and the boat would skip a season.
 */
const SEASONAL_KINDS = ['antifoul', 'commission', 'winterise'];

/** A sent reminder the owner has ignored this long is closed by the sweep. */
const IGNORED_DAYS = 60;

/**
 * The due occurrence a reminder belongs to. Seasonal: the year, so one per
 * season. Others: the dueOn year-month -- dueOn is the sweep date, and the
 * quiet period means the same question cannot legitimately be asked twice in
 * one month, so this is stable across overlapping sweeps (same night, same
 * key) without ever colliding with a fair re-ask 11+ months later.
 */
export function reminderPeriod(kind: string, dueOn: LondonDate): string {
  return SEASONAL_KINDS.includes(kind) ? dueOn.slice(0, 4) : dueOn.slice(0, 7);
}

/** Reminder.dedupeKey. Unique in the DB, so a duplicate insert is refused. */
export function dedupeKeyFor(r: {
  vesselId: string;
  kind: string;
  equipmentId: string | null;
  dueOn: LondonDate;
}): string {
  return `${r.vesselId}|${r.kind}|${r.equipmentId ?? ''}|${reminderPeriod(r.kind, r.dueOn)}`;
}

/**
 * Does this existing reminder stop the same question being asked today?
 * Still in play (upcoming/sent): yes. Seasonal and closed: only in the same
 * year. Otherwise closed: only within QUIET_MONTHS of the answer.
 */
export function blocksNewAsk(
  r: { kind: string; status: string; dueOn: LondonDate; closedAt: Date | null; createdAt: Date },
  today: LondonDate,
): boolean {
  if (r.status === 'upcoming' || r.status === 'sent') return true;
  if (SEASONAL_KINDS.includes(r.kind)) return r.dueOn.slice(0, 4) === today.slice(0, 4);
  return (r.closedAt ?? r.createdAt) >= londonDayBounds(addMonths(today, -QUIET_MONTHS)).start;
}

/**
 * Write the ones that are not already on the list.
 *
 * IDEMPOTENT BY DESIGN, and it has to be: this runs nightly, and the rules
 * above keep returning "the rigging is still old" every single night until
 * somebody does something about it. Two guards: the in-memory open-set filter
 * (blocksNewAsk) keeps the list clean, and the unique dedupeKey with
 * skipDuplicates makes the DATABASE refuse the copy when two sweeps overlap.
 */
export async function sweepDueWork(today: LondonDate = todayInLondon()): Promise<SweepResult> {
  // An owner who never answers closes the question, so it can be asked again
  // next time instead of never. closedAt starts the quiet period.
  const { count: lapsed } = await prisma.reminder.updateMany({
    where: { status: 'sent', sentAt: { lt: londonDayBounds(addDays(today, -IGNORED_DAYS)).start } },
    data: { status: 'dismissed', closedAt: new Date() },
  });

  const due = await findDueWork(today);
  const quietSince = londonDayBounds(addMonths(today, -QUIET_MONTHS)).start;

  // One read and one insert, not a count + create per due item. The WHERE is a
  // superset; blocksNewAsk is the rule.
  const rows = await prisma.reminder.findMany({
    where: {
      OR: [
        { status: { in: ['upcoming', 'sent'] } },
        { closedAt: { gte: quietSince } },
        { closedAt: null, createdAt: { gte: quietSince } },
        { dueOn: { gte: `${today.slice(0, 4)}-01-01` } },
      ],
    },
    select: { vesselId: true, kind: true, equipmentId: true, status: true, dueOn: true, closedAt: true, createdAt: true },
  });
  const keyOf = (r: { vesselId: string; kind: string; equipmentId: string | null }) =>
    `${r.vesselId}|${r.kind}|${r.equipmentId ?? ''}`;
  const openKeys = new Set(rows.filter((r) => blocksNewAsk(r, today)).map(keyOf));

  const toCreate = due.filter((d) => {
    const key = keyOf(d);
    if (openKeys.has(key)) return false;
    openKeys.add(key);
    return true;
  });

  const { count: created } = await prisma.reminder.createMany({
    data: toCreate.map((d) => ({
      vesselId: d.vesselId,
      equipmentId: d.equipmentId,
      kind: d.kind,
      dueOn: d.dueOn,
      status: 'upcoming',
      message: d.message,
      dedupeKey: dedupeKeyFor(d),
    })),
    skipDuplicates: true,
  });

  return { found: due.length, created, alreadyOpen: due.length - created, lapsed };
}
