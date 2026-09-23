// Status vocabularies live here as TS unions, not as Prisma `enum` blocks.
// Prisma enum support on SQLite has been inconsistent across versions; a plain
// String column generates identical SQL on SQLite and Postgres.

/**
 * The life of a job.
 *
 *   enquiry --quote--> quoted --accept--> pending_payment --pay--> paid
 *      |                  |                     |                   |
 *      |                  +-declined            +-expired           +-> completed | no_show
 *      |                                                            |
 *      +-cancelled (either side, any time)                          +-(slot cancelled)-> awaiting_rebook --rebook--> paid
 *
 * A job exists BEFORE it has a price. That is the difference between this and
 * a ticketed booking system, and it is why quotedPence and depositPence are
 * both nullable.
 */
export const BOOKING_STATUS = [
  'enquiry',
  'quoted',
  'declined',
  'pending_payment',
  'paid',
  'expired',
  'cancelled',
  'awaiting_rebook',
  'completed',
  'no_show',
] as const;
export type BookingStatus = (typeof BOOKING_STATUS)[number];

/**
 * Statuses that unconditionally occupy a place in a slot.
 *
 * An enquiry or a quote does NOT hold the yard's diary open -- otherwise a
 * tyre-kicker who never replies blocks a crane slot indefinitely. Only money,
 * or a live hold on the way to money, reserves the space.
 */
export const CAPACITY_CONSUMING_STATUSES = ['paid', 'completed', 'no_show'] as const;

/** Waiting on the yard or on the customer, rather than on the water. */
export const OPEN_JOB_STATUSES = ['enquiry', 'quoted'] as const;

export const SESSION_STATUS = ['scheduled', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUS)[number];

export const CANCELLATION_REASON = ['weather', 'tide', 'mechanical', 'other'] as const;
export type CancellationReason = (typeof CANCELLATION_REASON)[number];

export const CANCELLATION_REASON_LABEL: Record<CancellationReason, string> = {
  weather: 'Weather',
  tide: 'Tide / sea state',
  mechanical: 'Crane or plant',
  other: 'Other',
};

export const EMAIL_TYPE = [
  // Trades product.
  'estimate',
  'variation',
  'variation_reminder',
  'job_update',
  'visit_postponed',
  'service_reminder',
  'invoice',
  'invoice_reminder',
  'contact_form',
  // Parked yard flow. Still valid: the rows they wrote are still counted.
  'enquiry_received',
  'quote',
  'booking_confirmation',
  'cancellation',
  'rebook_confirmation',
  'reminder',
] as const;
export type EmailType = (typeof EMAIL_TYPE)[number];

export const EMAIL_STATUS = ['sent', 'failed'] as const;
export type EmailStatus = (typeof EMAIL_STATUS)[number];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  enquiry: 'Awaiting quote',
  quoted: 'Quote sent',
  declined: 'Quote declined',
  pending_payment: 'Awaiting deposit',
  paid: 'Booked in',
  expired: 'Expired',
  cancelled: 'Cancelled',
  awaiting_rebook: 'Awaiting rebook',
  completed: 'Work done',
  no_show: 'Boat not ready',
};

export function isBookingStatus(v: string): v is BookingStatus {
  return (BOOKING_STATUS as readonly string[]).includes(v);
}

export function isCancellationReason(v: string): v is CancellationReason {
  return (CANCELLATION_REASON as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// THE BOARD — ANALYSIS-TRADES.md §4.
//
// Everything above this line except EMAIL_* belongs to the PARKED yard flow.
// Board code reads Booking.column, never Booking.status.
// ---------------------------------------------------------------------------

/**
 * The eight board columns, in board order. A card's column IS its state.
 *
 * 'paid' is a ninth value that is deliberately NOT a column: a paid job drops
 * off the board into the boat's history. Keeping it in the same field means
 * "where is this job" has exactly one answer.
 */
export const JOB_COLUMN = [
  'jotted',
  'enquiry',
  'estimate_sent',
  'booked',
  'waiting',
  'on_it',
  'done_to_invoice',
  'invoiced',
] as const;
export type JobColumn = (typeof JOB_COLUMN)[number];

/** Off-board. A job here is history, not work in hand. */
export const JOB_COLUMN_ARCHIVED = 'paid' as const;

export const JOB_COLUMN_LABEL: Record<JobColumn, string> = {
  jotted: 'Jotted',
  enquiry: 'Enquiry',
  estimate_sent: 'Estimate sent',
  booked: 'Booked',
  waiting: 'Waiting',
  on_it: 'On it',
  done_to_invoice: 'Done — to invoice',
  invoiced: 'Invoiced',
};

/** What the owner is told, in plain English. Never show them 'done_to_invoice'. */
export const JOB_COLUMN_OWNER_LABEL: Record<JobColumn, string> = {
  jotted: 'Noted',
  enquiry: 'Looking into it',
  estimate_sent: 'Estimate sent — waiting for you',
  booked: 'Booked in',
  waiting: 'Waiting',
  on_it: 'In progress',
  done_to_invoice: 'Finished',
  invoiced: 'Invoiced',
};

export function isJobColumn(v: string): v is JobColumn {
  return (JOB_COLUMN as readonly string[]).includes(v);
}

/**
 * Why a card is stuck. A card in the Waiting column MUST carry one of these --
 * enforced on the write path, because "waiting" with no reason is exactly the
 * hole that things fall into on a scrap of paper.
 */
export const WAITING_REASON = [
  'yard_lift',
  'crane',
  'parts',
  'owner_decision',
  'weather',
  'tide',
  'access',
  'other',
] as const;
export type WaitingReason = (typeof WAITING_REASON)[number];

export const WAITING_REASON_LABEL: Record<WaitingReason, string> = {
  yard_lift: 'Yard lift',
  crane: 'Crane',
  parts: 'Parts',
  owner_decision: 'Owner decision',
  weather: 'Weather',
  tide: 'Tide',
  access: 'Access / keys',
  other: 'Other',
};

export function isWaitingReason(v: string): v is WaitingReason {
  return (WAITING_REASON as readonly string[]).includes(v);
}

export const PLACE_KIND = ['yard', 'marina', 'mooring', 'drying_mooring', 'trailer', 'other'] as const;
export type PlaceKind = (typeof PLACE_KIND)[number];

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  yard: 'Yard',
  marina: 'Marina',
  mooring: 'Mooring',
  drying_mooring: 'Drying mooring',
  trailer: 'Trailer',
  other: 'Other',
};

export const EQUIPMENT_KIND = [
  'engine',
  'outboard',
  'standing_rigging',
  'running_rigging',
  'furler',
  'sail',
  'seacock',
  'gas',
  'electrics',
  'other',
] as const;
export type EquipmentKind = (typeof EQUIPMENT_KIND)[number];

export const EQUIPMENT_KIND_LABEL: Record<EquipmentKind, string> = {
  engine: 'Engine',
  outboard: 'Outboard',
  standing_rigging: 'Standing rigging',
  running_rigging: 'Running rigging',
  furler: 'Furler',
  sail: 'Sail',
  seacock: 'Seacocks',
  gas: 'Gas',
  electrics: 'Electrics',
  other: 'Other',
};

/** A line of work. Labour is priced off the business's default rate. */
export const LINE_KIND = ['labour', 'parts', 'subcontract', 'other'] as const;
export type LineKind = (typeof LINE_KIND)[number];

export const LINE_KIND_LABEL: Record<LineKind, string> = {
  labour: 'Labour',
  parts: 'Parts',
  subcontract: 'Subcontract',
  other: 'Other',
};

export const ESTIMATE_STATUS = ['draft', 'sent', 'accepted', 'declined', 'superseded'] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUS)[number];

export const VARIATION_STATUS = ['awaiting_owner', 'approved', 'declined', 'withdrawn'] as const;
export type VariationStatus = (typeof VARIATION_STATUS)[number];

/**
 * How a decision reached us. 'phone' is a first-class citizen, not a fallback:
 * ANALYSIS-TRADES.md §3.5 -- the app records what happened, it never forces
 * the owner online.
 */
export const DECIDED_VIA = ['link', 'phone', 'in_person', 'text'] as const;
export type DecidedVia = (typeof DECIDED_VIA)[number];

export const DECIDED_VIA_LABEL: Record<DecidedVia, string> = {
  link: 'By link',
  phone: 'Agreed by phone',
  in_person: 'Agreed in person',
  text: 'Agreed by text',
};

/**
 * The same thing as a bare phrase, for sentences that supply their own verb:
 * "agreed by phone", "declined in person". DECIDED_VIA_LABEL carries "Agreed"
 * inside it, which reads as "agreed — agreed by phone" when a caller has
 * already said it.
 */
export const DECIDED_VIA_PLAIN: Record<DecidedVia, string> = {
  link: 'by link',
  phone: 'by phone',
  in_person: 'in person',
  text: 'by text',
};

export function isDecidedVia(v: string): v is DecidedVia {
  return (DECIDED_VIA as readonly string[]).includes(v);
}

export const VISIT_STATUS = ['planned', 'done', 'postponed'] as const;
export type VisitStatus = (typeof VISIT_STATUS)[number];

export const INVOICE_STATUS = ['draft', 'sent', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export const PAID_VIA = ['link', 'bank', 'cash', 'card_machine'] as const;
export type PaidVia = (typeof PAID_VIA)[number];

export const PAID_VIA_LABEL: Record<PaidVia, string> = {
  link: 'Card, by link',
  bank: 'Bank transfer',
  cash: 'Cash',
  card_machine: 'Card machine',
};

export const REMINDER_KIND = [
  'service_due',
  'rig_age',
  'antifoul',
  'winterise',
  'commission',
  'custom',
] as const;
export type ReminderKind = (typeof REMINDER_KIND)[number];

export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  service_due: 'Service due',
  rig_age: 'Rigging age',
  antifoul: 'Antifoul',
  winterise: 'Winterisation',
  commission: 'Spring commissioning',
  custom: 'Reminder',
};

/**
 * What the card is called when an owner says yes. REMINDER_KIND_LABEL names the
 * REASON ("Rigging age"); this names the JOB, because it sits on the board next
 * to "Engine service + impeller" and has to read like one.
 */
export const REMINDER_JOB_TITLE: Record<ReminderKind, string> = {
  service_due: 'Engine service',
  rig_age: 'Standing rigging — inspect or replace',
  antifoul: 'Antifoul',
  winterise: 'Winterisation',
  commission: 'Spring commissioning',
  custom: 'Booked from a reminder',
};

export const REMINDER_STATUS = ['upcoming', 'sent', 'booked', 'dismissed'] as const;
export type ReminderStatus = (typeof REMINDER_STATUS)[number];


/**
 * Why a planned visit did not happen.
 *
 * Deliberately NOT the same list as WAITING_REASON. A card waits on things
 * that were never scheduled ("parts", "owner decision"); a visit is postponed
 * from a date that existed, and the owner had it in their diary. The overlap
 * is real but the audiences differ -- a waiting reason is for the trade, a
 * postpone reason goes in an email to someone whose weekend just changed.
 */
export const POSTPONE_REASON = ['weather', 'tide', 'parts', 'access', 'crane', 'other'] as const;
export type PostponeReason = (typeof POSTPONE_REASON)[number];

export const POSTPONE_REASON_LABEL: Record<PostponeReason, string> = {
  weather: 'Weather',
  tide: 'Tide',
  parts: 'Parts not here',
  access: 'Could not get to her',
  crane: 'Crane or lift',
  other: 'Other',
};

/** What the OWNER is told. They do not care whose fault it was, only why. */
export const POSTPONE_REASON_OWNER: Record<PostponeReason, string> = {
  weather: 'the weather',
  tide: 'the tide',
  parts: 'a part that has not arrived',
  access: 'not being able to get to her',
  crane: 'the lift being moved',
  other: 'something outside our control',
};

export function isPostponeReason(v: string): v is PostponeReason {
  return (POSTPONE_REASON as readonly string[]).includes(v);
}
