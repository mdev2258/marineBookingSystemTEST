'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { generateRebookToken } from '@/lib/reference';

/**
 * Kill a leaked boat link. The owner's /boat/<token> never expires by design
 * (see Vessel.ownerToken), so replacing the token is how it is revoked: the
 * old URL 404s from the next request. The new link has to be sent to the owner.
 *
 * Estimate and variation links already sent are NOT rotated -- they are in the
 * owner's inbox -- but they expire after DECISION_LINK_DAYS anyway.
 */
export async function regenerateOwnerLink(vesselId: string): Promise<void> {
  await requireAdmin();
  if (typeof vesselId !== 'string' || !vesselId) throw new Error('Boat not found.');

  await prisma.vessel.update({
    where: { id: vesselId },
    data: { ownerToken: generateRebookToken() },
  });

  revalidatePath(`/admin/boats/${vesselId}`);
}
