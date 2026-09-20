import { prisma } from '@/lib/prisma';
import { baseUrl, sendEmail, type SendEmailResult } from '@/lib/email';
import { formatPence } from '@/lib/money';
import { formatDateTime, formatTimeRange } from '@/lib/time';
import { CANCELLATION_REASON_LABEL, type CancellationReason } from '@/lib/enums';

/**
 * Everything interpolated into an email body goes through this first.
 *
 * Customer names arrive from the public booking form and the contact form on
 * the marketing page, so they are attacker-controlled: an unescaped `<` lets a
 * stranger write markup into an email we send in the operator's name. The
 * cancellation note is only admin-typed, but an apostrophe or an ampersand in
 * "Force 6 & rising" should render as itself either way.
 */
function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

// Plain, readable transactional email. Inline styles only -- no CSS file
// survives Gmail, and nothing here is worth a rendering library.
function wrap(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0b4f6c;font-weight:700;">Harbourside Sailing</div>
    <h1 style="font-size:21px;line-height:1.3;margin:14px 0 18px;">${heading}</h1>
    ${bodyHtml}
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:26px 0 14px;">
    <p style="font-size:12px;color:#475569;margin:0;">Harbourside Sailing, Lymington &middot; 01590 000000</p>
  </div>
</body></html>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 16px 6px 0;color:#475569;font-size:14px;">${label}</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${value}</td></tr>`;
}

function table(rows: string[]): string {
  return `<table style="border-collapse:collapse;margin:0 0 18px;">${rows.join('')}</table>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:22px 0;"><a href="${href}" style="display:inline-block;background:#0b4f6c;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:600;font-size:15px;">${label}</a></p>`;
}

const bookingInclude = {
  customer: true,
  session: { include: { sessionType: true, cancellation: true } },
} as const;

async function loadBooking(bookingId: string) {
  return prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
}

/** Sent the moment a booking becomes paid. Called from markBookingPaid only. */
export async function sendBookingConfirmationEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b) return null;

  const link = `${baseUrl()}/booking/${b.reference}`;
  const balance = Math.max(0, b.totalPence - b.depositPence);
  const details = [
    row('Reference', b.reference),
    row('Activity', b.session.sessionType.name),
    row('When', formatDateTime(b.session.startsAt)),
    row('Duration', formatTimeRange(b.session.startsAt, b.session.endsAt)),
    row('Party size', String(b.partySize)),
    row('Deposit paid', formatPence(b.depositPence)),
    row('Balance on the day', formatPence(balance)),
  ];

  const subject = `Booking confirmed — ${b.session.sessionType.name}, ${formatDateTime(b.session.startsAt)}`;
  const text = `Hi ${b.customer.name},

Your booking is confirmed.

Reference:          ${b.reference}
Activity:           ${b.session.sessionType.name}
When:               ${formatDateTime(b.session.startsAt)} (${formatTimeRange(b.session.startsAt, b.session.endsAt)})
Party size:         ${b.partySize}
Deposit paid:       ${formatPence(b.depositPence)}
Balance on the day: ${formatPence(balance)}

View your booking: ${link}

Please arrive 15 minutes before your start time.

Harbourside Sailing`;

  return sendEmail({
    type: 'booking_confirmation',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `You're booked in, ${esc(b.customer.name.split(' ')[0])}`,
      `${table(details)}${button(link, 'View your booking')}<p style="font-size:14px;color:#334155;">Please arrive 15 minutes before your start time.</p>`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId,
    customerId: b.customerId,
  });
}

/**
 * Sent to every affected customer after a session is cancelled.
 * One call = one EmailLog row = one increment of the "N customers notified"
 * counter on the cancel result screen.
 */
export async function sendCancellationEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b) return null;

  const reason = (b.session.cancellation?.reason ?? 'other') as CancellationReason;
  const reasonLabel = CANCELLATION_REASON_LABEL[reason] ?? 'Other';
  const note = b.session.cancellation?.note?.trim();
  const rebookLink = b.rebookToken ? `${baseUrl()}/rebook/${b.rebookToken}` : null;

  const subject = `Cancelled: ${b.session.sessionType.name}, ${formatDateTime(b.session.startsAt)}`;
  const text = `Hi ${b.customer.name},

We've had to cancel your session.

Activity:  ${b.session.sessionType.name}
When:      ${formatDateTime(b.session.startsAt)}
Reference: ${b.reference}
Reason:    ${reasonLabel}
${note ? `\n"${note}"\n` : ''}
Your ${formatPence(b.depositPence)} deposit is safe and moves with you — you don't need to pay again.
${rebookLink ? `\nPick a new date: ${rebookLink}\n` : '\nWe will be in touch shortly with new dates.\n'}
Sorry for the disruption.

Harbourside Sailing`;

  return sendEmail({
    type: 'cancellation',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `We've had to cancel your session`,
      `${table([
        row('Activity', b.session.sessionType.name),
        row('When', formatDateTime(b.session.startsAt)),
        row('Reference', b.reference),
        row('Reason', reasonLabel),
      ])}
      ${note ? `<p style="font-size:15px;background:#f1f5f9;border-left:4px solid #0b4f6c;padding:12px 14px;margin:0 0 18px;">${esc(note)}</p>` : ''}
      <p style="font-size:15px;">Your <strong>${formatPence(b.depositPence)}</strong> deposit is safe and moves with you — you don't need to pay again.</p>
      ${rebookLink ? button(rebookLink, 'Pick a new date') : '<p style="font-size:15px;">We will be in touch shortly with new dates.</p>'}
      <p style="font-size:14px;color:#334155;">Sorry for the disruption.</p>`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId,
    customerId: b.customerId,
  });
}

/** Sent when a customer moves themselves onto a replacement session. */
export async function sendRebookConfirmationEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b) return null;

  const link = `${baseUrl()}/booking/${b.reference}`;
  const subject = `Rebooked — ${b.session.sessionType.name}, ${formatDateTime(b.session.startsAt)}`;
  const text = `Hi ${b.customer.name},

You're moved across. Nothing further to pay.

Reference:    ${b.reference}
Activity:     ${b.session.sessionType.name}
New date:     ${formatDateTime(b.session.startsAt)}
Party size:   ${b.partySize}
Deposit held: ${formatPence(b.depositPence)}

View your booking: ${link}

Harbourside Sailing`;

  return sendEmail({
    type: 'rebook_confirmation',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `You're moved across`,
      `${table([
        row('Reference', b.reference),
        row('Activity', b.session.sessionType.name),
        row('New date', formatDateTime(b.session.startsAt)),
        row('Party size', String(b.partySize)),
        row('Deposit held', formatPence(b.depositPence)),
      ])}<p style="font-size:15px;">Your original deposit carried over — there is nothing further to pay now.</p>${button(link, 'View your booking')}`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId,
    customerId: b.customerId,
  });
}

/** The evening-before nudge. Sent once per booking (guarded by reminderSentAt). */
export async function sendReminderEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b) return null;

  const link = `${baseUrl()}/booking/${b.reference}`;
  const balance = Math.max(0, b.totalPence - b.depositPence);
  const subject = `Tomorrow: ${b.session.sessionType.name} at ${formatTimeRange(b.session.startsAt, b.session.endsAt).split(' - ')[0]}`;
  const text = `Hi ${b.customer.name},

A quick reminder — you're out with us tomorrow.

Activity:   ${b.session.sessionType.name}
When:       ${formatDateTime(b.session.startsAt)}
Party size: ${b.partySize}
Reference:  ${b.reference}
Balance due on the day: ${formatPence(balance)}

Please arrive 15 minutes early. Bring a waterproof, soft-soled shoes and a change of clothes.

${link}

Harbourside Sailing`;

  return sendEmail({
    type: 'reminder',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `See you tomorrow`,
      `${table([
        row('Activity', b.session.sessionType.name),
        row('When', formatDateTime(b.session.startsAt)),
        row('Party size', String(b.partySize)),
        row('Reference', b.reference),
        row('Balance on the day', formatPence(balance)),
      ])}<p style="font-size:15px;">Please arrive 15 minutes early. Bring a waterproof, soft-soled shoes and a change of clothes.</p>${button(link, 'View your booking')}`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId,
    customerId: b.customerId,
  });
}

/** Marketing-page contact form -> the freelancer's inbox. */
export async function sendContactNotification(input: {
  name: string;
  email: string;
  business?: string | null;
  message: string;
}): Promise<SendEmailResult> {
  const to = process.env.CONTACT_RECIPIENT_EMAIL?.trim() || 'hello@example.com';
  const subject = `New enquiry from ${input.name}${input.business ? ` (${input.business})` : ''}`;
  const text = `Name:     ${input.name}
Email:    ${input.email}
Business: ${input.business || '—'}

${input.message}`;

  return sendEmail({
    type: 'contact_form',
    to,
    subject,
    text,
    html: wrap(
      'New enquiry',
      `${table([
        row('Name', esc(input.name)),
        row('Email', `<a href="mailto:${esc(input.email)}">${esc(input.email)}</a>`),
        row('Business', input.business ? esc(input.business) : '—'),
      ])}<p style="font-size:15px;white-space:pre-wrap;">${esc(input.message)}</p>`,
    ),
  });
}
