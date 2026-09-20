import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { BookingForm } from '@/components/booking-form';
import { requestSlot } from '@/app/book/actions';
import { placesTaken, spacesLeftFrom } from '@/lib/availability';
import { formatDateLong, formatTimeRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Ask for a slot — Harbourside Marine' };

export default async function BookSessionPage(props: PageProps<'/book/[sessionId]'>) {
  const { sessionId } = await props.params;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { sessionType: true },
  });
  if (!session) notFound();

  const left = spacesLeftFrom(session.capacity, await placesTaken(session.id));
  const unavailable =
    session.status !== 'scheduled' || session.startsAt <= new Date() || left === 0;

  return (
    <PublicShell width="narrow">
      <Link href="/book" className="text-sm text-brand-700 underline">
        Back to the yard diary
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{session.sessionType.name}</h1>
      <p className="mt-1 text-slate-700">
        {formatDateLong(session.startsAt)} · {formatTimeRange(session.startsAt, session.endsAt)}
      </p>
      {session.notes && <p className="mt-1 font-medium text-brand-700">{session.notes}</p>}
      {session.sessionType.description && (
        <p className="mt-3 text-slate-700">{session.sessionType.description}</p>
      )}

      <div className="mt-8">
        {unavailable ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700">
            That slot has gone.{' '}
            <Link href="/book" className="text-brand-700 underline">
              See what else is free
            </Link>
            .
          </p>
        ) : (
          <BookingForm
            action={requestSlot.bind(null, session.id)}
            submitLabel="Ask for this slot"
          />
        )}
      </div>
    </PublicShell>
  );
}
