import { chaseInvoices, chaseVariations, sendReminders, sweepExpiredHolds } from '@/lib/reminders';
import { sweepDueWork } from '@/lib/due-work';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron target, scheduled in vercel.json for 17:00 UTC.
 *
 * This route sits outside /admin, so src/proxy.ts does not guard it and the
 * bearer secret is the only thing standing in front of it. It fails closed: a
 * missing CRON_SECRET denies rather than allows, or an unconfigured deploy
 * would leave an open endpoint that emails customers.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Each step on its own: one throw must not skip the rest of the night, least
  // of all the invoice chase at the end.
  let ok = true;
  const step = async <T,>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> => {
    try {
      return await fn();
    } catch (e) {
      console.error(`cron step ${name} failed`, e);
      ok = false;
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };

  const swept = await step('expiredHolds', () => sweepExpiredHolds());
  const reminders = await step('reminders', () => sendReminders());
  // One chase per unanswered variation, 24h after it was raised, then stop.
  const variations = await step('variations', () => chaseVariations());
  // FINDS due work; never sends it. Emailing owners is a deliberate act on the
  // "due this month" screen, not something a timer does unattended.
  const dueWork = await step('dueWork', () => sweepDueWork());
  // Two chases per unpaid invoice, ever: on the due date and a week after.
  const invoices = await step('invoices', () => chaseInvoices());

  return Response.json(
    {
      reminders,
      expiredHoldsSwept: swept,
      variationsChased: variations,
      dueWork,
      invoicesChased: invoices,
    },
    { status: ok ? 200 : 500 },
  );
}
