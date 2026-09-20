'use client';

import { useActionState, useState } from 'react';
import type { SessionFormState } from '@/app/admin/sessions/actions';

export type SessionTypeOption = {
  id: string;
  name: string;
  durationMinutes: number;
  defaultCapacity: number;
  tideDependent: boolean;
};

const field =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-slate-900 ' +
  'focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600';

function Error({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm font-medium text-red-700">{message}</p>;
}

/**
 * Shared by "new slot" and "edit slot". There is no price field: every job is
 * quoted on the boat, so a slot only says when it is, what work it is for, and
 * how many vessels fit.
 *
 * On create, switching the service refills capacity from that service's
 * default; on edit it does not, because capacity is a snapshot the yard may
 * have deliberately moved away from the default.
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
  initial: { sessionTypeId: string; date: string; time: string; capacity: number; notes: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SessionFormState, FormData>(action, {});

  const [sessionTypeId, setSessionTypeId] = useState(initial.sessionTypeId);
  const [capacity, setCapacity] = useState(String(initial.capacity));

  function chooseType(id: string) {
    setSessionTypeId(id);
    if (mode !== 'create') return;
    const type = sessionTypes.find((t) => t.id === id);
    if (type) setCapacity(String(type.defaultCapacity));
  }

  const selected = sessionTypes.find((t) => t.id === sessionTypeId);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="sessionTypeId" className="mb-1.5 block font-medium">
          Service
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
            Allow {selected.durationMinutes} minutes. The finish time follows from this.
            {selected.tideDependent ? ' Tidal — check the window before you publish it.' : ''}
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

      <div>
        <label htmlFor="capacity" className="mb-1.5 block font-medium">
          How many vessels?
        </label>
        <input
          id="capacity"
          name="capacity"
          type="number"
          inputMode="numeric"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className={`${field} sm:max-w-40`}
        />
        <p className="mt-1.5 text-sm text-slate-600">
          A crane takes one at a time; a surveyor might do two in a day.
        </p>
        <Error message={state.errors?.capacity} />
      </div>

      <div>
        <label htmlFor="notes" className="mb-1.5 block font-medium">
          Tide or access note <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="notes"
          name="notes"
          maxLength={200}
          defaultValue={initial.notes}
          placeholder="HW Lymington 11:20"
          className={field}
        />
        <p className="mt-1.5 text-sm text-slate-600">Shown to the customer on the slot.</p>
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
