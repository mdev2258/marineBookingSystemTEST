'use client';

import { useActionState, useState } from 'react';
import type { QuoteState } from '@/app/admin/enquiries/actions';
import { formatPence, poundsToPence } from '@/lib/money';

export type SlotOption = { id: string; label: string };
export type LineDraft = { description: string; quantity: string; amount: string };

const field =
  'w-full border border-neutral-300 bg-white px-2.5 py-2.5 text-ink ' +
  'focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent';

// Same shape as the public contact form: the field points at this by id
// (aria-describedby) and role="alert" announces it when the action returns.
function Err({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm font-medium text-red-700">
      {message}
    </p>
  );
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
  // Controlled, so React's post-action form reset cannot throw away a chosen
  // slot or typed notes when the action comes back with errors.
  const [sessionId, setSessionId] = useState(currentSessionId);
  const [notes, setNotes] = useState(currentNotes);
  const linesError = state.errors?.lines;
  const sessionError = state.errors?.sessionId;

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
                aria-invalid={!!linesError}
                aria-describedby={linesError ? 'quote-lines-error' : undefined}
              />
              <input
                name="lineQuantity"
                value={line.quantity}
                onChange={(e) => update(i, 'quantity', e.target.value)}
                placeholder="1 set"
                className={`${field} w-20 shrink-0`}
                aria-label={`Line ${i + 1} quantity`}
                aria-invalid={!!linesError}
                aria-describedby={linesError ? 'quote-lines-error' : undefined}
              />
              <input
                name="lineAmount"
                value={line.amount}
                onChange={(e) => update(i, 'amount', e.target.value)}
                inputMode="decimal"
                placeholder="£"
                className={`${field} w-24 shrink-0`}
                aria-label={`Line ${i + 1} amount`}
                aria-invalid={!!linesError}
                aria-describedby={linesError ? 'quote-lines-error' : undefined}
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

        <Err id="quote-lines-error" message={linesError} />
      </div>

      <div>
        <label htmlFor="quote-session" className="mb-1.5 block text-sm font-medium">
          Book her in for
        </label>
        <select
          id="quote-session"
          name="sessionId"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          aria-invalid={!!sessionError}
          aria-describedby={sessionError ? 'quote-session-error' : undefined}
          className={field}
        >
          <option value="">Choose a slot…</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <Err id="quote-session-error" message={sessionError} />
      </div>

      <div>
        <label htmlFor="quote-notes" className="mb-1.5 block text-sm font-medium">
          What the price covers
        </label>
        <textarea
          id="quote-notes"
          name="quoteNotes"
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
        className="min-h-12 w-full bg-accent-700 px-5 font-semibold text-bg hover:bg-accent-800 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Sending…' : alreadyQuoted ? 'Send a new quote' : 'Send quote'}
      </button>
    </form>
  );
}
