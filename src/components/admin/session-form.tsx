'use client';

import { useActionState, useState } from 'react';
import type { SessionFormState } from '@/app/admin/sessions/actions';
import { penceToPoundsInput } from '@/lib/money';

export type SessionTypeOption = {
  id: string;
  name: string;
  durationMinutes: number;
  defaultCapacity: number;
  defaultPricePence: number;
};

const field =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-slate-900 ' +
  'focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600';

function Error({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm font-medium text-red-700">{message}</p>;
}

/**
 * Shared by "new session" and "edit session". On create, switching the activity
 * refills capacity and price from that activity's defaults; on edit it does not,
 * because those two columns are a snapshot the operator may have deliberately
 * moved away from the default.
 */
export function SessionForm({
  action,
  sessionTypes,
  mode,
  initial,
  submitLabel,
}: {
  action: (prev: SessionFormState, formData: FormData) => Promise<SessionFormState>;
  sessionTypes: SessionTypeOption[];
  mode: 'create' | 'edit';
  initial: { sessionTypeId: string; date: string; time: string; capacity: number; pricePence: number };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SessionFormState, FormData>(action, {});

  const [sessionTypeId, setSessionTypeId] = useState(initial.sessionTypeId);
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [price, setPrice] = useState(penceToPoundsInput(initial.pricePence));

  function chooseType(id: string) {
    setSessionTypeId(id);
    if (mode !== 'create') return;
    const type = sessionTypes.find((t) => t.id === id);
    if (!type) return;
    setCapacity(String(type.defaultCapacity));
    setPrice(penceToPoundsInput(type.defaultPricePence));
  }

  const selected = sessionTypes.find((t) => t.id === sessionTypeId);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="sessionTypeId" className="mb-1.5 block font-medium">
          Activity
        </label>
        <select
          id="sessionTypeId"
          name="sessionTypeId"
          value={sessionTypeId}
          onChange={(e) => chooseType(e.target.value)}
          className={field}
        >
          <option value="">Choose…</option>
          {sessionTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {selected && (
          <p className="mt-1.5 text-sm text-slate-600">
            Runs for {selected.durationMinutes} minutes. The finish time follows from this.
          </p>
        )}
        <Error message={state.errors?.sessionTypeId} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="date" className="mb-1.5 block font-medium">
            Date
          </label>
          <input id="date" name="date" type="date" defaultValue={initial.date} className={field} />
          <Error message={state.errors?.date} />
        </div>
        <div>
          <label htmlFor="time" className="mb-1.5 block font-medium">
            Start time
          </label>
          <input id="time" name="time" type="time" defaultValue={initial.time} className={field} />
          <Error message={state.errors?.time} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="capacity" className="mb-1.5 block font-medium">
            Capacity
          </label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            inputMode="numeric"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={field}
          />
          <Error message={state.errors?.capacity} />
        </div>
        <div>
          <label htmlFor="price" className="mb-1.5 block font-medium">
            Price per person (£)
          </label>
          <input
            id="price"
            name="price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={field}
          />
          <Error message={state.errors?.price} />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
