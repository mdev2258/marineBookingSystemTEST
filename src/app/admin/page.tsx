import { redirect } from 'next/navigation';
import { todayInLondon } from '@/lib/time';

// Without this the redirect is prerendered at build time and every visit to
// /admin lands on the day the app was deployed, forever.
export const dynamic = 'force-dynamic';

// Today in London, not the server's today: Vercel runs UTC and at 00:30 BST
// those are different days.
export default async function AdminIndex() {
  redirect(`/admin/day?date=${todayInLondon()}`);
}
