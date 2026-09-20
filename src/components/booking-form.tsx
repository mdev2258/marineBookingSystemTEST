'use client';

import { useActionState } from 'react';
import type { RequestState } from '@/app/book/actions';

const field =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-slate-900 ' +
  'focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600';

function Err({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm font-medium text-red-700">{message}</p>;
}

/**
 * The owner's side of a job request. Boat first, owner second -- that is the
 * order a yard asks in, and the keel type genuinely decides whether they can
 * lift her.
 *
 * There is no price anywhere on this form and no payment at the end of it. The
 * submit button promises a quote, not a charge, because taking money before
 * anyone has seen the boat is exactly what this yard does not do.
 */
export function BookingForm({
  action,
  submitLabel = 'Ask for a quote',
}: {
  action: (prev: RequestState, formData: FormData) => Promise<RequestState>;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<RequestState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold tracking-tight">The boat</legend>

        <div>
          <label htmlFor="vesselName" className="mb-1.5 block font-medium">
            Name
          </label>
          <input id="vesselName" name="vesselName" className={field} placeholder="Kittiwake" />
          <Err message={state.errors?.vesselName} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="make" className="mb-1.5 block font-medium">
              Make and model <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input id="make" name="make" className={field} placeholder="Westerly Konsort" />
          </div>
          <div>
            <label htmlFor="lengthMetres" className="mb-1.5 block font-medium">
              Length overall (m)
            </label>
            <input
              id="lengthMetres"
              name="lengthMetres"
              inputMode="decimal"
              className={field}
              placeholder="8.8"
            />
            <Err message={state.errors?.lengthMetres} />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="keelType" className="mb-1.5 block font-medium">
              Keel
            </label>
            <select id="keelType" name="keelType" className={field} defaultValue="">
              <option value="">Motor boat, or not sure</option>
              <option>Fin</option>
              <option>Bilge</option>
              <option>Long</option>
              <option>Lifting</option>
            </select>
            <p className="mt-1.5 text-sm text-slate-600">Decides how we strop her.</p>
          </div>
          <div>
            <label htmlFor="berth" className="mb-1.5 block font-medium">
              Where is she? <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input id="berth" name="berth" className={field} placeholder="Pontoon C, berth 14" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 text-lg font-semibold tracking-tight">You</legend>

        <div>
          <label htmlFor="name" className="mb-1.5 block font-medium">
            Name
          </label>
          <input id="name" name="name" autoComplete="name" className={field} />
          <Err message={state.errors?.name} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
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
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="requestNotes" className="mb-1.5 block font-medium">
          What do you need doing?
        </label>
        <textarea
          id="requestNotes"
          name="requestNotes"
          rows={4}
          className={field}
          placeholder="Lift and scrub before the winter, and could you look at a soft patch by the forehatch while she is ashore."
        />
        <Err message={state.errors?.requestNotes} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="font-medium">We quote on the boat, not off a price list.</p>
        <p className="mt-1 text-sm text-slate-700">
          Nothing is booked and nothing is owed until you have seen the price and said yes.
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
        {pending ? 'Sending…' : submitLabel}
      </button>
    </form>
  );
}
