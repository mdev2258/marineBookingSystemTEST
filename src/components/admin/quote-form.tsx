'use client';

import { useActionState, useState } from 'react';
import type { QuoteState } from '@/app/admin/enquiries/actions';
import { formatPence, poundsToPence } from '@/lib/money';

export type SlotOption = { id: string; label: string };
export type LineDraft = { description: string; quantity: string; amount: string };

const field =
  'w-full border border-neutral-300 bg-white px-2.5 py-2.5 text-ink ' +
  'focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent';

function Err({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm font-medium text-red-700">{message}</p>;
}

const BLANK: LineDraft = { description: '', quantity: '', amount: '' };

export function QuoteForm({
  action,
  slots,
  initialLines,
  currentNotes,
  currentSessionId,
  alreadyQuoted,
}: {
  action: (prev: QuoteState, formData: FormData) => Promise<QuoteState>;
  slots: SlotOption[];
  initialLines: LineDraft[];
  currentNotes: string;
  currentSessionId: string;
  alreadyQuoted: boolean;
}) {
  const [state, formAction, pending] = useActionState<QuoteState, FormData>(action, {});
  const [lines, setLines] = useState<LineDraft[]>(
    initialLines.length > 0 ? initialLines : [BLANK, BLANK],
  );

  // Live, so the yard sees the number it is about to send before it sends it.
  const total = lines.reduce((sum, line) => sum + (poundsToPence(line.amount) ?? 0), 0);

  function update(i: number, key: keyof LineDraft, value: string) {
    setLines((rows) => rows.map((row, j) => (i === j ? { ...row, [key]: value } : row)));
  }

  if (state.ok) {
    return (
      <p className="mt-3 border border-accent bg-accent-100 p-3 font-medium text-accent-800">
        Quote sent. They have a link to accept it.
      </p>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="mt-3 border border-neutral-400 bg-neutral-100 p-3 text-neutral-800">
        No free slot for this work. Open one in the diary before you quote — the price and the date
        go out together.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-3 space-y-4 border-t border-divider pt-4">
      <div>
        <p className="k mb-2 text-accent-700">Estimate</p>

        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <input
                name="lineDescription"
                value={line.description}
                onChange={(e) => update(i, 'description', e.target.value)}
                placeholder="Lift, wash and chock ashore"
                className={`${field} flex-1`}
                aria-label={`Line ${i + 1} description`}
              />
              <input
                name="lineQuantity"
                value={line.quantity}
                onChange={(e) => update(i, 'quantity', e.target.value)}
                placeholder="1 set"
                className={`${field} w-20 shrink-0`}
                aria-label={`Line ${i + 1} quantity`}
              />
              <input
                name="lineAmount"
                value={line.amount}
                onChange={(e) => update(i, 'amount', e.target.value)}
                inputMode="decimal"
                placeholder="£"
                className={`${field} w-24 shrink-0`}
                aria-label={`Line ${i + 1} amount`}
              />
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setLines((rows) => [...rows, { ...BLANK }])}
            className="text-sm font-semibold text-accent-700 underline"
          >
            Add a line
          </button>
          <p className="font-condensed text-[18px] font-semibold">
            Total {formatPence(total)}
          </p>
        </div>

        <Err message={state.errors?.lines} />
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
        <p className="muted mt-1.5 text-sm">Goes out word for word with the price.</p>
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full bg-accent px-5 font-semibold text-bg hover:bg-accent-600 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Sending…' : alreadyQuoted ? 'Send a new quote' : 'Send quote'}
      </button>
    </form>
  );
}
