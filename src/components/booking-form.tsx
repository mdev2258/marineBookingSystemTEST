'use client';

import { useActionState, useState } from 'react';
import type { BookingState } from '@/app/book/actions';
import { formatPence } from '@/lib/money';

const field =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-slate-900 ' +
  'focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600';

function Err({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm font-medium text-red-700">{message}</p>;
}

export function BookingForm({
  action,
  pricePerPersonPence,
  depositPercent,
  spacesLeft,
}: {
  action: (prev: BookingState, formData: FormData) => Promise<BookingState>;
  pricePerPersonPence: number;
  depositPercent: number;
  spacesLeft: number;
}) {
  const [state, formAction, pending] = useActionState<BookingState, FormData>(action, {});
  const [partySize, setPartySize] = useState(1);

  // Recomputed here for display only. The figure that gets charged is computed
  // once on the server at creation and frozen on the row.
  const total = partySize * pricePerPersonPence;
  const deposit = Math.round((depositPercent / 100) * total);

  const step = (by: number) =>
    setPartySize((n) => Math.min(spacesLeft, Math.max(1, n + by)));

  const stepper =
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-slate-300 ' +
    'text-2xl font-semibold disabled:opacity-40';

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="name" className="mb-1.5 block font-medium">
          Name
        </label>
        <input id="name" name="name" autoComplete="name" className={field} />
        <Err message={state.errors?.name} />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className={field}
        />
        <Err message={state.errors?.email} />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1.5 block font-medium">
          Mobile
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className={field}
        />
        <Err message={state.errors?.phone} />
        <p className="mt-1.5 text-sm text-slate-600">
          Only used if we have to reach you about this session.
        </p>
      </div>

      <div>
        <span className="mb-1.5 block font-medium">How many of you?</span>
        {/* A stepper, not a number spinner: the arrows on a mobile number input
            are a 10px target, and this is filled in outdoors. */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={partySize <= 1}
            aria-label="One fewer person"
            className={stepper}
          >
            −
          </button>
          <output className="w-10 text-center text-xl font-semibold" aria-live="polite">
            {partySize}
          </output>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={partySize >= spacesLeft}
            aria-label="One more person"
            className={stepper}
          >
            +
          </button>
          <span className="text-sm text-slate-600">{spacesLeft} can still book</span>
        </div>
        <input type="hidden" name="partySize" value={partySize} />
        <Err message={state.errors?.partySize} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex justify-between">
          <span className="text-slate-700">Total</span>
          <span className="font-medium">{formatPence(total)}</span>
        </div>
        <div className="mt-1 flex justify-between text-lg font-semibold">
          <span>Deposit today</span>
          <span>{formatPence(deposit)}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          The remaining {formatPence(total - deposit)} is due on the day.
        </p>
      </div>

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
        {pending ? 'Just a moment…' : `Pay ${formatPence(deposit)} deposit`}
      </button>
    </form>
  );
}
