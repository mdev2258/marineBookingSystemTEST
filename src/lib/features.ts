import { notFound } from 'next/navigation';

/**
 * The marina/yard era, parked.
 *
 * ANALYSIS-TRADES.md §5: the customer is now the individual shipwright,
 * rigger or marine engineer, not the boatyard. The yard diary -- published
 * slots, crane capacity, hoist scheduling, customers self-booking a place --
 * is somebody else's product.
 *
 * It is PARKED, NOT DELETED, and that is deliberate. The cancel/rebook
 * machinery is being repointed to "visit postponed" (F4) and the tide work may
 * come back as "when can I reach a drying mooring", so the code is worth more
 * intact than in the git history. Deleting a table needs asking first.
 *
 * Off by default. Set FEATURE_YARD=true in .env to walk the old flow.
 *
 * Read at module scope, so a statically prerendered route bakes in the value
 * it had at BUILD time. Flipping this on a deployment needs a redeploy, not
 * just an env-var change. Locally, restart `npm run dev`.
 */
export const FEATURE_YARD = process.env.FEATURE_YARD === 'true';

/**
 * Put this at the top of a parked page. Hiding a route from the nav is not the
 * same as taking it out of the product: the URL is still typed, still linked
 * from an old email, and still crawled. A parked screen should be gone.
 */
export function yardOnly(): void {
  if (!FEATURE_YARD) notFound();
}
