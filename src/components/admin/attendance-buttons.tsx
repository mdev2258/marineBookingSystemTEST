'use client';

import { useOptimistic, useTransition } from 'react';
import { markAttendance } from '@/app/admin/actions';

type Marked = 'paid' | 'attended' | 'no_show';

/**
 * The pontoon control. One thumb, bright sun, possibly wet hands:
 * two 48px targets, colour flips on touch, no dropdown and no modal.
 *
 * useOptimistic rather than a spinner, because on a phone with one bar of
 * signal the round trip is long enough to make the operator tap twice.
 */
export function AttendanceButtons({
  bookingId,
  status,
  name,
}: {
  bookingId: string;
  status: Marked;
  name: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic<Marked>(status);
  const [, startTransition] = useTransition();

  function choose(next: 'attended' | 'no_show') {
    startTransition(async () => {
      // Tapping the current state clears it; see markAttendance.
      setOptimistic(optimistic === next ? 'paid' : next);
      await markAttendance(bookingId, next);
    });
  }

  const base =
    'min-h-12 flex-1 rounded-md border-2 px-3 font-semibold transition-colors ' +
    'focus:outline-2 focus:outline-offset-2 focus:outline-brand-600';

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        aria-pressed={optimistic === 'attended'}
        aria-label={`Mark ${name} attended`}
        onClick={() => choose('attended')}
        className={
          optimistic === 'attended'
            ? `${base} border-emerald-700 bg-emerald-700 text-white`
            : `${base} border-slate-300 bg-white text-slate-900`
        }
      >
        Attended
      </button>
      <button
        type="button"
        aria-pressed={optimistic === 'no_show'}
        aria-label={`Mark ${name} a no-show`}
        onClick={() => choose('no_show')}
        className={
          optimistic === 'no_show'
            ? `${base} border-red-700 bg-red-700 text-white`
            : `${base} border-slate-300 bg-white text-slate-900`
        }
      >
        No-show
      </button>
    </div>
  );
}
