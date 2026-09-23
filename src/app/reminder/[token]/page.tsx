import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { Plate } from '@/components/ui/plate';
import { bookFromReminder } from '@/app/reminder/[token]/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Book it in?' };

/**
 * The owner said "yes" in the email. This page asks them to say it once more,
 * with a button.
 *
 * That second step is not friction for its own sake. Opening this URL must
 * not create anything, because mail clients and link scanners fetch URLs in
 * emails before a human ever sees them -- a GET that booked work would put
 * enquiries on the board for owners who never read the message. The POST is
 * the human.
 */
export default async function ReminderPage(props: PageProps<'/reminder/[token]'>) {
  const { token } = await props.params;

  const reminder = await prisma.reminder.findUnique({
    where: { token },
    include: { vessel: { select: { name: true } } },
  });
  if (!reminder || reminder.status !== 'sent') notFound();

  const business = await prisma.operator.findFirst();
  if (!business) notFound();

  return (
    <PublicShell business={business} width="narrow">
      <h1 className="font-condensed text-3xl font-semibold tracking-tight">
        {reminder.vessel.name}
      </h1>

      {reminder.message && (
        <Plate className="mt-6 bg-bg p-4">
          <p className="text-[15px]">{reminder.message}</p>
        </Plate>
      )}

      <p className="mt-6 text-[15px]">
        Say yes and we will come back to you with a price. Nothing is booked, and nothing is
        owed, until you have seen what it costs.
      </p>

      <form action={bookFromReminder.bind(null, token)} className="mt-6">
        <button type="submit" className="k min-h-14 w-full bg-accent-900 px-6 text-bg hover:bg-ink">
          Yes, book me in
        </button>
      </form>

      <p className="mt-6 text-[13px] muted">
        Not this year? Just close this page — we won&rsquo;t chase you. Or ring {business.phone}.
      </p>
    </PublicShell>
  );
}
