import { PublicShell } from '@/components/public-shell';
import { getBusiness } from '@/lib/business';

/**
 * Where a stale or mistyped link lands.
 *
 * This is a page OWNERS reach. Often it is ordinary: they answered an estimate
 * or a variation last week and clicked the same emailed link again (those
 * tokens are single-use by design). But boat and invoice links are reusable,
 * so a bad one of those is genuinely wrong -- the copy must not claim "already
 * used" for every case.
 *
 * So the copy does not accuse them of mistyping anything, and it does not
 * offer a way to "browse" -- a tradesperson has no public slot list, and the
 * old "See what's on" button pointed at /book, which is parked behind
 * FEATURE_YARD and 404s. Sending someone from one 404 to another is the worst
 * thing this page could do.
 *
 * The phone number is the one thing on it that actually helps. It comes from
 * the Operator row, like every other page, so it cannot disagree with them.
 */
export default async function NotFound() {
  const business = await getBusiness();
  return (
    // The same business header as every owner page, so a stale link still
    // lands somewhere that says whose it is.
    <PublicShell business={business ?? undefined} width="narrow">
      {/* not-found.tsx cannot export metadata; React hoists this into <head>. */}
      <title>{business ? `Link not found — ${business.name}` : 'Link not found'}</title>
      <h1 className="font-condensed text-2xl font-semibold tracking-tight">
        We couldn&rsquo;t find that page
      </h1>
      <p className="mt-3 text-[15px]">
        If you have just answered us — an estimate, some extra work, or a reminder — we have got
        it, and nothing else is needed from you.
      </p>
      <p className="mt-3 text-[15px]">
        If you were expecting something else, or the link looks old, give us a ring
        {business?.phone && (
          <>
            {' '}on{' '}
            <a
              href={`tel:${business.phone.replace(/\s/g, '')}`}
              className="whitespace-nowrap text-accent-700 underline"
            >
              {business.phone}
            </a>
          </>
        )}{' '}
        and we will sort it out.
      </p>
    </PublicShell>
  );
}
