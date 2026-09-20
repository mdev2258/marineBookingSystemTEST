import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '@/components/public-shell';

export const metadata: Metadata = { title: 'Quote declined — Harbourside Marine' };

export default function QuoteDeclinedPage() {
  return (
    <PublicShell width="narrow">
      <h1 className="text-2xl font-semibold tracking-tight">Right you are</h1>
      <p className="mt-3 text-slate-700">
        We have marked that one as declined and released the date. Nothing has been charged and
        there is nothing else you need to do.
      </p>
      <p className="mt-3 text-slate-700">
        If it was the price rather than the work, ring us on{' '}
        <a href="tel:01590000000" className="text-brand-700 underline">
          01590 000000
        </a>{' '}
        — there is usually a way to phase it.
      </p>
      <Link href="/request" className="mt-6 inline-block text-brand-700 underline">
        Ask us about something else
      </Link>
    </PublicShell>
  );
}
