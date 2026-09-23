import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/shell';
import { PrintButton } from '@/components/admin/print-button';
import { cardTitle, isOverdue, loadBoard, unpaidPence } from '@/lib/board';
import { JOB_COLUMN, JOB_COLUMN_LABEL, WAITING_REASON_LABEL, type WaitingReason } from '@/lib/enums';
import { formatPenceShort } from '@/lib/money';
import { formatLondonDateLong, formatLondonDateShort, todayInLondon } from '@/lib/time';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Board — print' };

/**
 * THE BOARD ON PAPER (ANALYSIS-TRADES.md §7 F7), landscape A4 or A3.
 *
 * For the trade who still wants the week pinned to the workshop wall, or folded
 * into a jacket pocket for the day. Same data as the live board -- it goes
 * through the same loadBoard() -- so what prints is exactly what is on screen.
 *
 * Landscape is a CSS NAMED PAGE (`page: board` in globals.css), so this one
 * route prints sideways while every record and job sheet stays portrait. No
 * print library, and no second stylesheet.
 *
 * Paper cannot flash or show a coloured dot, so both are spelled out: an
 * overdue waiting card says LATE, and one with extra work waiting on the owner
 * says OWNER. A signal that only exists as animation is lost the moment it is
 * printed.
 */
export default async function PrintBoardPage() {
  const board = await loadBoard();
  const today = todayInLondon();
  const total = [...board.values()].reduce((n, c) => n + c.length, 0);

  return (
    <AdminShell wide>
      <div className="print-board py-4">
        <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
          <div>
            <h1 className="font-condensed text-xl font-semibold tracking-tight">The board</h1>
            <p className="text-[11px] muted">
              {formatLondonDateLong(today)} · {total} jobs in hand
            </p>
          </div>
          <div className="no-print">
            <PrintButton />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-8 gap-2">
          {JOB_COLUMN.map((col) => {
            const cards = board.get(col) ?? [];
            return (
              <section key={col} className="min-w-0">
                <h2 className="k flex justify-between border-b border-ink pb-1 text-[9px]">
                  <span>{JOB_COLUMN_LABEL[col]}</span>
                  <span>{cards.length}</span>
                </h2>
                <ul className="mt-1 space-y-1">
                  {cards.map((card) => {
                    const late = isOverdue(card, today);
                    const owed = unpaidPence(card);
                    return (
                      <li
                        key={card.id}
                        className={`sheet-row border p-1 text-[9.5px] leading-tight ${
                          late ? 'border-ink border-2' : 'border-divider'
                        }`}
                      >
                        <p className="font-semibold">
                          {card.vessel?.name ?? 'No boat yet'}
                          {/* Real spaces, not margins: a margin is not text, so a
                              screen reader, a copy-paste or a squeezed column
                              reads it as "HalcyonLATE". */}
                          {late && (
                            <>
                              {' '}
                              <span className="font-bold">LATE</span>
                            </>
                          )}
                          {card.variations.length > 0 && (
                            <>
                              {' '}
                              <span className="font-bold">OWNER</span>
                            </>
                          )}
                        </p>
                        <p className="mt-0.5">{cardTitle(card)}</p>
                        {(card.place || card.waitingReason || owed > 0) && (
                          <p className="mt-0.5 muted">
                            {[
                              card.place?.shortName,
                              col === 'waiting' && card.waitingReason
                                ? `${WAITING_REASON_LABEL[card.waitingReason as WaitingReason] ?? card.waitingReason}${
                                    card.waitingUntil ? ` ${formatLondonDateShort(card.waitingUntil)}` : ''
                                  }`
                                : null,
                              owed > 0 ? formatPenceShort(owed) : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}
