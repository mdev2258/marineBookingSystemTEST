import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { RebookPicker, type RebookOption } from '@/components/rebook-picker';
import { confirmRebook } from '@/app/rebook/actions';
import { seatsTakenBySession, spacesLeftFrom } from '@/lib/availability';
import { formatPence } from '@/lib/money';
import { CANCELLATION_REASON_LABEL, type CancellationReason } from '@/lib/enums';
import { formatDateTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Pick a new date — Harbourside Sailing' };

const Shell = ({ children }: { children: React.ReactNode }) => (
  <PublicShell width="narrow">{children}</PublicShell>
);

export default async function RebookPage(props: PageProps<'/rebook/[token]'>) {
  const { token } = await props.params;

  const booking = await prisma.booking.findFirst({
    where: { rebookToken: token, status: 'awaiting_rebook' },
    include: {
      customer: true,
      session: { include: { sessionType: true, cancellation: true } },
    },
  });

  // Covers a spent link, a mistyped one, and a customer who has already moved.
  // Deliberately says nothing about which: the token is the only credential.
  if (!booking) {
    return (
      <Shell>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">This link has been used</h1>
        <p className="mt-3 text-slate-700">
          If you have already picked a new date, you are all set — check your inbox for the
          confirmation. Otherwise give us a ring on 01590 000000 and we will sort it out.
        </p>
      </Shell>
    );
  }

  const now = new Date();
  const candidates = await prisma.session.findMany({
    where: {
      sessionTypeId: booking.session.sessionTypeId,
      status: 'scheduled',
      startsAt: { gt: now },
    },
    orderBy: { startsAt: 'asc' },
    take: 12,
  });

  const taken = await seatsTakenBySession(candidates.map((s) => s.id), now);
  const options: RebookOption[] = candidates
    .map((session) => ({
      id: session.id,
      when: formatDateTime(session.startsAt),
      spacesLeft: spacesLeftFrom(session.capacity, taken.get(session.id) ?? 0),
    }))
    // No point offering a date that cannot take the whole party.
    .filter((option) => option.spacesLeft >= booking.partySize);

  const reason = booking.session.cancellation?.reason as CancellationReason | undefined;

  return (
    <Shell>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Sorry {booking.customer.name.split(' ')[0]} — we had to cancel
      </h1>

      <div className="mt-5 rounded-lg border border-slate-200 p-4">
        <p className="font-semibold">{booking.session.sessionType.name}</p>
        <p className="mt-0.5 text-slate-700">{formatDateTime(booking.session.startsAt)}</p>
        <p className="mt-2 text-slate-700">
          Reason: {reason ? CANCELLATION_REASON_LABEL[reason] : 'Other'}
        </p>
        {booking.session.cancellation?.note && (
          <p className="mt-2 border-l-4 border-brand-600 bg-slate-50 p-3">
            &ldquo;{booking.session.cancellation.note}&rdquo;
          </p>
        )}
        <p className="mt-3 font-medium">
          Your {formatPence(booking.depositPence)} deposit is safe and moves with you.
        </p>
      </div>

      <div className="mt-8">
        {options.length === 0 ? (
          <>
            <h2 className="text-lg font-semibold tracking-tight">No suitable dates just yet</h2>
            <p className="mt-2 text-slate-700">
              We do not have another {booking.session.sessionType.name} with room for{' '}
              {booking.partySize} on the schedule at the moment. We will be in touch as soon as we
              add more — your deposit stays exactly where it is in the meantime.
            </p>
          </>
        ) : (
          <RebookPicker action={confirmRebook.bind(null, token)} options={options} />
        )}
      </div>
    </Shell>
  );
}
