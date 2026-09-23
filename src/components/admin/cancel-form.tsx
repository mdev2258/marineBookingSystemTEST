'use client';

import { useActionState, useState } from 'react';
import type { CancelState } from '@/app/admin/sessions/actions';
import { CANCELLATION_REASON, CANCELLATION_REASON_LABEL } from '@/lib/enums';

/**
 * Filled in one-handed at 06:30 having just looked at the forecast. Large radio
 * cards rather than a <select>, the consequence stated in plain words directly
 * above the button, and one full-width destructive action.
 */
export function CancelForm({
  action,
  affected,
}: {
  action: (prev: CancelState, formData: FormData) => Promise<CancelState>;
  affected: number;
}) {
  const [state, formAction, pending] = useActionState<CancelState, FormData>(action, {});
  // Controlled, so React's post-action form reset keeps the choice and the
  // typed note when the action comes back with an error.
  const [reason, setReason] = useState<string>(CANCELLATION_REASON[0]);
  const [note, setNote] = useState('');

  return (
    <form action={formAction} className="space-y-6">
      <fieldset aria-describedby={state.error ? 'cancel-error' : undefined}>
        <legend className="mb-3 font-medium">Why is it off?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {CANCELLATION_REASON.map((r) => (
            <label
              key={r}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-neutral-300 p-4 font-semibold hover:border-brand-500 has-checked:border-brand-600 has-checked:bg-brand-50"
            >
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="h-5 w-5"
              />
              {CANCELLATION_REASON_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="note" className="mb-1.5 block font-medium">
          Anything to tell them? <span className="font-normal text-neutral-500">(optional)</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Force 6 gusting 7 in the Solent"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-3 text-ink focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600"
        />
        <p className="mt-1.5 text-sm text-neutral-600">This appears word for word in their email.</p>
      </div>

      {state.error && (
        <p id="cancel-error" role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <p className="mb-3 font-medium">
          This will email {affected} customer{affected === 1 ? '' : 's'}.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 w-full rounded-md bg-red-700 px-5 font-semibold text-white hover:bg-red-800 focus:outline-2 focus:outline-offset-2 focus:outline-red-700 disabled:opacity-60"
        >
          {pending ? 'Cancelling and emailing…' : 'Cancel session and notify'}
        </button>
      </div>
    </form>
  );
}
