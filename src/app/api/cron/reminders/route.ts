import { chaseVariations, sendReminders, sweepExpiredHolds } from '@/lib/reminders';
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

  const swept = await sweepExpiredHolds();
  const reminders = await sendReminders();
  // One chase per unanswered variation, 24h after it was raised, then stop.
  const variations = await chaseVariations();
  // FINDS due work; never sends it. Emailing owners is a deliberate act on the
  // "due this month" screen, not something a timer does unattended.
  const dueWork = await sweepDueWork();

  return Response.json({
    ...reminders,
    expiredHoldsSwept: swept,
    variationsChased: variations,
    dueWork,
  });
}
