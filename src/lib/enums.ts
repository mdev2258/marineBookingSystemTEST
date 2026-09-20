// Status vocabularies live here as TS unions, not as Prisma `enum` blocks.
// Prisma enum support on SQLite has been inconsistent across versions; a plain
// String column generates identical SQL on SQLite and Postgres.

export const BOOKING_STATUS = [
  'pending_payment',
  'paid',
  'expired',
  'cancelled',
  'awaiting_rebook',
  'attended',
  'no_show',
] as const;
export type BookingStatus = (typeof BOOKING_STATUS)[number];

/** Statuses that unconditionally occupy a seat. */
export const CAPACITY_CONSUMING_STATUSES = ['paid', 'attended', 'no_show'] as const;

export const SESSION_STATUS = ['scheduled', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUS)[number];

export const CANCELLATION_REASON = ['weather', 'tide', 'mechanical', 'other'] as const;
export type CancellationReason = (typeof CANCELLATION_REASON)[number];

export const CANCELLATION_REASON_LABEL: Record<CancellationReason, string> = {
  weather: 'Weather',
  tide: 'Tide / sea state',
  mechanical: 'Mechanical',
  other: 'Other',
};

export const EMAIL_TYPE = [
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
  pending_payment: 'Awaiting payment',
  paid: 'Confirmed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  awaiting_rebook: 'Awaiting rebook',
  attended: 'Attended',
  no_show: 'No-show',
};

export function isBookingStatus(v: string): v is BookingStatus {
  return (BOOKING_STATUS as readonly string[]).includes(v);
}

export function isCancellationReason(v: string): v is CancellationReason {
  return (CANCELLATION_REASON as readonly string[]).includes(v);
}
