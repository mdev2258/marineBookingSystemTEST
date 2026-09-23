import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { dismissReminder, sendReminderBatch, sweepNow } from '@/app/admin/reminders/actions';
import { REMINDER_KIND_LABEL, type ReminderKind } from '@/lib/enums';
import { addDays, formatLondonDateShort, todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Due this month — Harbourside Marine Services' };

/**
 * DUE THIS MONTH. The screen that finds work.
 *
 * Tick the boats, press one button, and every owner gets a short email asking
 * if they want booking in. That is the demo line (ANALYSIS-TRADES.md §9.6):
 * "Eight owners just got asked if they want booking in. That's work you
 * didn't chase."
 *
 * Everything is ticked by default. The trade's job on this screen is to
 * UNtick the one owner they know is selling the boat, not to tick twenty
 * boxes -- the default is the common case.
 *
 * No prices anywhere. The trade has not seen these boats yet.
 */
export default async function RemindersPage(props: PageProps<'/admin/reminders'>) {
  const params = await props.searchParams;
  const today = todayInLondon();
  const horizon = addDays(today, 31);

  const [upcoming, sent] = await Promise.all([
    prisma.reminder.findMany({
      where: { status: 'upcoming', dueOn: { lte: horizon } },
      orderBy: [{ dueOn: 'asc' }, { kind: 'asc' }],
      include: {
        vessel: {
          select: {
            id: true,
            name: true,
            make: true,
            model: true,
            customer: { select: { name: true, email: true } },
          },
        },
      },
    }),
    prisma.reminder.findMany({
      where: { status: { in: ['sent', 'booked'] } },
      orderBy: { sentAt: 'desc' },
      take: 20,
      include: { vessel: { select: { id: true, name: true } } },
    }),
  ]);

  // An owner with no email cannot be asked. Show them, but do not offer to
  // send, so the count on the button is a count of emails that will go.
  const sendable = upcoming.filter((r) => r.vessel.customer?.email);
  const sentCount = Number(params.sent ?? NaN);
  const failedCount = Number(params.failed ?? 0);

  return (
    <AdminShell>
      <div className="py-5">
        <h1 className="font-condensed text-2xl font-semibold tracking-tight">Due this month</h1>
        <p className="mt-1 text-[13.5px] muted">
          Work your boats are due, from what you know about them. Nothing goes out until you
          press the button.
        </p>
      </div>

      {Number.isFinite(sentCount) && (
        <p className="border border-divider bg-accent-100 p-3 text-[14px]">
          <strong>
            {sentCount} owner{sentCount === 1 ? '' : 's'} asked.
          </strong>{' '}
          That&rsquo;s work you didn&rsquo;t chase.
          {failedCount > 0 && ` ${failedCount} didn't send — they're still ticked below.`}
        </p>
      )}
      {params.error === 'none' && (
        <p className="border border-accent-700 bg-accent-100 p-3 text-[13.5px]">
          Nothing was ticked.
        </p>
      )}
      {params.swept && (
        <p className="border border-divider bg-neutral-100 p-3 text-[13.5px]">
          Checked every boat. {params.swept} new.
        </p>
      )}

      {upcoming.length === 0 ? (
        <p className="py-10 text-center text-[14px] muted">Nothing due in the next month.</p>
      ) : (
        <form action={sendReminderBatch} className="mt-4">
          <ul className="divide-y divide-divider border-y border-divider">
            {upcoming.map((r) => {
              const canSend = Boolean(r.vessel.customer?.email);
              return (
                <li key={r.id} className="flex gap-3 py-3">
                  <input
                    type="checkbox"
                    name="reminderId"
                    value={r.id}
                    defaultChecked={canSend}
                    disabled={!canSend}
                    aria-label={`Ask the owner of ${r.vessel.name}`}
                    className="mt-1 h-6 w-6 shrink-0 accent-accent-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <Link
                        href={`/admin/boats/${r.vessel.id}`}
                        className="font-condensed text-[17px] font-semibold underline decoration-1 underline-offset-2"
                      >
                        {r.vessel.name}
                      </Link>
                      <span className="k muted">
                        {REMINDER_KIND_LABEL[r.kind as ReminderKind] ?? r.kind}
                      </span>
                      <span className="k muted">{formatLondonDateShort(r.dueOn)}</span>
                    </div>
                    {r.message && <p className="mt-1 text-[13.5px]">{r.message}</p>}
                    <p className="mt-1 text-[12.5px] muted">
                      {r.vessel.customer
                        ? `${r.vessel.customer.name}${canSend ? '' : ' — no email on file'}`
                        : 'No owner on file'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="submit"
            className="k mt-5 min-h-14 w-full bg-accent-900 px-6 text-bg hover:bg-ink sm:w-auto"
          >
            Ask {sendable.length} owner{sendable.length === 1 ? '' : 's'} if they want booking in
          </button>
        </form>
      )}

      {/* Dismissals are a separate form per row, below the list, so a stray
          tap on "not this time" can never be mistaken for the send button. */}
      {upcoming.length > 0 && (
        <details className="mt-8">
          <summary className="k cursor-pointer muted">Not this time&hellip;</summary>
          <ul className="mt-3 space-y-2">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                <span>
                  {r.vessel.name} — {REMINDER_KIND_LABEL[r.kind as ReminderKind] ?? r.kind}
                </span>
                <form action={dismissReminder.bind(null, r.id)}>
                  <button
                    type="submit"
                    className="k min-h-11 border border-divider px-3 hover:bg-neutral-200"
                  >
                    Skip
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}

      {sent.length > 0 && (
        <section className="mt-10">
          <h2 className="k border-b border-divider pb-2">Already asked</h2>
          <ul className="mt-3 space-y-1">
            {sent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 text-[13.5px]">
                <span>{r.vessel.name}</span>
                <span className="k muted">
                  {REMINDER_KIND_LABEL[r.kind as ReminderKind] ?? r.kind}
                </span>
                <span className={`k ${r.status === 'booked' ? 'text-accent-800' : 'muted'}`}>
                  {r.status === 'booked' ? 'said yes' : 'waiting'}
                </span>
                {r.bookingId && (
                  <Link href={`/admin/board/${r.bookingId}`} className="k underline">
                    card
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={sweepNow} className="mt-10 border-t border-divider pb-10 pt-4">
        <p className="text-[12.5px] muted">
          Checked every night automatically. Changed a boat&rsquo;s kit today?
        </p>
        <button type="submit" className="k mt-2 min-h-11 border border-divider px-3 hover:bg-neutral-200">
          Check every boat now
        </button>
      </form>
    </AdminShell>
  );
}
