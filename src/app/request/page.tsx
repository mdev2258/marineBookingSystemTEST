import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { BookingForm } from '@/components/booking-form';
import { requestWork } from '@/app/book/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Ask us about work — Harbourside Marine' };

/**
 * The other way in. A liftout can be picked off the diary because the tide
 * decides when it happens; a survey or a repair cannot, because the yard has
 * to see the boat before it can say when or how much. Both land in the same
 * inbox -- this one simply arrives with no slot attached.
 */
export default async function RequestPage() {
  const services = await prisma.sessionType.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  });

  return (
    <PublicShell width="narrow">
      <h1 className="text-2xl font-semibold tracking-tight">Ask us about work</h1>
      <p className="mt-2 text-slate-700">
        Tell us about the boat and what she needs. We will look at it, come back with a price, and
        only then find you a date.
      </p>
      <p className="mt-2 text-slate-700">
        Looking for a lift?{' '}
        <Link href="/book" className="text-brand-700 underline">
          The yard diary
        </Link>{' '}
        has the tide windows we can work.
      </p>

      <div className="mt-8">
        <BookingForm action={requestWork} services={services} submitLabel="Send this to the yard" />
      </div>
    </PublicShell>
  );
}
