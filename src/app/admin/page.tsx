import { redirect } from 'next/navigation';

// Without this the redirect is prerendered at build time and every visit to
// /admin lands on the day the app was deployed, forever. (That is not
// hypothetical -- it is exactly what the production build did when this
// redirected to a date.)
export const dynamic = 'force-dynamic';

/**
 * The board is the first screen after login, on every device
 * (ANALYSIS-TRADES.md §4). Until F1 builds it, the inbox is the only live
 * admin screen: the yard diary this used to point at is parked behind
 * FEATURE_YARD and would 404.
 */
export default async function AdminIndex() {
  redirect('/admin/enquiries');
}
