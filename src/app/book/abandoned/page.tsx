import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '@/components/public-shell';
import { yardOnly } from '@/lib/features';

export const metadata: Metadata = { title: 'Payment cancelled — Harbourside Marine' };

/** Stripe's cancel_url. Nothing to undo: the hold lapses on its own. */
export default function AbandonedPage() {
  yardOnly();
  return (
    <PublicShell width="narrow">
      <h1 className="text-2xl font-semibold tracking-tight">No payment taken</h1>
      {/* Careful with this wording: the hold is NOT released immediately. It
          runs its full 30 minutes, and until then it is still holding seats. */}
      <p className="mt-3 text-neutral-700">
        You stopped before paying, so nothing has been charged. We will hold your place for a short
        while longer in case you change your mind, then release it. You are welcome to start again
        whenever you like.
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
