import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { AdminShell } from '@/components/admin/shell';
import { SessionForm } from '@/components/admin/session-form';
import { createSession } from '@/app/admin/sessions/actions';
import { todayInLondon } from '@/lib/time';
import { yardOnly } from '@/lib/features';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New slot — Harbourside Marine' };

export default async function NewSessionPage() {
  yardOnly();
  const sessionTypes = await prisma.sessionType.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });

  const first = sessionTypes[0];

  return (
    <AdminShell>
      <div className="py-6">
        <Link href="/admin/sessions" className="text-sm text-brand-700 underline">
          Back to the diary
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Open a slot</h1>
      </div>

      <SessionForm
        action={createSession}
        mode="create"
        sessionTypes={sessionTypes}
        submitLabel="Open slot"
        initial={{
          sessionTypeId: first?.id ?? '',
          date: todayInLondon(),
          time: '08:30',
          capacity: first?.defaultCapacity ?? 1,
          notes: '',
        }}
      />
    </AdminShell>
  );
}
