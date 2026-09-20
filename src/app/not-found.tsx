import Link from 'next/link';

/** notFound() is reached by a mistyped booking reference or a stale session link. */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">We couldn&rsquo;t find that</h1>
      <p className="mt-3 text-slate-700">
        The link may be out of date, or a booking reference may have been mistyped. Give us a ring
        on{' '}
        <a href="tel:01590000000" className="text-brand-700 underline">
          01590 000000
        </a>{' '}
        and we will sort it out.
      </p>
      <Link
        href="/book"
        className="mt-6 inline-flex min-h-12 items-center rounded-md bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700"
      >
        See what&rsquo;s on
      </Link>
    </main>
  );
}
