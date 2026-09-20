import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { BookingForm } from '@/components/booking-form';
import { createPendingBooking } from '@/app/book/actions';
import { seatsTaken, spacesLeftFrom } from '@/lib/availability';
import { formatPenceShort } from '@/lib/money';
import { formatDateLong, formatTimeRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Book — Harbourside Sailing' };

export default async function BookSessionPage(props: PageProps<'/book/[sessionId]'>) {
  const { sessionId } = await props.params;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { sessionType: true },
  });
  if (!session) notFound();

  const left = spacesLeftFrom(session.capacity, await seatsTaken(session.id));
  const unavailable =
    session.status !== 'scheduled' || session.startsAt <= new Date() || left === 0;

  return (
    <PublicShell width="narrow">
      <Link href="/book" className="text-sm text-brand-700 underline">
        Back to what&rsquo;s on
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{session.sessionType.name}</h1>
      <p className="mt-1 text-slate-700">
        {formatDateLong(session.startsAt)} · {formatTimeRange(session.startsAt, session.endsAt)}
      </p>
      <p className="mt-1 text-slate-700">
        {formatPenceShort(session.pricePerPersonPence)} per person
      </p>
      {session.sessionType.description && (
        <p className="mt-3 text-slate-700">{session.sessionType.description}</p>
      )}

      <div className="mt-8">
        {unavailable ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700">
            This one is no longer bookable.{' '}
            <Link href="/book" className="text-brand-700 underline">
              See what else is on
            </Link>
            .
          </p>
        ) : (
          <BookingForm
            action={createPendingBooking.bind(null, session.id)}
            pricePerPersonPence={session.pricePerPersonPence}
            depositPercent={session.sessionType.depositPercent}
            spacesLeft={left}
          />
        )}
      </div>
    </PublicShell>
  );
}
