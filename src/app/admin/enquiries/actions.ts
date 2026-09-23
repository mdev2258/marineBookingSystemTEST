'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { poundsToPence } from '@/lib/money';
import { hasRoom } from '@/lib/availability';
import { generateRebookToken } from '@/lib/reference';
import { sendQuoteEmail } from '@/lib/notifications';

export type QuoteState = {
  error?: string;
  ok?: boolean;
  errors?: Partial<Record<'lines' | 'sessionId', string>>;
};

type ParsedLine = { description: string; quantity: string | null; amountPence: number };

/**
 * Lines arrive as three parallel repeated fields rather than indexed names,
 * so adding and removing rows in the form needs no renumbering. Rows the yard
 * left entirely blank are dropped; a row with text but no usable amount is an
 * error, because silently discarding a priced line would understate the quote.
 */
function parseLines(formData: FormData): { lines: ParsedLine[] } | { error: string } {
  const descriptions = formData.getAll('lineDescription').map((v) => String(v).trim());
  const quantities = formData.getAll('lineQuantity').map((v) => String(v).trim());
  const amounts = formData.getAll('lineAmount').map((v) => String(v).trim());

  const lines: ParsedLine[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    const description = descriptions[i];
    const amountRaw = amounts[i] ?? '';
    if (!description && !amountRaw) continue;

    const amountPence = poundsToPence(amountRaw);
    if (!description) return { error: 'Every priced line needs a description.' };
    if (amountPence === null) return { error: `"${description}" needs an amount, like 640 or 56.50.` };

    lines.push({ description, quantity: quantities[i] || null, amountPence });
  }

  if (lines.length === 0) return { error: 'Add at least one line to the estimate.' };
  return { lines };
}

/**
 * Price a job and offer the owner a date, in one step.
 *
 * A slot is required rather than optional. Partly because "here is the price,
 * we will find a date later" is a poor thing to ask someone to accept, and
 * partly because the deposit percentage lives on the service behind the slot:
 * without one there is nothing to compute a deposit from when they say yes.
 */
export async function sendQuote(
  bookingId: string,
  _prev: QuoteState,
  formData: FormData,
): Promise<QuoteState> {
  await requireAdmin();

  const errors: QuoteState['errors'] = {};
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  const quoteNotes = String(formData.get('quoteNotes') ?? '').trim().slice(0, 1000);

  const parsedLines = parseLines(formData);
  if ('error' in parsedLines) errors.lines = parsedLines.error;
  if (!sessionId) errors.sessionId = 'Give them a date to accept.';
  if (Object.keys(errors).length > 0) return { errors };

  const lines = (parsedLines as { lines: ParsedLine[] }).lines;
  // The total is stored, not derived at read time, so a quote already sent can
  // never be re-totalled underneath the customer by a later edit.
  const quotedPence = lines.reduce((total, line) => total + line.amountPence, 0);
  if (quotedPence <= 0) return { errors: { lines: 'The estimate comes to nothing.' } };

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { error: 'That job no longer exists.' };

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== 'scheduled' || session.startsAt <= new Date()) {
    return { errors: { sessionId: 'That slot is no longer available.' } };
  }
  // Re-quoting into the same slot the job already sits in must not be refused
  // for want of room it is not occupying: an enquiry never held the place.
  if (!(await hasRoom(session))) {
    return { errors: { sessionId: 'That slot is full.' } };
  }

  // One transaction: a quote whose lines and total disagreed, because the
  // second write failed, would be worse than no quote at all.
  //
  // The status AND the token this request read are in the WHERE, and the write
  // rotates the token: two submits of one form match one row between them, so
  // the owner gets one email. No match throws P2025, rolling back the delete.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.quoteLineItem.deleteMany({ where: { bookingId } });
      await tx.booking.update({
        where: {
          id: bookingId,
          status: { in: ['enquiry', 'quoted'] },
          AND: [{ quoteToken: booking.quoteToken }],
        },
        data: {
          sessionId: session.id,
          quotedPence,
          quoteNotes: quoteNotes || null,
          quotedAt: new Date(),
          status: 'quoted',
          // A fresh token every time it is quoted, so a superseded quote's link
          // cannot be used to accept an old price.
          quoteToken: generateRebookToken(),
          // Still nothing owed: the deposit appears when they accept.
          depositPence: null,
          lineItems: {
            create: lines.map((line, i) => ({ ...line, sortOrder: i })),
          },
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { error: 'That job has moved on and cannot be re-quoted here.' };
    }
    throw e;
  }

  await sendQuoteEmail(bookingId);

  revalidatePath('/admin/enquiries');
  revalidatePath('/admin/day');
  revalidatePath('/admin/sessions');
  return { ok: true };
}
