import { prisma } from '@/lib/prisma';
import { sendBookingConfirmationEmail } from '@/lib/notifications';
import { todayInLondon } from '@/lib/time';

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

// ============================================================================
// INVOICES -- the seam repointed for the trades product (ANALYSIS-TRADES.md
// §5, §7 F6). A tradesperson invoices on completion and takes no deposit by
// default, so this is where money actually moves now. The three booking
// functions above stay for the parked yard flow.
// ============================================================================

/**
 * Begin a card payment for an invoice, or report that card payment is not
 * available.
 *
 * STUB: returns null. The owner's invoice page renders a "pay by card" button
 * ONLY when this returns a URL, so until the specialist wires Stripe the page
 * shows bank details alone and nothing pretends to take a card.
 *
 * WHY null AND NOT A DEMO URL. The booking stub above lands on a page that
 * marks the booking paid, and its own header flags that as the single most
 * dangerous thing in this file. Doing the same here would hand every owner a
 * link that clears their own invoice without paying -- on a demo that is
 * served from a public URL. A stub that does nothing cannot be exploited.
 *
 * SPECIALIST: replace the body with
 *   const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
 *   if (inv.status !== 'sent') return null;
 *   const cs = await stripe.checkout.sessions.create({
 *     mode: 'payment',
 *     line_items: [{ price_data: { currency: 'gbp', unit_amount: inv.totalPence,
 *                     product_data: { name: `Invoice ${inv.number}` } }, quantity: 1 }],
 *     success_url: `${base}/invoice/${inv.token}?paid=1`,
 *     cancel_url:  `${base}/invoice/${inv.token}`,
 *     client_reference_id: inv.id,
 *   });
 *   await prisma.invoice.update({ where: { id: inv.id }, data: { stripeCheckoutSessionId: cs.id } });
 *   return { url: cs.url! };
 * and have the webhook call markInvoicePaid(inv.id, 'link'). The page needs no
 * change: the button appears the moment this stops returning null.
 */
export async function startInvoiceCheckout(invoiceId: string): Promise<{ url: string } | null> {
  void invoiceId;
  return null;
}

/**
 * Mark an invoice paid. The ONE write path for it: the trade's "paid by bank
 * transfer / cash / card machine" button calls this today, and the Stripe
 * webhook will call it tomorrow.
 *
 * **Safely callable more than once**, for the same reason as markBookingPaid:
 * webhooks retry and people double-tap. `status: 'sent'` is in the WHERE, so a
 * second call matches zero rows and changes nothing.
 *
 * A paid job leaves the board and lives in the boat's history (§4), so the
 * card moves to `paid` in the same step.
 */
export async function markInvoicePaid(
  invoiceId: string,
  paidVia: string,
  paidOn: string = todayInLondon(),
): Promise<boolean> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { bookingId: true },
  });
  if (!invoice) return false;

  const { count } = await prisma.invoice.updateMany({
    where: { id: invoiceId, status: 'sent' },
    data: { status: 'paid', paidOn, paidVia },
  });
  if (count === 0) return false;

  await prisma.booking.updateMany({
    where: { id: invoice.bookingId, column: 'invoiced' },
    data: { column: 'paid', columnChangedAt: new Date(), paidAt: new Date() },
  });
  return true;
}
