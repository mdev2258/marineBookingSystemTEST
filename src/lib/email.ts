import { prisma } from '@/lib/prisma';
import type { EmailType } from '@/lib/enums';

export type SendEmailInput = {
  type: EmailType;
  /** The customer's real address. Recorded as-is even when redirected. */
  to: string;
  subject: string;
  html: string;
  text: string;
  bookingId?: string;
  sessionId?: string;
  customerId?: string;
};

export type SendEmailResult = {
  ok: boolean;
  providerId?: string;
  error?: string;
  deliveredTo: string;
};

/**
 * One way out of this application for email, and it always writes an EmailLog row.
 *
 * LOCAL / DEMO MODE (no RESEND_API_KEY): the message is printed to the server
 * console and logged with status 'sent', providerId 'local-dev'.
 *
 * That is not a cosmetic nicety. The headline feature of this app is the admin
 * seeing "3 customers notified" after cancelling a session, and that number is
 * a COUNT over EmailLog. If a missing API key meant no row, the counter would
 * read 0 in every local demo and the one feature we are selling would look
 * broken. Working offline matters more here than really sending.
 *
 * DEMO_EMAIL_REDIRECT, when set, overrides every recipient -- so a demo against
 * a real Resend key still cannot reach a real customer. `toEmail` keeps the
 * intended address, `deliveredTo` records where it actually went.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const redirect = process.env.DEMO_EMAIL_REDIRECT?.trim();
  const deliveredTo = redirect && redirect.length > 0 ? redirect : input.to;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || 'Harbourside Sailing <bookings@example.com>';

  let status: 'sent' | 'failed' = 'sent';
  let providerId: string | undefined;
  let error: string | undefined;

  if (!apiKey) {
    providerId = 'local-dev';
    console.log(
      [
        '',
        '─────────── EMAIL (local mode, not sent) ───────────',
        `type:    ${input.type}`,
        `to:      ${input.to}${deliveredTo !== input.to ? `  (redirected -> ${deliveredTo})` : ''}`,
        `subject: ${input.subject}`,
        '',
        input.text,
        '────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
  } else {
    try {
      // Imported lazily so the module is never loaded in local mode.
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      const { data, error: sendError } = await resend.emails.send({
        from,
        to: [deliveredTo],
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      if (sendError) {
        status = 'failed';
        error = sendError.message ?? String(sendError);
      } else {
        providerId = data?.id;
      }
    } catch (e) {
      status = 'failed';
      error = e instanceof Error ? e.message : String(e);
    }
  }

  await prisma.emailLog.create({
    data: {
      type: input.type,
      toEmail: input.to,
      deliveredTo,
      subject: input.subject,
      status,
      providerId,
      error,
      bookingId: input.bookingId,
      sessionId: input.sessionId,
      customerId: input.customerId,
    },
  });

  return { ok: status === 'sent', providerId, error, deliveredTo };
}

export function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}
