'use client';

import { useActionState, useState } from 'react';
import { submitContactForm, type ContactState, type ContactValues } from '@/app/actions';

const EMPTY: ContactValues = { name: '', email: '', business: '', message: '' };

const field =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-3 text-ink ' +
  'placeholder:text-neutral-400 focus:border-brand-600 focus:outline-2 focus:outline-offset-2 ' +
  'focus:outline-brand-600';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContactForm, {});
  // Controlled, so React's post-submit form reset cannot bin what was typed
  // when the action comes back with validation errors.
  const [values, setValues] = useState<ContactValues>(EMPTY);

  if (state.ok) {
    return (
      <div className="rounded-lg border border-brand-200 bg-brand-50 p-6">
        <h3 className="text-lg font-semibold text-brand-800">Thanks — that&rsquo;s with me.</h3>
        <p className="mt-2 text-neutral-700">
          I read every message myself and normally reply within one working day.
        </p>
      </div>
    );
  }

  const set = (k: keyof ContactValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="name" className="mb-1.5 block font-medium">
          Your name
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          value={values.name}
          onChange={set('name')}
          aria-invalid={!!state.errors?.name}
          aria-describedby={state.errors?.name ? 'name-error' : undefined}
          className={field}
        />
        <FieldError id="name-error" message={state.errors?.name} />
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
          value={values.email}
          onChange={set('email')}
          aria-invalid={!!state.errors?.email}
          aria-describedby={state.errors?.email ? 'email-error' : undefined}
          className={field}
        />
        <FieldError id="email-error" message={state.errors?.email} />
      </div>

      <div>
        <label htmlFor="business" className="mb-1.5 block font-medium">
          Business <span className="font-normal text-neutral-500">(optional)</span>
        </label>
        <input
          id="business"
          name="business"
          autoComplete="organization"
          value={values.business}
          onChange={set('business')}
          aria-invalid={!!state.errors?.business}
          aria-describedby={state.errors?.business ? 'business-error' : undefined}
          className={field}
        />
        <FieldError id="business-error" message={state.errors?.business} />
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block font-medium">
          Where does your job list live right now? Head, notebook, texts?
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          value={values.message}
          onChange={set('message')}
          aria-invalid={!!state.errors?.message}
          aria-describedby={state.errors?.message ? 'message-error' : undefined}
          className={field}
        />
        <FieldError id="message-error" message={state.errors?.message} />
      </div>

      {state.formError && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.formError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  );
}
