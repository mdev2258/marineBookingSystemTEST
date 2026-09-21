'use client';

import { useActionState } from 'react';
import type { QuoteState } from '@/app/admin/enquiries/actions';

export type SlotOption = { id: string; label: string };

const field =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-3 text-ink ' +
  'focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600';

function Err({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm font-medium text-red-700">{message}</p>;
}

export function QuoteForm({
  action,
  slots,
  currentPrice,
  currentNotes,
  currentSessionId,
  alreadyQuoted,
}: {
  action: (prev: QuoteState, formData: FormData) => Promise<QuoteState>;
  slots: SlotOption[];
  currentPrice: string;
  currentNotes: string;
  currentSessionId: string;
  alreadyQuoted: boolean;
}) {
  const [state, formAction, pending] = useActionState<QuoteState, FormData>(action, {});

  if (state.ok) {
    return (
      <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 font-medium text-emerald-900">
        Quote sent. They have a link to accept it.
      </p>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
        No free slot for this work. Open one in the diary before you quote — the price and the date
        go out together.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-4 border-t border-divider pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Price (£)</label>
          <input
            name="price"
            inputMode="decimal"
            defaultValue={currentPrice}
            placeholder="650"
            className={field}
          />
          <Err message={state.errors?.price} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Book her in for</label>
          <select name="sessionId" defaultValue={currentSessionId} className={field}>
            <option value="">Choose a slot…</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <Err message={state.errors?.sessionId} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">What the price covers</label>
        <textarea
          name="quoteNotes"
          rows={3}
          maxLength={1000}
          defaultValue={currentNotes}
          placeholder="Lift, pressure wash, chock ashore. Excludes antifoul."
          className={field}
        />
        <p className="mt-1.5 text-sm text-neutral-600">Goes out word for word with the price.</p>
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Sending…' : alreadyQuoted ? 'Send a new quote' : 'Send quote'}
      </button>
    </form>
  );
}
