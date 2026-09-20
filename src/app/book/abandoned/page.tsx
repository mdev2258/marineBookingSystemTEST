import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '@/components/public-shell';

export const metadata: Metadata = { title: 'Payment cancelled — Harbourside Sailing' };

/** Stripe's cancel_url. Nothing to undo: the hold lapses on its own. */
export default function AbandonedPage() {
  return (
    <PublicShell width="narrow">
      <h1 className="text-2xl font-semibold tracking-tight">No payment taken</h1>
      <p className="mt-3 text-slate-700">
        You stopped before paying, so nothing has been charged and your place has been released for
        someone else. You are welcome to start again whenever you like.
      </p>
      <Link
        href="/book"
        className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700"
      >
        Back to what&rsquo;s on
      </Link>
    </PublicShell>
  );
}
