/**
 * Where a stale or mistyped link lands.
 *
 * This is a page OWNERS reach, and they reach it most often for a completely
 * ordinary reason: they answered an estimate or a variation last week and have
 * clicked the same emailed link again. Those tokens are single-use by design,
 * so the link dying is the system working.
 *
 * So the copy does not accuse them of mistyping anything, and it does not
 * offer a way to "browse" -- a tradesperson has no public slot list, and the
 * old "See what's on" button pointed at /book, which is parked behind
 * FEATURE_YARD and 404s. Sending someone from one 404 to another is the worst
 * thing this page could do.
 *
 * The phone number is the one thing on it that actually helps.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-16">
      <h1 className="font-condensed text-2xl font-semibold tracking-tight">
        That link has already been used
      </h1>
      <p className="mt-3 text-[15px]">
        If you have just answered us — an estimate, some extra work, or a reminder — we have got
        it, and nothing else is needed from you.
      </p>
      <p className="mt-3 text-[15px]">
        If you were expecting something else, or the link looks old, give us a ring on{' '}
        <a href="tel:07700900001" className="text-accent-700 underline">
          07700 900001
        </a>{' '}
        and we will sort it out.
      </p>
    </main>
  );
}
