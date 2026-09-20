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
  'enquiry_received',
  'quote',
  'booking_confirmation',
  'cancellation',
  'rebook_confirmation',
  'reminder',
  'contact_form',
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
