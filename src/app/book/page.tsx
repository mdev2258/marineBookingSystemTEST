import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { placesTakenBySession, spacesLeftFrom } from '@/lib/availability';
import { formatDateShort, formatTimeRange } from '@/lib/time';
import { yardOnly } from '@/lib/features';

// Without this a prospect is shown a cached "3 spaces left" after the last seat
// has gone.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Yard diary — Harbourside Marine' };

export default async function BookPage(props: PageProps<'/book'>) {
  yardOnly();
  const params = await props.searchParams;
  const type = typeof params.type === 'string' ? params.type : '';

  const now = new Date();
  const [types, sessions] = await Promise.all([
    prisma.sessionType.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.session.findMany({
      where: {
        status: 'scheduled',
        startsAt: { gt: now },
        ...(type ? { sessionType: { slug: type } } : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: { sessionType: true },
    }),
  ]);

  const taken = await placesTakenBySession(sessions.map((s) => s.id), now);

  return (
    <PublicShell>
      <h1 className="text-2xl font-semibold tracking-tight">Yard diary</h1>
      <p className="mt-2 text-neutral-700">
        Ask for a slot and we will come back with a price for your boat. Nothing is owed until you
        accept the quote.
      </p>
      <p className="mt-2 text-neutral-700">
        Need a survey, a repair, or something that isn&rsquo;t a lift?{' '}
        <Link href="/request" className="text-brand-700 underline">
          Ask us about work
        </Link>{' '}
        instead.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <FilterChip href="/book" label="Everything" active={type === ''} />
        {types.map((t) => (
          <FilterChip
            key={t.id}
            href={`/book?type=${t.slug}`}
            label={t.name}
            active={type === t.slug}
          />
        ))}
      </div>

      {sessions.length === 0 ? (
        <p className="py-12 text-center text-neutral-600">
          Nothing on the schedule for that just now. Give us a ring and we will sort something out.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {sessions.map((session) => {
            const left = spacesLeftFrom(session.capacity, taken.get(session.id) ?? 0);
            const full = left === 0;

            return (
              <li key={session.id}>
                <div
                  className={`rounded-lg border p-4 ${full ? 'border-divider bg-neutral-100' : 'border-divider'}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-semibold">
                      {formatDateShort(session.startsAt)} ·{' '}
                      {formatTimeRange(session.startsAt, session.endsAt)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-neutral-700">{session.sessionType.name}</p>
                  {session.notes && (
                    <p className="mt-0.5 text-sm font-medium text-brand-700">{session.notes}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p
                      className={`text-sm font-medium ${
                        full ? 'text-neutral-600' : left === 1 ? 'text-red-700' : 'text-neutral-700'
                      }`}
                    >
                      {full
                        ? 'Taken'
                        : left === 1
                          ? 'One space left'
                          : `${left} spaces left`}
                    </p>
                    {!full && (
                      <Link
                        href={`/book/${session.id}`}
                        className="inline-flex min-h-12 items-center justify-center rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700"
                      >
                        Ask for this slot
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PublicShell>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-2 text-sm font-medium ${
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-neutral-300 text-neutral-700 hover:border-brand-500'
      }`}
    >
      {label}
    </Link>
  );
}
