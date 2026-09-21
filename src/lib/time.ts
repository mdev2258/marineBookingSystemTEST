import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * EVERY London <-> UTC conversion in this codebase goes through this file.
 * Nothing else may import date-fns-tz.
 *
 * Why it matters: Vercel runs in UTC, a UK laptop runs GMT+1 for half the year,
 * and BST ends on 25 October. A session stored as 17:30 UTC is 18:30 on the
 * pontoon in July and 17:30 in November. All DB instants are UTC; all display
 * and all "which day is this?" logic is Europe/London.
 */
export const LONDON = 'Europe/London';

/** A calendar date with no time and no zone, always "yyyy-MM-dd". */
export type LondonDate = string;

/** Which London calendar day does this instant fall on? */
export function londonDateString(instant: Date): LondonDate {
  return formatInTimeZone(instant, LONDON, 'yyyy-MM-dd');
}

/** Today in London. Not the server's today. */
export function todayInLondon(now: Date = new Date()): LondonDate {
  return londonDateString(now);
}

/**
 * Calendar arithmetic on the date string itself, via UTC midnight, so adding a
 * day across the BST boundary can never produce a 23- or 25-hour drift.
 */
export function addDays(date: LondonDate, days: number): LondonDate {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const nd = new Date(t);
  return `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, '0')}-${String(
    nd.getUTCDate(),
  ).padStart(2, '0')}`;
}

/**
 * The UTC instants bracketing a London calendar day: [start, end).
 * On 26 Oct this correctly spans 25 hours; on 30 Mar, 23.
 */
export function londonDayBounds(date: LondonDate): { start: Date; end: Date } {
  return {
    start: fromZonedTime(`${date}T00:00:00`, LONDON),
    end: fromZonedTime(`${addDays(date, 1)}T00:00:00`, LONDON),
  };
}

/** "2026-09-19" + "09:30" (London wall clock) -> the UTC instant. */
export function londonDateTimeToUtc(date: LondonDate, hhmm: string): Date {
  return fromZonedTime(`${date}T${hhmm}:00`, LONDON);
}

/** 09:30 */
export function formatTime(instant: Date): string {
  return formatInTimeZone(instant, LONDON, 'HH:mm');
}

/** Sat 19 Sep */
export function formatDateShort(instant: Date): string {
  return formatInTimeZone(instant, LONDON, 'EEE d MMM');
}

/** Saturday 19 September 2026 */
export function formatDateLong(instant: Date): string {
  return formatInTimeZone(instant, LONDON, 'EEEE d MMMM yyyy');
}

/** Saturday 19 September, 09:30 */
export function formatDateTime(instant: Date): string {
  return formatInTimeZone(instant, LONDON, 'EEEE d MMMM, HH:mm');
}

/** 09:30 - 13:30 */
export function formatTimeRange(startsAt: Date, endsAt: Date): string {
  return `${formatTime(startsAt)} - ${formatTime(endsAt)}`;
}

/** Saturday 19 September 2026 (for a bare date string, e.g. the day-view header) */
export function formatLondonDateString(date: LondonDate): string {
  return formatInTimeZone(londonDayBounds(date).start, LONDON, 'EEEE d MMMM yyyy');
}

/** "in 18 minutes" / "expired" -- used for the pending-payment hold countdown. */
export function minutesUntil(instant: Date, now: Date = new Date()): number {
  return Math.round((instant.getTime() - now.getTime()) / 60_000);
}

/**
 * Calendar arithmetic in MONTHS on the date string itself.
 *
 * Clamps to the end of the shorter month, so 31 Jan + 1 month is 28 Feb and
 * not 3 March. Service intervals are quoted in months ("annual service", "every
 * 24 months") and a rolling reminder that drifts a day every year is a reminder
 * nobody trusts.
 */
export function addMonths(date: LondonDate, months: number): LondonDate {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return londonDateString(target);
}

/** Calendar arithmetic in YEARS. Standing rigging is quoted in years. */
export function addYears(date: LondonDate, years: number): LondonDate {
  return addMonths(date, years * 12);
}

/**
 * Whole years between two London dates, rounded down: "standing rigging is 11
 * years old". Counts completed anniversaries, so it never reads a day early.
 */
export function yearsBetween(from: LondonDate, to: LondonDate): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let years = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) years -= 1;
  return years;
}

/** Whole months between two London dates, rounded down. */
export function monthsBetween(from: LondonDate, to: LondonDate): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/** The London month, 1-12. Drives the seasonal reminder sweeps. */
export function londonMonth(date: LondonDate): number {
  return Number(date.split('-')[1]);
}

/** "Thu 16 Oct", from a bare LondonDate rather than an instant. */
export function formatLondonDateShort(date: LondonDate): string {
  return formatInTimeZone(londonDayBounds(date).start, LONDON, 'EEE d MMM');
}

/**
 * Whole days between two London dates. Negative when `to` is earlier.
 * Used for "in Waiting for 9 days" and "19 days outstanding".
 */
export function daysBetween(from: LondonDate, to: LondonDate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}
