import type { LineKind } from '@/lib/enums';

/**
 * Money on an estimate, an invoice, or a job's working line list.
 *
 * VAT IS CONDITIONAL AND ITS ABSENCE IS TOTAL. When the business is not
 * registered the word VAT appears nowhere in the app -- not as a zero line,
 * not as "inc. VAT", not as a column that happens to be empty
 * (ANALYSIS-TRADES.md §3.7). Many sole traders are under the threshold, and a
 * document that mentions VAT when you are not registered is a document that
 * gets queried.
 *
 * So this returns `vat: null`, not `vat: 0`, when the business is not
 * registered -- null means "there is no such concept here" and a renderer
 * cannot accidentally print £0.00 for it.
 */
export type Totals = {
  net: number;
  vat: number | null;
  /** What they actually pay. Equals net when there is no VAT. */
  gross: number;
};

export function totalsFor(
  lines: { amountPence: number; vatRateBps: number }[],
  vatRegistered: boolean,
): Totals {
  const net = lines.reduce((sum, l) => sum + l.amountPence, 0);
  if (!vatRegistered) return { net, vat: null, gross: net };

  // Rounded per line, not on the sum: that is how an accountant checks it, and
  // it keeps each line's VAT reconcilable on its own.
  const vat = lines.reduce((sum, l) => sum + Math.round((l.amountPence * l.vatRateBps) / 10_000), 0);
  return { net, vat, gross: net + vat };
}

/**
 * The single place a line total is computed. Stored on write rather than
 * derived on read, so a sent estimate can never be re-totalled underneath the
 * owner by a later rounding change.
 */
export function lineAmountPence(qty: number, unitPricePence: number): number {
  return Math.round(qty * unitPricePence);
}

/** Parse "2.5" / "2,5" / "" into a quantity. Blank means one. */
export function parseQty(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (!trimmed) return 1;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const n = parseFloat(trimmed);
  return n > 0 ? n : null;
}

/**
 * A line the trade typed. Kept as a plain shape so the form, the action and
 * the seed all agree on what a line is.
 */
export type LineDraftInput = {
  kind: LineKind;
  description: string;
  qty: number;
  unitPricePence: number;
  vatRateBps: number;
};

/** The default VAT rate on a new line, in basis points. 20% UK standard. */
export const DEFAULT_VAT_BPS = 2000;
