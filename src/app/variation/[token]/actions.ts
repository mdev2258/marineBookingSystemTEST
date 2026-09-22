'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

/**
 * The owner answers extra work found mid-job.
 *
 * Same structural idempotency as the estimate: token in the WHERE, cleared by
 * the same statement. This is the row that settles "I never agreed to that"
 * in March, so how and when it was answered is recorded, not just what.
 */
export async function decideVariation(token: string, formData: FormData): Promise<void> {
  const approved = String(formData.get('decision') ?? '') === 'approve';

  const variation = await prisma.variation.findUnique({
    where: { token },
    select: { id: true },
  });
  if (!variation) redirect('/variation/done');

  await prisma.variation.updateMany({
    where: { token, status: 'awaiting_owner' },
    data: {
      status: approved ? 'approved' : 'declined',
      decidedAt: new Date(),
      decidedVia: 'link',
      token: null,
    },
  });

  // The dot on the board card has to clear on the trade's next refresh --
  // that is the §7 F3 acceptance criterion, answered on a second phone.
  revalidatePath('/admin/board');
  redirect(`/variation/done?d=${approved ? 'approved' : 'declined'}`);
}
