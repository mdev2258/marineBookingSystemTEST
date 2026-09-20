// Money is Int pence everywhere. There is no Decimal and no float arithmetic.

/** 9500 -> "£95.00" */
export function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(pence / 100);
}

/** 9500 -> "£95", 9550 -> "£95.50". For dense UI where trailing .00 is noise. */
export function formatPenceShort(pence: number): string {
  return pence % 100 === 0
    ? `£${pence / 100}`
    : formatPence(pence);
}

export function totalPence(partySize: number, pricePerPersonPence: number): number {
  return partySize * pricePerPersonPence;
}

/**
 * The deposit is computed exactly once, at booking creation, and then frozen on
 * the row. It is never recomputed -- so it survives a later price change and it
 * transfers unchanged when a booking is rebooked onto a different session.
 */
export function depositPence(
  partySize: number,
  pricePerPersonPence: number,
  depositPercent: number,
): number {
  return Math.round((depositPercent / 100) * partySize * pricePerPersonPence);
}

export function balancePence(total: number, deposit: number): number {
  return Math.max(0, total - deposit);
}

/**
 * Admin types prices in pounds; the database only ever holds pence.
 * Returns null for anything that is not a sane positive amount, so the caller
 * can report it rather than writing NaN to a column.
 */
export function poundsToPence(input: string): number | null {
  const trimmed = input.trim().replace(/^£/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  // parseFloat('95.50') * 100 is 9550.000000000002; round before it becomes a column.
  return Math.round(parseFloat(trimmed) * 100);
}

/** 9500 -> "95.00", for prefilling a number input. */
export function penceToPoundsInput(pence: number): string {
  return (pence / 100).toFixed(2);
}
