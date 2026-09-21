import { BOOKING_STATUS_LABEL, type BookingStatus } from '@/lib/enums';

/**
 * The system's status pill: three tones only, square, 9px condensed caps.
 *
 *   ok   settled, done, complete
 *   now  live, running, due now
 *   due  pending, blocked, awaiting
 */
export type PillTone = 'ok' | 'now' | 'due';

const TONE: Record<PillTone, string> = {
  ok: 'bg-accent-100 text-accent-700',
  now: 'bg-accent text-bg',
  due: 'bg-neutral-200 text-neutral-700',
};

export function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={`${TONE[tone]} inline-block shrink-0 px-2 py-1 font-condensed text-[9px] font-semibold uppercase leading-none tracking-[0.1em]`}
    >
      {children}
    </span>
  );
}

/**
 * Where a job sits, in the pill vocabulary. Anything the yard or the owner is
 * still waiting on reads as `due`; work actually happening reads as `now`.
 */
const JOB_TONE: Record<BookingStatus, PillTone> = {
  enquiry: 'due',
  quoted: 'due',
  declined: 'due',
  pending_payment: 'now',
  paid: 'now',
  expired: 'due',
  cancelled: 'due',
  awaiting_rebook: 'due',
  completed: 'ok',
  no_show: 'due',
};

export function JobPill({ status }: { status: string }) {
  const s = status as BookingStatus;
  return <Pill tone={JOB_TONE[s] ?? 'due'}>{BOOKING_STATUS_LABEL[s] ?? status}</Pill>;
}

/**
 * Payment state is deliberately NOT a pill in this system -- it is small
 * uppercase text, accent when settled and neutral otherwise.
 */
export function PaymentState({ label, settled }: { label: string; settled: boolean }) {
  return (
    <span
      className={`font-condensed text-[9px] font-semibold uppercase leading-none tracking-[0.08em] ${
        settled ? 'text-accent-700' : 'text-neutral-600'
      }`}
    >
      {label}
    </span>
  );
}
