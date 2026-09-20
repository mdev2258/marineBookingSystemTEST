import { prisma } from '@/lib/prisma';
import { baseUrl, sendEmail, type SendEmailResult } from '@/lib/email';
import { formatPence } from '@/lib/money';
import { formatDateTime, formatTimeRange } from '@/lib/time';
import { CANCELLATION_REASON_LABEL, type CancellationReason } from '@/lib/enums';

/**
 * Everything interpolated into an email body goes through this first.
 *
 * Customer and vessel names arrive from the public request form and the
 * contact form on the marketing page, so they are attacker-controlled: an
 * unescaped `<` lets a stranger write markup into an email we send in the
 * yard's name. The cancellation note is only admin-typed, but an apostrophe or
 * an ampersand in "Force 6 & rising" should render as itself either way.
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
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0b4f6c;font-weight:700;">Harbourside Marine</div>
    <h1 style="font-size:21px;line-height:1.3;margin:14px 0 18px;">${heading}</h1>
    ${bodyHtml}
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:26px 0 14px;">
    <p style="font-size:12px;color:#475569;margin:0;">Harbourside Marine, Lymington &middot; 01590 000000</p>
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

function note(text: string): string {
  return `<p style="font-size:15px;background:#f1f5f9;border-left:4px solid #0b4f6c;padding:12px 14px;margin:0 0 18px;white-space:pre-wrap;">${esc(text)}</p>`;
}

const bookingInclude = {
  customer: true,
  vessel: true,
  session: { include: { sessionType: true, cancellation: true } },
} as const;

async function loadBooking(bookingId: string) {
  return prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
}

/** "Kittiwake (Westerly Konsort, 8.8m)" */
function vesselLine(v: { name: string; make: string | null; lengthMetres: number | null }): string {
  const detail = [v.make, v.lengthMetres ? `${v.lengthMetres}m` : null].filter(Boolean).join(', ');
  return detail ? `${v.name} (${detail})` : v.name;
}

/** Straight after a job is requested, so nobody wonders if it arrived. */
export async function sendEnquiryReceivedEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b) return null;

  const link = `${baseUrl()}/booking/${b.reference}`;
  const subject = `We've got your request — ${b.vessel.name}`;
  const text = `Hi ${b.customer.name},

Thanks — we have your request for ${b.vessel.name} and we will come back to you with a price.

Reference: ${b.reference}
Vessel:    ${vesselLine(b.vessel)}
${b.requestNotes ? `\nWhat you asked for:\n"${b.requestNotes}"\n` : ''}
We quote every job on the boat rather than off a price list, so give us a day
or so. Nothing is booked and nothing is owed until you have seen the number
and said yes.

Track it here: ${link}

Harbourside Marine`;

  return sendEmail({
    type: 'enquiry_received',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `Thanks — we have your request`,
      `${table([
        row('Reference', esc(b.reference)),
        row('Vessel', esc(vesselLine(b.vessel))),
      ])}
      ${b.requestNotes ? note(b.requestNotes) : ''}
      <p style="font-size:15px;">We quote every job on the boat rather than off a price list, so give us a day or so. <strong>Nothing is booked and nothing is owed</strong> until you have seen the number and said yes.</p>
      ${button(link, 'Track this job')}`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId ?? undefined,
    customerId: b.customerId,
  });
}

/** The quote itself, carrying the single-use link that accepts it. */
export async function sendQuoteEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b || b.quotedPence == null || !b.quoteToken) return null;

  const link = `${baseUrl()}/quote/${b.quoteToken}`;
  const subject = `Your quote for ${b.vessel.name} — ${formatPence(b.quotedPence)}`;
  const text = `Hi ${b.customer.name},

Here is the price for the work on ${b.vessel.name}.

Reference: ${b.reference}
Vessel:    ${vesselLine(b.vessel)}
Quote:     ${formatPence(b.quotedPence)}
${b.quoteNotes ? `\nWhat that covers:\n"${b.quoteNotes}"\n` : ''}
Accept it here and we will book the boat in: ${link}

We take a deposit to hold the slot; the balance is due when the work is done.

Harbourside Marine`;

  return sendEmail({
    type: 'quote',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `Your quote for ${esc(b.vessel.name)}`,
      `${table([
        row('Reference', esc(b.reference)),
        row('Vessel', esc(vesselLine(b.vessel))),
        row('Quote', formatPence(b.quotedPence)),
      ])}
      ${b.quoteNotes ? note(b.quoteNotes) : ''}
      ${button(link, 'Accept this quote')}
      <p style="font-size:14px;color:#334155;">We take a deposit to hold the slot; the balance is due when the work is done.</p>`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId ?? undefined,
    customerId: b.customerId,
  });
}

/** Sent the moment the deposit lands and the boat is in the diary. */
export async function sendBookingConfirmationEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b) return null;

  const link = `${baseUrl()}/booking/${b.reference}`;
  const deposit = b.depositPence ?? 0;
  const balance = Math.max(0, (b.quotedPence ?? 0) - deposit);

  const details = [
    row('Reference', esc(b.reference)),
    row('Vessel', esc(vesselLine(b.vessel))),
    row('Work', b.session ? esc(b.session.sessionType.name) : 'To be scheduled'),
    b.session ? row('When', formatDateTime(b.session.startsAt)) : '',
    b.session?.notes ? row('Tide', esc(b.session.notes)) : '',
    row('Quote', formatPence(b.quotedPence ?? 0)),
    row('Deposit paid', formatPence(deposit)),
    row('Balance on completion', formatPence(balance)),
  ].filter(Boolean);

  const subject = b.session
    ? `Booked in — ${b.vessel.name}, ${formatDateTime(b.session.startsAt)}`
    : `Deposit received — ${b.vessel.name}`;

  const text = `Hi ${b.customer.name},

${b.vessel.name} is booked in.

Reference:             ${b.reference}
Vessel:                ${vesselLine(b.vessel)}
${b.session ? `Work:                  ${b.session.sessionType.name}\nWhen:                  ${formatDateTime(b.session.startsAt)} (${formatTimeRange(b.session.startsAt, b.session.endsAt)})` : 'Work:                  we will confirm a date shortly'}
${b.session?.notes ? `Tide:                  ${b.session.notes}\n` : ''}Quote:                 ${formatPence(b.quotedPence ?? 0)}
Deposit paid:          ${formatPence(deposit)}
Balance on completion: ${formatPence(balance)}

View this job: ${link}

Please make sure she is accessible and the cockpit is clear before we start.

Harbourside Marine`;

  return sendEmail({
    type: 'booking_confirmation',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `${esc(b.vessel.name)} is booked in`,
      `${table(details)}${button(link, 'View this job')}<p style="font-size:14px;color:#334155;">Please make sure she is accessible and the cockpit is clear before we start.</p>`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId ?? undefined,
    customerId: b.customerId,
  });
}

/**
 * Sent to every affected customer after a slot is cancelled.
 * One call = one EmailLog row = one increment of the "N customers notified"
 * counter on the cancel result screen.
 */
export async function sendCancellationEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b || !b.session) return null;

  const reason = (b.session.cancellation?.reason ?? 'other') as CancellationReason;
  const reasonLabel = CANCELLATION_REASON_LABEL[reason] ?? 'Other';
  const cancellationNote = b.session.cancellation?.note?.trim();
  const rebookLink = b.rebookToken ? `${baseUrl()}/rebook/${b.rebookToken}` : null;
  const deposit = b.depositPence ?? 0;

  const subject = `Cancelled: ${b.vessel.name}, ${formatDateTime(b.session.startsAt)}`;
  const text = `Hi ${b.customer.name},

We've had to call off the work on ${b.vessel.name}.

Vessel:    ${vesselLine(b.vessel)}
Work:      ${b.session.sessionType.name}
When:      ${formatDateTime(b.session.startsAt)}
Reference: ${b.reference}
Reason:    ${reasonLabel}
${cancellationNote ? `\n"${cancellationNote}"\n` : ''}
Your ${formatPence(deposit)} deposit is safe and moves with you — you don't need to pay again.
${rebookLink ? `\nPick a new date: ${rebookLink}\n` : '\nWe will be in touch shortly with new dates.\n'}
Sorry for the disruption.

Harbourside Marine`;

  return sendEmail({
    type: 'cancellation',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `We've had to call off ${esc(b.vessel.name)}`,
      `${table([
        row('Vessel', esc(vesselLine(b.vessel))),
        row('Work', esc(b.session.sessionType.name)),
        row('When', formatDateTime(b.session.startsAt)),
        row('Reference', esc(b.reference)),
        row('Reason', reasonLabel),
      ])}
      ${cancellationNote ? note(cancellationNote) : ''}
      <p style="font-size:15px;">Your <strong>${formatPence(deposit)}</strong> deposit is safe and moves with you — you don't need to pay again.</p>
      ${rebookLink ? button(rebookLink, 'Pick a new date') : '<p style="font-size:15px;">We will be in touch shortly with new dates.</p>'}
      <p style="font-size:14px;color:#334155;">Sorry for the disruption.</p>`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId ?? undefined,
    customerId: b.customerId,
  });
}

/** Sent when a customer moves their boat onto a replacement slot. */
export async function sendRebookConfirmationEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b || !b.session) return null;

  const link = `${baseUrl()}/booking/${b.reference}`;
  const subject = `Rebooked — ${b.vessel.name}, ${formatDateTime(b.session.startsAt)}`;
  const text = `Hi ${b.customer.name},

${b.vessel.name} is moved across. Nothing further to pay now.

Reference:    ${b.reference}
Vessel:       ${vesselLine(b.vessel)}
Work:         ${b.session.sessionType.name}
New date:     ${formatDateTime(b.session.startsAt)}
${b.session.notes ? `Tide:         ${b.session.notes}\n` : ''}Deposit held: ${formatPence(b.depositPence ?? 0)}

View this job: ${link}

Harbourside Marine`;

  return sendEmail({
    type: 'rebook_confirmation',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `${esc(b.vessel.name)} is moved across`,
      `${table([
        row('Reference', esc(b.reference)),
        row('Vessel', esc(vesselLine(b.vessel))),
        row('Work', esc(b.session.sessionType.name)),
        row('New date', formatDateTime(b.session.startsAt)),
        b.session.notes ? row('Tide', esc(b.session.notes)) : '',
        row('Deposit held', formatPence(b.depositPence ?? 0)),
      ].filter(Boolean))}<p style="font-size:15px;">Your original deposit carried over — there is nothing further to pay now.</p>${button(link, 'View this job')}`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId ?? undefined,
    customerId: b.customerId,
  });
}

/** The evening-before nudge. Sent once per job (guarded by reminderSentAt). */
export async function sendReminderEmail(bookingId: string): Promise<SendEmailResult | null> {
  const b = await loadBooking(bookingId);
  if (!b || !b.session) return null;

  const link = `${baseUrl()}/booking/${b.reference}`;
  const balance = Math.max(0, (b.quotedPence ?? 0) - (b.depositPence ?? 0));
  const subject = `Tomorrow: ${b.vessel.name}, ${b.session.sessionType.name}`;

  const text = `Hi ${b.customer.name},

A quick reminder — we're on ${b.vessel.name} tomorrow.

Vessel:    ${vesselLine(b.vessel)}
Work:      ${b.session.sessionType.name}
When:      ${formatDateTime(b.session.startsAt)}
${b.session.notes ? `Tide:      ${b.session.notes}\n` : ''}Reference: ${b.reference}
Balance on completion: ${formatPence(balance)}

Please clear the cockpit and side decks, and make sure we can get to her.
If she is on a mooring, let us know how you would like her brought in.

${link}

Harbourside Marine`;

  return sendEmail({
    type: 'reminder',
    to: b.customer.email,
    subject,
    text,
    html: wrap(
      `We're on ${esc(b.vessel.name)} tomorrow`,
      `${table([
        row('Vessel', esc(vesselLine(b.vessel))),
        row('Work', esc(b.session.sessionType.name)),
        row('When', formatDateTime(b.session.startsAt)),
        b.session.notes ? row('Tide', esc(b.session.notes)) : '',
        row('Reference', esc(b.reference)),
        row('Balance on completion', formatPence(balance)),
      ].filter(Boolean))}<p style="font-size:15px;">Please clear the cockpit and side decks, and make sure we can get to her. If she is on a mooring, let us know how you would like her brought in.</p>${button(link, 'View this job')}`,
    ),
    bookingId: b.id,
    sessionId: b.sessionId ?? undefined,
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
