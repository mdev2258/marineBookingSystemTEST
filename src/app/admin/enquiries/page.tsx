import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { QuoteForm, type SlotOption, type LineDraft } from '@/components/admin/quote-form';
import { sendQuote } from '@/app/admin/enquiries/actions';
import { placesTakenBySession, spacesLeftFrom } from '@/lib/availability';
import { penceToPoundsInput, formatPence } from '@/lib/money';
import { formatDateShort, formatTimeRange } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Inbox — Harbourside Marine' };

/**
 * Work that is waiting on the yard or on the owner, rather than on the water.
 * Everything here has no money attached yet, which is the whole point of the
 * screen: these are the jobs that turn into revenue only if somebody prices
 * them.
 */
export default async function EnquiriesPage() {
  const now = new Date();

  const jobs = await prisma.booking.findMany({
    where: { status: { in: ['enquiry', 'quoted'] } },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    include: {
      customer: true,
      vessel: true,
      lineItems: { orderBy: { sortOrder: 'asc' } },
      session: { include: { sessionType: true } },
    },
  });

  // Every future slot with room, so each job can be offered a real date.
  const slots = await prisma.session.findMany({
    where: { status: 'scheduled', startsAt: { gt: now } },
    orderBy: { startsAt: 'asc' },
    include: { sessionType: true },
  });
  const taken = await placesTakenBySession(slots.map((s) => s.id), now);
  const freeSlots = slots.filter(
    (s) => spacesLeftFrom(s.capacity, taken.get(s.id) ?? 0) > 0,
  );

  const awaiting = jobs.filter((j) => j.status === 'enquiry').length;
  const out = jobs.filter((j) => j.status === 'quoted').length;

  return (
    <AdminShell>
      <div className="py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-1 text-neutral-700">
          {awaiting} awaiting a price · {out} quote{out === 1 ? '' : 's'} out
        </p>
      </div>

      {jobs.length === 0 ? (
        <p className="py-12 text-center text-neutral-600">Nothing waiting. Rare, but nice.</p>
      ) : (
        <ul className="space-y-4">
          {jobs.map((job) => {
            // Only slots for the work actually asked for. A liftout slot is no
            // use to someone who wants a survey.
            const relevant: SlotOption[] = freeSlots
              .filter((s) =>
                job.session ? s.sessionTypeId === job.session.sessionTypeId : true,
              )
              .map((s) => ({
                id: s.id,
                label: `${formatDateShort(s.startsAt)} ${formatTimeRange(s.startsAt, s.endsAt)} — ${s.sessionType.name}`,
              }));

            return (
              <li
                key={job.id}
                className={`rounded-lg border p-4 ${
                  job.status === 'enquiry' ? 'border-brand-300 bg-brand-50' : 'border-divider'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-semibold">{job.vessel.name}</p>
                  <p className="text-sm font-medium">
                    {job.status === 'enquiry' ? (
                      <span className="text-brand-800">Needs a price</span>
                    ) : (
                      <span className="text-neutral-700">
                        Quoted {formatPence(job.quotedPence ?? 0)} — waiting on them
                      </span>
                    )}
                  </p>
                </div>

                <p className="text-sm text-neutral-700">
                  {[
                    job.vessel.make,
                    job.vessel.lengthMetres ? `${job.vessel.lengthMetres}m` : null,
                    job.vessel.keelType ? `${job.vessel.keelType} keel` : null,
                    job.vessel.berth,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                <p className="mt-2 text-sm font-medium">{job.customer.name}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {job.customer.phone && (
                    <a
                      href={`tel:${job.customer.phone.replace(/\s/g, '')}`}
                      className="text-brand-700 underline"
                    >
                      {job.customer.phone}
                    </a>
                  )}
                  <a
                    href={`mailto:${job.customer.email}`}
                    className="truncate text-brand-700 underline"
                  >
                    {job.customer.email}
                  </a>
                </p>

                <p className="mt-1 text-sm text-neutral-600">
                  {job.reference} ·{' '}
                  {job.session
                    ? `${formatDateShort(job.session.startsAt)} ${job.session.sessionType.name}`
                    : 'no date yet'}
                </p>

                {job.requestNotes && (
                  <p className="mt-3 whitespace-pre-wrap border-l-4 border-neutral-300 bg-white/70 p-3 text-neutral-800">
                    {job.requestNotes}
                  </p>
                )}

                <QuoteForm
                  action={sendQuote.bind(null, job.id)}
                  slots={relevant}
                  initialLines={job.lineItems.map<LineDraft>((line) => ({
                    description: line.description,
                    quantity: line.quantity ?? '',
                    amount: penceToPoundsInput(line.amountPence),
                  }))}
                  currentNotes={job.quoteNotes ?? ''}
                  currentSessionId={job.sessionId ?? ''}
                  alreadyQuoted={job.status === 'quoted'}
                />
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
