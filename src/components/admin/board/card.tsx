import Link from 'next/link';
import { Plate } from '@/components/ui/plate';
import { formatPenceShort } from '@/lib/money';
import { WAITING_REASON_LABEL, type WaitingReason } from '@/lib/enums';
import { cardTitle, isOverdue, unpaidPence, type BoardCard } from '@/lib/board';
import { formatLondonDateShort } from '@/lib/time';
import { daysOutstanding, daysOverdue } from '@/lib/invoices';

/**
 * A card shows this, and ONLY this (ANALYSIS-TRADES.md §4):
 *
 *   boat name (large) · one-line job · place (short) · waiting reason + date
 *   · £ if invoiced and unpaid · a dot if a variation awaits the owner
 *
 * Everything else lives behind a tap. A card read at arm's length in bright
 * sun with one thumb free cannot afford a second row of metadata, and every
 * field added here is one the eye has to skip past on the other forty cards.
 */
export function BoardCard({ card, today }: { card: BoardCard; today: string }) {
  const overdue = isOverdue(card, today);
  const owed = unpaidPence(card);
  const awaitingOwner = card.variations.length > 0;
  const isJot = card.vessel == null;

  return (
    <Plate
      as="li"
      className={`bg-bg p-3 ${overdue ? "flash" : ""}`}
    >
      <Link href={`/admin/board/${card.id}`} className="block min-h-11">
        <div className="flex items-start justify-between gap-2">
          {/* The boat, not the owner: the trade thinks in boats. An unsorted
              jot has no boat yet, and says so rather than faking one. */}
          <p
            className={`min-w-0 wrap-anywhere font-condensed leading-tight ${
              isJot ? 'text-[15px] italic muted' : 'text-[19px] font-semibold'
            }`}
          >
            {isJot ? 'No boat yet' : card.vessel?.name}
          </p>
          {awaitingOwner && (
            // aria-label on a bare span is ignored by screen readers; real
            // (visually hidden) text becomes part of the link's name.
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 bg-accent-700" title="Extra work awaiting the owner">
              <span className="sr-only">Extra work awaiting the owner</span>
            </span>
          )}
        </div>

        {/* wrap-anywhere: a jot is often a pasted URL, which has no break points
            and otherwise runs out of the card (QA r2). */}
        <p className="mt-1 text-[13.5px] leading-snug wrap-anywhere">{cardTitle(card)}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* The flashing border stops after three pulses; the word does not. */}
          {overdue && <span className="k font-bold text-accent-800">Overdue</span>}
          {card.place && <span className="k muted">{card.place.shortName}</span>}

          {card.column === 'waiting' && card.waitingReason && (
            <span className={`k ${overdue ? 'font-bold text-accent-800' : 'muted'}`}>
              {WAITING_REASON_LABEL[card.waitingReason as WaitingReason] ?? card.waitingReason}
              {card.waitingUntil ? ` · ${formatLondonDateShort(card.waitingUntil)}` : ''}
            </span>
          )}

          {/* Money only appears when it is actually owed -- and with how long
              it has been owed (§4), because "19 days" is what makes a trade
              pick up the phone and the amount alone is not. */}
          {owed > 0 && <span className="numeric text-[14px]">{formatPenceShort(owed)}</span>}
          {card.invoices[0] && (
            <span
              className={`k ${
                daysOverdue(card.invoices[0], today) > 0 ? 'font-bold text-accent-800' : 'muted'
              }`}
            >
              {daysOverdue(card.invoices[0], today) > 0
                ? `${daysOverdue(card.invoices[0], today)}d overdue`
                : daysOutstanding(card.invoices[0], today) === 0
                  ? 'sent today'
                  : `${daysOutstanding(card.invoices[0], today)}d out`}
            </span>
          )}
        </div>
      </Link>
    </Plate>
  );
}
