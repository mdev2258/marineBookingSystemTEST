'use client';

import { useActionState } from 'react';
import { adminLogin, type LoginState } from '@/app/admin/actions';

const field =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-3 text-ink ' +
  'focus:border-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(adminLogin, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="username" className="mb-1.5 block font-medium">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          defaultValue={state.username}
          aria-invalid={!!state.error}
          aria-describedby={state.error ? 'login-error' : undefined}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!state.error}
          aria-describedby={state.error ? 'login-error' : undefined}
          className={field}
        />
      </div>

      {state.error && (
        <p id="login-error" role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full bg-brand-600 px-6 font-condensed font-semibold uppercase tracking-[0.08em] text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
