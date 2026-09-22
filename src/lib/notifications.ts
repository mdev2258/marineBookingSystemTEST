import { prisma } from '@/lib/prisma';
import { baseUrl, sendEmail, type SendEmailResult } from '@/lib/email';
import { formatPence } from '@/lib/money';
import {
  formatDateShort,
  formatDateTime,
  formatLondonDateLong,
  formatTimeRange,
  type LondonDate,
} from '@/lib/time';
import {
  CANCELLATION_REASON_LABEL,
  POSTPONE_REASON_OWNER,
  type CancellationReason,
  type PostponeReason,
} from '@/lib/enums';

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
//
// ponytail: the business name and footer are hardcoded to the demo firm. They
// should come from the Operator row once there is a second install; threading
// it through every template earns nothing while there is exactly one.
function wrap(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0b4f6c;font-weight:700;">Harbourside Marine Services</div>
    <h1 style="font-size:21px;line-height:1.3;margin:14px 0 18px;">${heading}</h1>
    ${bodyHtml}
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:26px 0 14px;">
    <p style="font-size:12px;color:#475569;margin:0;">Harbourside Marine Services &middot; Chichester Harbour &middot; 07700 900001</p>
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

/**
 * Loads a job that can actually be emailed about.
 *
 * Since jobs became capturable with no boat and no owner (schema.prisma >
 * Booking), an email needs somewhere to go and something to be about, and a
 * jotted card has neither. Narrowing here rather than at forty call sites
 * means every template below can treat customer and vessel as present, and a
 * caller that tries to notify an unsorted jot gets the same null it already
 * handles for a missing job.
 */
async function loadBooking(bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  if (!b || !b.customer || !b.vessel) return null;
  return { ...b, customer: b.customer, vessel: b.vessel };
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
    customerId: b.customer.id,
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
    customerId: b.customer.id,
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
    customerId: b.customer.id,
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
    customerId: b.customer.id,
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
    customerId: b.customer.id,
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
    customerId: b.customer.id,
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

// ---------------------------------------------------------------------------
// Trades product. Everything above belongs to the parked yard flow.
// ---------------------------------------------------------------------------

/**
 * Loads an estimate with everything an email about it needs, or null if it
 * cannot be emailed about at all -- same narrowing rule as loadBooking().
 */
async function loadEstimate(estimateId: string) {
  const e = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { booking: { include: { customer: true, vessel: true, lineItems: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!e || !e.booking.customer || !e.booking.vessel) return null;
  return { ...e, customer: e.booking.customer, vessel: e.booking.vessel };
}

/**
 * The estimate itself, carrying the single-use link that answers it.
 *
 * The word throughout is ESTIMATE, never quote: this is time and materials on
 * a boat nobody has opened up yet, and saying "quote" invites an argument the
 * first time a seized fastening adds an hour (§3.6).
 */
export async function sendEstimateEmail(estimateId: string): Promise<SendEmailResult | null> {
  const e = await loadEstimate(estimateId);
  if (!e || !e.token) return null;

  const link = `${baseUrl()}/estimate/${e.token}`;
  const lines = e.booking.lineItems;
  const subject = `Estimate for ${e.vessel.name} — ${formatPence(e.totalPence)}`;

  const text = `Hi ${e.customer.name},

Here is our estimate for the work on ${e.vessel.name}.

${lines.map((l) => `  ${l.description}${l.qty !== 1 ? ` (${l.qty})` : ''}  ${formatPence(l.amountPence)}`).join('\n')}

Estimate total: ${formatPence(e.totalPence)}
${e.notes ? `\n${e.notes}\n` : ''}
This is an estimate, not a fixed price. It is based on what we can see so far,
and we will always come back to you before doing anything that adds to it.

Have a look and let us know: ${link}

Or just ring us — we can mark it agreed at this end.

${e.booking.reference}`;

  return sendEmail({
    type: 'estimate',
    to: e.customer.email,
    subject,
    text,
    html: wrap(
      `Estimate for ${esc(e.vessel.name)}`,
      `${table(lines.map((l) => row(esc(l.description), formatPence(l.amountPence))))}
      <p style="font-size:17px;"><strong>Total: ${formatPence(e.totalPence)}</strong></p>
      ${e.notes ? note(e.notes) : ''}
      <p style="font-size:14px;color:#334155;">This is an <strong>estimate, not a fixed price</strong>. It is based on what we can see so far, and we will always come back to you before doing anything that adds to it.</p>
      ${button(link, 'Have a look')}
      <p style="font-size:14px;color:#334155;">Or just ring us — we can mark it agreed at this end.</p>`,
    ),
    bookingId: e.bookingId,
    customerId: e.customer.id,
    vesselId: e.vessel.id,
  });
}

async function loadVariation(variationId: string) {
  const v = await prisma.variation.findUnique({
    where: { id: variationId },
    include: { booking: { include: { customer: true, vessel: true } } },
  });
  if (!v || !v.booking.customer || !v.booking.vessel) return null;
  return { ...v, customer: v.booking.customer, vessel: v.booking.vessel };
}

/**
 * Extra work found once the boat is open.
 *
 * This is the single most valuable email in the product: verbally-approved
 * extra work, later disputed on the invoice, is the fight this whole feature
 * exists to prevent. So it states what was found, why it matters, and what it
 * costs, and it records the answer with a timestamp.
 */
export async function sendVariationEmail(
  variationId: string,
  isReminder = false,
): Promise<SendEmailResult | null> {
  const v = await loadVariation(variationId);
  if (!v || !v.token) return null;

  const link = `${baseUrl()}/variation/${v.token}`;
  const subject = isReminder
    ? `Still need your go-ahead — ${v.vessel.name}`
    : `Extra work found on ${v.vessel.name} — ${formatPence(v.estimatePence)}`;

  const text = `Hi ${v.customer.name},

${isReminder ? 'Just a nudge — we are still waiting to hear back about this.' : `While we were working on ${v.vessel.name} we found something.`}

${v.description}
${v.reason ? `\nWhy: ${v.reason}\n` : ''}
Estimated cost: ${formatPence(v.estimatePence)}

Nothing happens until you say so. Yes or no here: ${link}

Or ring us and we will note it down at this end.

${v.booking.reference}`;

  return sendEmail({
    type: isReminder ? 'variation_reminder' : 'variation',
    to: v.customer.email,
    subject,
    text,
    html: wrap(
      isReminder ? `Still need your go-ahead` : `We found something on ${esc(v.vessel.name)}`,
      `${note(v.description)}
      ${v.reason ? `<p style="font-size:15px;"><strong>Why:</strong> ${esc(v.reason)}</p>` : ''}
      <p style="font-size:17px;"><strong>Estimated cost: ${formatPence(v.estimatePence)}</strong></p>
      <p style="font-size:15px;"><strong>Nothing happens until you say so.</strong></p>
      ${button(link, 'Yes or no')}
      <p style="font-size:14px;color:#334155;">Or ring us and we will note it down at this end.</p>`,
    ),
    bookingId: v.bookingId,
    customerId: v.customer.id,
    vesselId: v.vessel.id,
  });
}

async function loadVisit(visitId: string) {
  const v = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      place: true,
      booking: { include: { customer: true, vessel: true } },
    },
  });
  if (!v || !v.booking.customer || !v.booking.vessel) return null;
  return { ...v, customer: v.booking.customer, vessel: v.booking.vessel };
}

/**
 * "We are not coming on Thursday after all."
 *
 * This is the repointed cancel/rebook machinery, and it is the one email in
 * the product whose ABSENCE is the failure everyone complains about: a date
 * slips, nobody says anything, and the owner drives down at the weekend to a
 * boat nobody has touched. YARD-OPS.md has the forum thread -- a lift that
 * slipped without notice, trades rescheduled around nothing, 28 days ashore
 * and the bill up by £300.
 *
 * So it leads with the fact, gives the reason in the owner's terms, and either
 * names a new date or says plainly that we will be in touch. It never
 * apologises into vagueness.
 */
export async function sendVisitPostponedEmail(
  visitId: string,
  newDate: LondonDate | null,
): Promise<SendEmailResult | null> {
  const v = await loadVisit(visitId);
  if (!v) return null;

  const was = formatDateTime(v.startsAt);
  const because = v.postponeReason
    ? POSTPONE_REASON_OWNER[v.postponeReason as PostponeReason] ?? 'something outside our control'
    : 'something outside our control';
  const next = newDate
    ? `We have put her down for ${formatLondonDateLong(newDate)} instead.`
    : 'We will be in touch as soon as we can give you a new date.';

  const subject = `${v.vessel.name} — ${formatDateShort(v.startsAt)} moved`;

  const text = `Hi ${v.customer.name},

We were due on ${v.vessel.name} on ${was}, and we are not going to make it because of ${because}.

${next}
${v.postponeNote ? `\n${v.postponeNote}\n` : ''}
Nothing else changes, and there is nothing you need to do. We would rather tell you now
than have you find out at the weekend.

${v.booking.reference}`;

  return sendEmail({
    type: 'visit_postponed',
    to: v.customer.email,
    subject,
    text,
    html: wrap(
      `${esc(v.vessel.name)} — ${esc(formatDateShort(v.startsAt))} moved`,
      `<p style="font-size:15px;">We were due on <strong>${esc(v.vessel.name)}</strong> on ${esc(was)}, and we are not going to make it because of ${esc(because)}.</p>
      <p style="font-size:15px;"><strong>${esc(next)}</strong></p>
      ${v.postponeNote ? note(v.postponeNote) : ''}
      <p style="font-size:14px;color:#334155;">Nothing else changes, and there is nothing you need to do. We would rather tell you now than have you find out at the weekend.</p>`,
    ),
    bookingId: v.bookingId,
    customerId: v.customer.id,
    vesselId: v.vessel.id,
  });
}
