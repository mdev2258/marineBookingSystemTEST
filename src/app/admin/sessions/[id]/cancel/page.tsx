import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { CancelForm } from '@/components/admin/cancel-form';
import { cancelSession } from '@/app/admin/sessions/actions';
import { CANCELLATION_REASON_LABEL, type CancellationReason } from '@/lib/enums';
import { formatDateLong, formatTimeRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Cancel slot — Harbourside Marine' };

/**
 * One route, two states. Once the session is cancelled this page becomes the
 * result screen, so a refresh or a back-button press lands somewhere sensible
 * instead of re-offering an action that has already happened.
 */
export default async function CancelSessionPage(props: PageProps<'/admin/sessions/[id]/cancel'>) {
  const { id } = await props.params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: { sessionType: true, cancellation: true },
  });
  if (!session) notFound();

  const when = `${formatDateLong(session.startsAt)} · ${formatTimeRange(session.startsAt, session.endsAt)}`;

  if (session.status === 'cancelled') {
    // Counted from EmailLog rather than a stored counter: one source of truth,
    // nothing to drift.
    const [notified, failed, awaiting, rebooked] = await Promise.all([
      prisma.emailLog.count({ where: { sessionId: id, type: 'cancellation', status: 'sent' } }),
      prisma.emailLog.count({ where: { sessionId: id, type: 'cancellation', status: 'failed' } }),
      prisma.booking.count({ where: { sessionId: id, status: 'awaiting_rebook' } }),
      prisma.booking.count({ where: { rebookedFromSessionId: id } }),
    ]);

    return (
      <AdminShell>
        <div className="py-6">
          <Link href="/admin/sessions" className="text-sm text-brand-700 underline">
            Back to the diary
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Slot cancelled</h1>
          <p className="mt-1 text-neutral-700">
            {session.sessionType.name} — {when}
          </p>
        </div>

        <div className="rounded-lg border border-divider p-5">
          <p className="text-3xl font-semibold tracking-tight">
            {notified} customer{notified === 1 ? '' : 's'} notified
          </p>
          <p className="mt-1 text-neutral-700">
            {failed} failed
            {session.cancellation
              ? ` · reason: ${CANCELLATION_REASON_LABEL[session.cancellation.reason as CancellationReason]}`
              : ''}
          </p>
          {session.cancellation?.note && (
            <p className="mt-3 border-l-4 border-brand-600 bg-neutral-100 p-3">
              &ldquo;{session.cancellation.note}&rdquo;
            </p>
          )}

          <hr className="my-5 border-divider" />

          <p className="font-medium">
            {rebooked} rebooked · {awaiting} still to pick a new date
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Everyone notified keeps their deposit and has a single-use link to move onto another
            slot for the same work.
          </p>
        </div>

        <Link
          href={`/admin/sessions/${id}`}
          className="mt-6 inline-block text-brand-700 underline"
        >
          Back to this slot
        </Link>
      </AdminShell>
    );
  }

  // Everyone who has actually paid is who gets an email.
  const affected = await prisma.booking.count({ where: { sessionId: id, status: 'paid' } });

  return (
    <AdminShell>
      <div className="py-6">
        <Link href={`/admin/sessions/${id}`} className="text-sm text-brand-700 underline">
          Back to this slot
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Cancel this slot</h1>
        <p className="mt-1 text-neutral-700">
          {session.sessionType.name} — {when}
        </p>
      </div>

      <CancelForm action={cancelSession.bind(null, id)} affected={affected} />
    </AdminShell>
  );
}
