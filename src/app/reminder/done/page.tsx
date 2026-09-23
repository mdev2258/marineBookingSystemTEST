import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Thanks' };

/**
 * Where "yes" lands -- and where a second click on an old link lands too.
 * Both read the same, for the reasons in /estimate/done.
 */
export default function ReminderDonePage() {
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
