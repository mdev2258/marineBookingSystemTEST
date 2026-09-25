import { prisma } from '@/lib/prisma';
import {
  EQUIPMENT_KIND_LABEL,
  type EquipmentKind,
  type JobColumn,
} from '@/lib/enums';
import {
  addMonths,
  londonDateString,
  monthsBetween,
  todayInLondon,
  yearsBetween,
  type LondonDate,
} from '@/lib/time';

/**
 * Work that is finished as far as the boat's history is concerned. Money may
 * still be owed on it -- an invoiced job is done work, and the record an
 * insurer asks for does not care whether the trade has been paid yet.
 */
export const COMPLETED_COLUMNS = ['done_to_invoice', 'invoiced', 'paid'] as const;

/** Rigging work, for the rig record variant. */
const RIG_KINDS: EquipmentKind[] = ['standing_rigging', 'running_rigging', 'furler'];

const BOAT_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  currentPlace: { select: { name: true, shortName: true, notes: true } },
  equipment: { orderBy: { kind: 'asc' } },
  moves: { orderBy: { movedOn: 'desc' } },
  bookings: {
    orderBy: { columnChangedAt: 'desc' },
    include: {
      place: { select: { shortName: true } },
      lineItems: { orderBy: { sortOrder: 'asc' } },
      variations: { orderBy: { createdAt: 'asc' } },
      partOrders: { orderBy: { item: 'asc' } },
      estimates: { orderBy: { createdAt: 'desc' } },
      invoices: { orderBy: { issuedOn: 'desc' } },
      // When the work was actually done, for workDate().
      visits: { where: { status: 'done' }, orderBy: { startsAt: 'desc' }, select: { startsAt: true } },
    },
  },
} as const;

export type BoatFile = NonNullable<Awaited<ReturnType<typeof loadBoatById>>>;
export type BoatJob = BoatFile['bookings'][number];

export async function loadBoatById(id: string) {
  return prisma.vessel.findUnique({ where: { id }, include: BOAT_INCLUDE });
}

/** The owner's way in. A token that matches nothing is simply not found. */
export async function loadBoatByToken(token: string) {
  if (!token) return null;
  return prisma.vessel.findUnique({ where: { ownerToken: token }, include: BOAT_INCLUDE });
}

export function isCompleted(job: { column: string }): boolean {
  return (COMPLETED_COLUMNS as readonly string[]).includes(job.column);
}

export function isRigJob(job: { lineItems: { description: string }[]; title: string }): boolean {
  const haystack = [job.title, ...job.lineItems.map((l) => l.description)].join(' ').toLowerCase();
  return /rig|mast|stay|shroud|forestay|backstay|halyard|furler|bottlescrew|turnbuckle|swage/.test(
    haystack,
  );
}

export function isRigEquipment(e: { kind: string }): boolean {
  return (RIG_KINDS as readonly string[]).includes(e.kind);
}

export type EquipmentAge = {
  label: string;
  /** "11 years old", "serviced 19 months ago" */
  age: string | null;
  /** Past its interval, or old enough that an insurer will ask. */
  due: boolean;
  /** Why it is due, in the words the owner will hear from their insurer. */
  note: string | null;
};

/**
 * How old a thing is, and whether that is a problem yet.
 *
 * The ten-year line is not arbitrary: policies commonly want standing rigging
 * replaced or professionally inspected somewhere in the 10-15 year range, and
 * most insurers want a dated receipt as proof. That is the sentence that sells
 * a rigging job, so the app says it in those terms rather than showing a date
 * and leaving the owner to work it out.
 */
export function describeEquipment(
  e: {
    kind: string;
    make: string | null;
    installedOn: string | null;
    lastServicedOn: string | null;
    serviceIntervalMonths: number | null;
  },
  today: LondonDate = todayInLondon(),
): EquipmentAge {
  const label = EQUIPMENT_KIND_LABEL[e.kind as EquipmentKind] ?? e.kind;

  if (e.kind === 'standing_rigging' && e.installedOn) {
    const years = yearsBetween(e.installedOn, today);
    return {
      label,
      age: `${years} year${years === 1 ? '' : 's'} old`,
      due: years >= 10,
      note:
        years >= 10
          ? 'Most insurers want rigging replaced or professionally inspected by 10-15 years, with a dated receipt.'
          : null,
    };
  }

  if (e.serviceIntervalMonths && e.lastServicedOn) {
    const months = monthsBetween(e.lastServicedOn, today);
    const due = e.lastServicedOn < addMonths(today, -e.serviceIntervalMonths);
    return {
      label,
      age: `serviced ${months} month${months === 1 ? '' : 's'} ago`,
      due,
      note: due ? `Service interval is ${e.serviceIntervalMonths} months.` : null,
    };
  }

  if (e.installedOn) {
    const years = yearsBetween(e.installedOn, today);
    return { label, age: `${years} year${years === 1 ? '' : 's'} old`, due: false, note: null };
  }

  return { label, age: null, due: false, note: null };
}

/**
 * The date a job's work is recorded against: when the work was DONE. Not
 * createdAt -- a job jotted in March and done in October is an October job,
 * and that is the date an insurer reads. And not the last column move either:
 * being paid in December does not make it December's work.
 *
 * The last visit marked done, else the first invoice (issued when the work
 * finished), else the day it landed in its finished column.
 */
export function workDate(job: {
  columnChangedAt: Date;
  visits?: { startsAt: Date }[];
  invoices?: { issuedOn: string; status: string }[];
}): LondonDate {
  const visit = job.visits?.[0];
  if (visit) return londonDateString(visit.startsAt);
  const issued = job.invoices?.filter((i) => i.status !== 'void').map((i) => i.issuedOn).sort()[0];
  return issued ?? londonDateString(job.columnChangedAt);
}

/**
 * What the owner's "Work we've done" lists for a job: the lines ticked off,
 * plus the extra work they approved. Leaving the approved extras out is
 * leaving out the bit they had to say yes to.
 */
export function workDoneItems(job: {
  lineItems: { description: string; done: boolean }[];
  variations: { description: string; status: string }[];
}): string[] {
  return [
    ...job.lineItems.filter((l) => l.done).map((l) => l.description),
    ...job.variations.filter((v) => v.status === 'approved').map((v) => v.description),
  ];
}

/**
 * Has this owner ever been shown a price for this job?
 *
 * The owner-facing page shows money ONLY where the trade already put a number
 * in front of them -- an estimate they were sent, or an invoice. Anything
 * else, including lines the trade is still pricing up, stays internal: an
 * owner discovering a running total they were never quoted is how a good
 * relationship turns into an argument.
 */
export function ownerHasSeenPrice(job: {
  estimates: { status: string }[];
  invoices: { status: string }[];
}): boolean {
  return (
    job.estimates.some((e) => e.status !== 'draft') || job.invoices.some((i) => i.status !== 'draft')
  );
}

/** What the owner is told a job is doing, in plain English (§7 F2). */
export function ownerStatusLine(
  job: { column: string; waitingReason: string | null; waitingUntil: string | null },
  labels: { column: Record<JobColumn, string>; reason: Record<string, string> },
): string {
  if (job.column === 'waiting' && job.waitingReason) {
    const reason = (labels.reason[job.waitingReason] ?? job.waitingReason).toLowerCase();
    return `Waiting for ${reason}`;
  }
  return labels.column[job.column as JobColumn] ?? job.column;
}
