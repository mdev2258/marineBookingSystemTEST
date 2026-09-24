import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Booking request received' };

/**
 * Where "yes" lands -- and where a second click on an old link lands too.
 * Only a real booking (?booked=1) says "got that": a link that was already
 * used, or closed after 60 days unanswered, says so rather than pretending.
 */
export default async function ReminderDonePage(props: PageProps<'/reminder/done'>) {
  const { booked } = await props.searchParams;

  if (booked !== '1') {
    return (
      <PublicShell width="narrow">
        <h1 className="font-condensed text-3xl font-semibold tracking-tight">
          That link has already been used
        </h1>
        <p className="mt-3 text-[15px]">
          Nothing new was booked. If you already said yes, we&rsquo;ve got it. If not, or it has
          been a while, just give us a ring.
        </p>
        <p className="mt-6 text-[13px] muted">You can close this page.</p>
      </PublicShell>
    );
  }

  return (
    <PublicShell width="narrow">
      <h1 className="font-condensed text-3xl font-semibold tracking-tight">
        Thanks — we&rsquo;ve got that
      </h1>
      <p className="mt-3 text-[15px]">
        We will have a look and come back to you with a price. Nothing is booked until you have
        seen it and said yes.
      </p>
      <p className="mt-6 text-[13px] muted">You can close this page.</p>
    </PublicShell>
  );
}
