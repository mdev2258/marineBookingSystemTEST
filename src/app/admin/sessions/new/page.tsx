import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { SessionForm } from '@/components/admin/session-form';
import { createSession } from '@/app/admin/sessions/actions';
import { todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New session — Harbourside Sailing' };

export default async function NewSessionPage() {
  const sessionTypes = await prisma.sessionType.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });

  const first = sessionTypes[0];

  return (
    <AdminShell>
      <div className="py-6">
        <Link href="/admin/sessions" className="text-sm text-brand-700 underline">
          Back to sessions
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Create a session</h1>
      </div>

      <SessionForm
        action={createSession}
        mode="create"
        sessionTypes={sessionTypes}
        submitLabel="Create session"
        initial={{
          sessionTypeId: first?.id ?? '',
          date: todayInLondon(),
          time: '09:30',
          capacity: first?.defaultCapacity ?? 6,
          pricePence: first?.defaultPricePence ?? 0,
        }}
      />
    </AdminShell>
  );
}
