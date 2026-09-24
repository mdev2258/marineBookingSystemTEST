'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { decisionCutoff } from '@/app/estimate/[token]/expiry';

/**
 * The owner answers extra work found mid-job.
 *
 * Same structural idempotency as the estimate: token in the WHERE, cleared by
 * the same statement, expiry in the same WHERE. This is the row that settles
 * "I never agreed to that" in March, so how and when it was answered is
 * recorded, not just what.
 *
 * As with the estimate, the done page is told what is actually on record, not
 * which button was pressed; see decideEstimate for why the form carries the id.
 * A variation has no sentAt: it is emailed as it is raised, so createdAt is
 * when it was sent.
 */
export async function decideVariation(token: string, formData: FormData): Promise<void> {
  const approved = String(formData.get('decision') ?? '') === 'approve';
  const formId = formData.get('id');

  if (typeof token === 'string' && token.length > 0) {
    const { count } = await prisma.variation.updateMany({
      where: { token, status: 'awaiting_owner', createdAt: { gt: decisionCutoff() } },
      data: {
        status: approved ? 'approved' : 'declined',
        decidedAt: new Date(),
        decidedVia: 'link',
        token: null,
      },
    });

    if (count === 1) {
      // The dot on the board card has to clear on the trade's next refresh --
      // that is the §7 F3 acceptance criterion, answered on a second phone.
      revalidatePath('/admin/board');
      redirect(`/variation/done?o=${approved ? 'approved' : 'declined'}`);
    }
  }

  // Lost the claim. The token may be cleared by now, so fall back to the id.
  const row =
    typeof token === 'string' && token.length > 0
      ? await prisma.variation.findUnique({ where: { token }, select: { status: true, createdAt: true } })
      : null;
  const byId =
    !row && typeof formId === 'string' && formId
      ? await prisma.variation.findUnique({ where: { id: formId }, select: { status: true, createdAt: true } })
      : null;
  redirect(`/variation/done?o=${recordedOutcome(row ?? byId)}`);
}

function recordedOutcome(row: { status: string; createdAt: Date } | null): string {
  if (!row) return 'gone';
  if (row.status === 'approved') return 'already_approved';
  if (row.status === 'declined') return 'already_declined';
  if (row.status === 'withdrawn') return 'withdrawn';
  return row.createdAt <= decisionCutoff() ? 'expired' : 'gone';
}
