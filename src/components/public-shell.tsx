import Link from 'next/link';

/** The demo operator's public-facing chrome: booking, confirmation and rebook. */
export function PublicShell({
  children,
  width = 'wide',
}: {
  children: React.ReactNode;
  width?: 'wide' | 'narrow';
}) {
  return (
    <>
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/book" className="font-semibold tracking-tight">
            Harbourside Sailing
          </Link>
          <a href="tel:01590000000" className="text-sm text-brand-700 underline">
            01590 000000
          </a>
        </div>
      </header>
      <main className={`mx-auto w-full px-5 py-8 ${width === 'narrow' ? 'max-w-xl' : 'max-w-2xl'}`}>
        {children}
      </main>
    </>
  );
}
