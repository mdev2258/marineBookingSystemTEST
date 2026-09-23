import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PublicShell } from '@/components/public-shell';
import { Plate } from '@/components/ui/plate';
import { formatPence } from '@/lib/money';
import { startInvoiceCheckout } from '@/lib/payments';
import { formatLondonDateLong } from '@/lib/time';
import { daysOverdue } from '@/lib/invoices';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Invoice' };

/**
 * The owner's copy of an invoice.
 *
 * Unlike an estimate link this is NOT single-use: an owner opens an invoice
 * more than once -- to check the amount, to find the bank details, to forward
 * it to whoever pays the boat's bills. The token is unguessable, and the page
 * only ever SHOWS; nothing here changes state.
 *
 * The card button appears only when the payments seam returns a checkout URL.
 * Today it returns null, so owners see bank details and nothing that pretends
 * to take a card. See startInvoiceCheckout for why that is deliberate.
 */
export default async function OwnerInvoicePage(props: PageProps<'/invoice/[token]'>) {
  const { token } = await props.params;

  const invoice = await prisma.invoice.findUnique({
    where: { token },
    include: {
      operator: true,
      lines: { orderBy: { sortOrder: 'asc' } },
      booking: { include: { vessel: { select: { name: true } } } },
    },
  });
  if (!invoice) notFound();

  const business = invoice.operator;
  const showVat = business.vatRegistered && invoice.vatPence > 0;
  const card = invoice.status === 'sent' ? await startInvoiceCheckout(invoice.id) : null;
  const late = invoice.status === 'sent' ? daysOverdue(invoice) : 0;

  return (
    <PublicShell business={business} width="narrow">
      <p className="k muted">Invoice {invoice.number}</p>
      <h1 className="mt-2 font-condensed text-3xl font-semibold tracking-tight">
        {invoice.booking.vessel?.name ?? 'Your boat'}
      </h1>

      {invoice.status === 'paid' && (
        <p className="mt-4 border border-accent-700 bg-accent-100 p-3 text-[15px] font-semibold">
          Paid{invoice.paidOn ? ` on ${formatLondonDateLong(invoice.paidOn)}` : ''}. Thank you.
        </p>
      )}
      {invoice.status === 'void' && (
        <p className="mt-4 border border-divider bg-neutral-100 p-3 text-[15px]">
          This invoice was cancelled and replaced. There is nothing to pay on it.
        </p>
      )}

      <Plate className="mt-6 bg-bg p-4">
        <ul className="space-y-2">
          {invoice.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-4 text-[14px]">
              <span>
                {l.description}
                {l.qty !== 1 && <span className="muted"> × {l.qty}</span>}
              </span>
              <span className="numeric shrink-0">{formatPence(l.amountPence)}</span>
            </li>
          ))}
          {/* Only when registered. When not, the word does not appear. */}
          {showVat && (
            <li className="flex justify-between gap-4 text-[14px]">
              <span>VAT</span>
              <span className="numeric shrink-0">{formatPence(invoice.vatPence)}</span>
            </li>
          )}
        </ul>
        <div className="mt-4 flex items-baseline justify-between border-t border-divider pt-3">
          <span className="k">Total</span>
          <span className="numeric text-2xl">{formatPence(invoice.totalPence)}</span>
        </div>
      </Plate>

      {invoice.status === 'sent' && (
        <>
          <p className={`mt-4 text-[15px] ${late > 0 ? 'font-semibold' : ''}`}>
            {late > 0
              ? `Due on ${formatLondonDateLong(invoice.dueOn)}.`
              : `Due by ${formatLondonDateLong(invoice.dueOn)}.`}
          </p>

          {business.bankDetailsText && (
            <div className="mt-4 border-l-2 border-accent-700 bg-neutral-100 p-3 text-[14px]">
              <p className="k">Pay by bank transfer</p>
              <p className="mt-1">{business.bankDetailsText}</p>
              <p className="mt-1">
                Reference: <span className="ref">{invoice.number}</span>
              </p>
            </div>
          )}

          {card && (
            <a
              href={card.url}
              className="k mt-6 flex min-h-14 w-full items-center justify-center bg-accent-900 px-6 text-bg hover:bg-ink"
            >
              Pay {formatPence(invoice.totalPence)} by card
            </a>
          )}
        </>
      )}

      <p className="mt-8 text-[13px] muted">
        {business.name}
        {business.phone ? ` · ${business.phone}` : ''} · {business.contactEmail}
        {business.vatNumber && business.vatRegistered ? ` · VAT ${business.vatNumber}` : ''}
      </p>
    </PublicShell>
  );
}
