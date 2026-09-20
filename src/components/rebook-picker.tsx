'use client';

import { useActionState } from 'react';
import type { RebookState } from '@/app/rebook/actions';

export type RebookOption = {
  id: string;
  when: string;
  /** Tide or access note, shown because it decides whether the date works. */
  note?: string | null;
  spacesLeft: number;
};

export function RebookPicker({
  action,
  options,
}: {
  action: (prev: RebookState, formData: FormData) => Promise<RebookState>;
  options: RebookOption[];
}) {
  const [state, formAction, pending] = useActionState<RebookState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-6">
      <fieldset>
        <legend className="mb-3 font-medium">Pick a new date</legend>
        <div className="space-y-3">
          {options.map((option, i) => (
            <label
              key={option.id}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-slate-300 p-4 hover:border-brand-500 has-checked:border-brand-600 has-checked:bg-brand-50"
            >
              <input
                type="radio"
                name="sessionId"
                value={option.id}
                // Soonest is pre-selected, but this is a picker and not a
                // one-click auto-move: the date has to be theirs to choose.
                defaultChecked={i === 0}
                className="h-5 w-5 shrink-0"
              />
              <span>
                <span className="block font-semibold">{option.when}</span>
                {option.note && (
                  <span className="block text-sm font-medium text-brand-700">{option.note}</span>
                )}
                <span className="block text-sm text-slate-600">
                  {option.spacesLeft} space{option.spacesLeft === 1 ? '' : 's'} left
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600 disabled:opacity-60"
      >
        {pending ? 'Moving your booking…' : 'Confirm new date'}
      </button>
      <p className="text-sm text-slate-600">
        Nothing further to pay — your deposit moves with you.
      </p>
    </form>
  );
}
