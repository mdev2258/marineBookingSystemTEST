import { prisma } from '@/lib/prisma';
import { sendBookingConfirmationEmail } from '@/lib/notifications';

/**
 * ============================================================================
 * THE PAYMENTS SEAM  --  owned by the Stripe specialist, stubbed here.
 * ============================================================================
 *
 * These three functions are the ONLY place in the codebase that will ever know
 * Stripe exists. Nothing else imports `stripe`, and no page or action calls a
 * Stripe API directly. The app is fully clickable on these stubs alone, which
 * is the point: the demo does not depend on Stripe being wired up.
 *
 * Deliberately NOT here, and deliberately NOT created by this build:
 *   - the `stripe` npm dependency
 *   - src/app/api/stripe/webhook/route.ts
 *   - any Stripe SDK call
 *
 * ---------------------------------------------------------------------------
 * TWO THINGS THE SPECIALIST MUST RESOLVE. Both are safe in the demo and are
 * NOT safe in production.
 *
 * 1. MUST DELETE, not merely stop using, the `{ reference: checkoutSessionId }`
 *    branch in verifyAndMarkPaid. /book/confirmation is an unauthenticated
 *    page, so while that branch exists anyone who knows their own booking
 *    reference can mark their own booking paid without paying. It exists only
 *    so the demo completes with no Stripe account.
 *
 * 2. MUST DECIDE what happens when payment arrives after Booking.expiresAt.
 *    markBookingPaid does not look at expiresAt, so a hold that has already
 *    lapsed -- and whose seats availability has therefore handed to somebody
 *    else -- is resurrected into a confirmed booking, overbooking the session.
 *    Stripe Checkout expiring the session makes this unlikely, not impossible.
 *    Refuse and refund, or honour and overbook, is a commercial decision, so
 *    it is deliberately not guessed at here.
 * ---------------------------------------------------------------------------
 *
 * The `StripeEvent` model already exists in schema.prisma for the webhook's
 * idempotency check. See docs/PLAN.md section 7 for the handover contract.
 */

/** Stripe Checkout's minimum session lifetime, mirrored onto Booking.expiresAt. */
export const HOLD_MINUTES = 30;

export function holdExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + HOLD_MINUTES * 60_000);
}

/**
 * Begin payment for a pending booking and return the URL to send the customer to.
 *
 * STUB: returns an internal URL that lands straight on the confirmation page in
 * demo mode, so the public booking flow completes end to end with no Stripe.
 *
 * SPECIALIST: replace the body with
 *   stripe.checkout.sessions.create({
 *     mode: 'payment',
 *     expires_at: Math.floor(booking.expiresAt.getTime() / 1000),   // 30 min
 *     line_items: [...],                                            // depositPence
 *     success_url: `${base}/book/confirmation?cs={CHECKOUT_SESSION_ID}`,
 *     cancel_url:  `${base}/book/abandoned?ref=${booking.reference}`,
 *     client_reference_id: booking.id,
 *   })
 * then persist `stripeCheckoutSessionId` on the booking and return `session.url`.
 * The caller (createPendingBooking) needs no change: it just redirects to `url`.
 */
export async function startCheckout(bookingId: string): Promise<{ url: string }> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { reference: true },
  });

  return { url: `/book/confirmation?demo=1&ref=${booking.reference}` };
}

/**
 * Transition a booking to paid. **Safely callable more than once** -- Stripe
 * retries webhooks, and the confirmation page may be refreshed by the customer.
 *
 * Idempotency is structural, not a check-then-write: the `status` predicate is
 * inside the WHERE clause, so a second call matches zero rows, writes nothing,
 * and sends no duplicate confirmation email. Do not "improve" this into a
 * findUnique + update.
 *
 * NOTE: the WHERE deliberately does NOT test expiresAt. See point 2 in the
 * header -- a late payment currently resurrects a lapsed hold.
 */
export async function markBookingPaid(
  bookingId: string,
  stripePaymentIntentId: string,
): Promise<void> {
  const result = await prisma.booking.updateMany({
    where: { id: bookingId, status: 'pending_payment' },
    data: {
      status: 'paid',
      paidAt: new Date(),
      stripePaymentIntentId,
      expiresAt: null,
    },
  });

  // Zero rows means it was already paid (or expired/cancelled). Nothing to do,
  // and critically: no second confirmation email.
  if (result.count === 0) return;

  await sendBookingConfirmationEmail(bookingId);
}

/**
 * Called by /book/confirmation to turn a returning customer into a paid booking.
 * The page calls THIS -- never Stripe -- so swapping the stub for the real thing
 * leaves the page untouched.
 *
 * STUB: in demo mode the confirmation page has no real Checkout Session id, so
 * it passes the booking reference from `?ref=` instead. We resolve on either.
 *
 * SPECIALIST: replace the body with
 *   const cs = await stripe.checkout.sessions.retrieve(checkoutSessionId);
 *   if (cs.payment_status !== 'paid') return null;
 *   const booking = await prisma.booking.findUnique({
 *     where: { stripeCheckoutSessionId: cs.id },
 *   });
 *   if (!booking) return null;
 *   await markBookingPaid(booking.id, cs.payment_intent as string);
 *   return { bookingReference: booking.reference };
 * Keep the `| null` return: the page already renders a "we couldn't find that
 * payment" state for it.
 */
export async function verifyAndMarkPaid(
  checkoutSessionId: string,
): Promise<{ bookingReference: string } | null> {
  const booking = await prisma.booking.findFirst({
    where: {
      OR: [
        { stripeCheckoutSessionId: checkoutSessionId },
        // DEMO ONLY -- DELETE THIS LINE when Stripe is wired up. This page is
        // unauthenticated; while this branch exists, knowing a booking
        // reference is enough to mark that booking paid without paying.
        { reference: checkoutSessionId },
      ],
    },
    select: { id: true, reference: true, stripePaymentIntentId: true },
  });

  if (!booking) return null;

  await markBookingPaid(
    booking.id,
    booking.stripePaymentIntentId ?? `pi_demo_${booking.reference}`,
  );

  return { bookingReference: booking.reference };
}
