'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { bookAcceptedEstimate } from '@/lib/board';
import { decisionCutoff } from '@/app/estimate/[token]/expiry';

/**
 * The owner answers their estimate.
 *
 * IDEMPOTENCY IS STRUCTURAL. The token goes in the WHERE clause and is cleared
 * by the same statement, so a double-tap, a resent link or a mail client
 * prefetching the URL matches zero rows the second time. There is no
 * check-then-write anywhere in this path. Expiry sits in the same WHERE.
 *
 * No admin check here on purpose: this IS the unauthenticated path. The token
 * is the credential, which is why it is unguessable and single-use.
 *
 * The done page is told what ACTUALLY happened, never which button was
 * pressed. When the claim loses (double-click race, withdrawn, already
 * answered, expired) the row is re-read to say what is on record. By then the
 * token may be cleared, so the id the page rendered into the form is the
 * fallback. That id only ever READS the recorded outcome; it cannot write.
 */
export async function decideEstimate(token: string, formData: FormData): Promise<void> {
  const accepted = String(formData.get('decision') ?? '') === 'accept';
  const formId = formData.get('id');
  const validToken = typeof token === 'string' && token.length > 0;

  const estimate = validToken
    ? await prisma.estimate.findUnique({
        where: { token },
        select: { id: true, bookingId: true, totalPence: true },
      })
    : null;

  if (estimate) {
    const { count } = await prisma.estimate.updateMany({
      where: { token, status: 'sent', sentAt: { gt: decisionCutoff() } },
      data: {
        status: accepted ? 'accepted' : 'declined',
        decidedAt: new Date(),
        decidedVia: 'link',
        token: null,
      },
    });

    if (count === 1) {
      if (accepted) await bookAcceptedEstimate(estimate.bookingId, estimate.totalPence);
      // The board is the trade's screen; it must reflect this before they next
      // look at it, which may be seconds from now on a different phone.
      revalidatePath('/admin/board');
      redirect(`/estimate/done?o=${accepted ? 'accepted' : 'declined'}`);
    }
  }

  const id = estimate?.id ?? (typeof formId === 'string' && formId ? formId : null);
  const row = id
    ? await prisma.estimate.findUnique({ where: { id }, select: { status: true, sentAt: true } })
    : null;
  redirect(`/estimate/done?o=${recordedOutcome(row)}`);
}

function recordedOutcome(row: { status: string; sentAt: Date | null } | null): string {
  if (!row) return 'gone';
  if (row.status === 'accepted') return 'already_accepted';
  if (row.status === 'declined') return 'already_declined';
  if (row.status === 'sent') return !row.sentAt || row.sentAt <= decisionCutoff() ? 'expired' : 'gone';
  return 'withdrawn'; // superseded, or back to draft
}
