'use client';

import { useActionState } from 'react';
import { acceptQuote, declineQuote, type AcceptState } from '@/app/quote/actions';

export function QuoteAccept({ token, depositLabel }: { token: string; depositLabel: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(
    acceptQuote.bind(null, token),
    {},
  );

  return (
    <>
      <form action={action}>
        {state.error && (
          <p role="alert" className="mb-3 text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 w-full rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600 disabled:opacity-60"
        >
          {pending ? 'Just a moment…' : `Accept and pay ${depositLabel} deposit`}
        </button>
      </form>

      <form action={declineQuote.bind(null, token)} className="mt-3">
        <button
          type="submit"
          className="min-h-12 w-full rounded-md border-2 border-neutral-300 px-5 font-semibold text-neutral-700 hover:bg-neutral-100"
        >
          No thanks
        </button>
      </form>
    </>
  );
}
