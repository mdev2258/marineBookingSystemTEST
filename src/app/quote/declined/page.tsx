import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';
import { getBusiness } from '@/lib/business';
import { yardOnly } from '@/lib/features';

export const metadata: Metadata = { title: 'Quote declined — Harbourside Marine Services' };

export default async function QuoteDeclinedPage() {
  yardOnly();
  const business = await getBusiness();
  return (
    <PublicShell width="narrow">
      <h1 className="text-2xl font-semibold tracking-tight">Right you are</h1>
      <p className="mt-3 text-neutral-700">
        We have marked that one as declined. Nothing is booked, nothing has been charged, and
        there is nothing else you need to do.
      </p>
      {business?.phone && (
        <p className="mt-3 text-neutral-700">
          If it was the price rather than the work, ring us on{' '}
          <a href={`tel:${business.phone.replace(/\s/g, '')}`} className="text-brand-700 underline">
            {business.phone}
          </a>{' '}
          — there is usually a way to phase it.
        </p>
      )}
    </PublicShell>
  );
}
