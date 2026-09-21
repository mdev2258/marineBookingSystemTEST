'use client';

import { useActionState } from 'react';
import { sendRemindersNow, type ReminderActionState } from '@/app/admin/actions';

export function ReminderButton({ due }: { due: number }) {
  const [state, action, pending] = useActionState<ReminderActionState, FormData>(
    sendRemindersNow,
    {},
  );

  return (
    <form action={action} className="rounded-lg border border-divider p-4">
      <h2 className="font-semibold">Reminders for tomorrow</h2>
      {state.result ? (
        <p className="mt-1 text-neutral-700">
          Sent {state.result.sent} of {state.result.considered}
          {state.result.failed > 0 ? ` · ${state.result.failed} failed` : ''}.
        </p>
      ) : (
        <p className="mt-1 text-neutral-700">
          {due === 0
            ? 'Everyone on tomorrow has already been reminded.'
            : `${due} booking${due === 1 ? '' : 's'} still to remind.`}
        </p>
      )}
      <p className="mt-1 text-sm text-neutral-600">
        This runs by itself at 17:00 each day. The button does the same thing, now.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="mt-3 min-h-12 w-full rounded-md border-2 border-brand-600 px-5 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Sending…' : 'Send reminders now'}
      </button>
    </form>
  );
}
