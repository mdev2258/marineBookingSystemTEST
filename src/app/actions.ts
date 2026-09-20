'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { sendContactNotification } from '@/lib/notifications';

const ContactSchema = z.object({
  name: z.string().trim().min(1, 'Please tell me your name.').max(120),
  email: z.email('That email address does not look right.').max(200),
  business: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10, 'A sentence or two about your setup is plenty.').max(5000),
});

export type ContactValues = { name: string; email: string; business: string; message: string };

export type ContactState = {
  ok?: boolean;
  /** Whole-form failure (e.g. the database is down). */
  formError?: string;
  /** field name -> first message for that field. */
  errors?: Partial<Record<keyof ContactValues, string>>;
};

export async function submitContactForm(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = ContactSchema.safeParse({
    name: formData.get('name'),
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    business: formData.get('business'),
    message: formData.get('message'),
  });

  if (!parsed.success) {
    const errors: ContactState['errors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof ContactValues;
      if (field && !errors[field]) errors[field] = issue.message;
    }
    return { errors };
  }

  const { name, email, message } = parsed.data;
  const business = parsed.data.business || null;

  // Persist FIRST, then email: a Resend outage must not silently swallow a lead
  // mid-demo. PLAN.md section 1, ContactMessage.
  try {
    await prisma.contactMessage.create({ data: { name, email, business, message } });
  } catch (err) {
    console.error('[contact] failed to persist ContactMessage', err);
    return { formError: 'Something went wrong saving that. Please email me directly instead.' };
  }

  const sent = await sendContactNotification({ name, email, business, message });
  // The lead is already safe in the database, so a failed send is not the
  // visitor's problem to retry -- it is mine to notice in EmailLog.
  if (!sent.ok) console.error('[contact] notification email failed', sent.error);

  return { ok: true };
}
