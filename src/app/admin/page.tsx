import { redirect } from 'next/navigation';
import { todayInLondon } from '@/lib/time';

// Today in London, not the server's today: Vercel runs UTC and at 00:30 BST
// those are different days.
export default async function AdminIndex() {
  redirect(`/admin/day?date=${todayInLondon()}`);
}
