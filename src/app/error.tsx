'use client';

import Link from 'next/link';

/**
 * The admin session cookie lasts 12 hours and requireAdmin() throws once it
 * lapses. Without this, tapping Attended on the pontoon screen the morning
 * after replaces the page with Next's default error screen. Anything else that
 * throws lands here too.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">That didn&rsquo;t work</h1>
      <p className="mt-3 text-slate-700">
        Something went wrong at our end. Nothing you were doing has been lost — try again, and if
        you were signed in to the admin you may simply need to sign in afresh.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="min-h-12 rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700"
        >
          Try again
        </button>
        <Link
          href="/admin/login"
          className="inline-flex min-h-12 items-center rounded-md border-2 border-slate-300 px-5 font-semibold hover:bg-slate-50"
        >
          Sign in again
        </Link>
      </div>
    </main>
  );
}
