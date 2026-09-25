'use client';

import { useActionState, type ReactNode } from 'react';
import { LINE_KIND, LINE_KIND_LABEL, type LineKind } from '@/lib/enums';
import type { DraftRow, LinesState } from '@/app/admin/board/[id]/actions';

/** Blank rows offered on every render, so a line can always be added without JS. */
const SPARE_ROWS = 3;

/**
 * The line table. A client component for one reason: when a save is refused
 * (a price that will not parse, a total too big) the action hands back what
 * was typed and this re-renders from it, rather than from the database --
 * a redirect would throw away every line typed since the last save.
 */
export function LinesForm({
  action,
  saved,
  defaultUnitPrice,
  children,
}: {
  action: (prev: LinesState, formData: FormData) => Promise<LinesState>;
  saved: DraftRow[];
  defaultUnitPrice: string;
  /** The running total, shown between the table and the button. */
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const rows: (DraftRow | null)[] = [...(state?.rows ?? saved), ...Array<null>(SPARE_ROWS).fill(null)];
  // A new key per result, so the uncontrolled inputs take the returned values.
  const round = state ? 'r' : 's';

  return (
    <form action={formAction} className="mt-4">
      {state?.error && (
        <p role="alert" className="border border-accent-700 bg-accent-100 p-3 text-[13.5px]">
          {state.error}
        </p>
      )}
      <table className="mt-2 w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-divider text-left">
            <th className="k py-2 pr-2">Done</th>
            <th className="k py-2 pr-2">Kind</th>
            <th className="k py-2 pr-2">Description</th>
            <th className="k w-16 py-2 pr-2">Qty</th>
            <th className="k w-24 py-2">Unit £</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line, i) => (
            <tr key={`${round}-${i}`} className="border-b border-divider align-top">
              <td className="py-2 pr-2">
                {/* The index is the value, so a tick survives reordering
                    within a single save. */}
                <input
                  type="checkbox"
                  name="done"
                  value={String(i)}
                  defaultChecked={line?.done ?? false}
                  aria-label="Work done"
                  className="mt-3 h-6 w-6 accent-accent-700"
                />
              </td>
              <td className="py-2 pr-2">
                <select
                  name="kind"
                  defaultValue={line?.kind ?? 'labour'}
                  aria-label="Kind"
                  className="min-h-11 w-full border border-divider bg-bg px-2"
                >
                  {LINE_KIND.map((k) => (
                    <option key={k} value={k}>
                      {LINE_KIND_LABEL[k as LineKind]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-2">
                <input
                  type="text"
                  name="description"
                  defaultValue={line?.description ?? ''}
                  placeholder={line ? '' : 'Add a line…'}
                  aria-label="Description"
                  className="min-h-11 w-full border border-divider bg-bg px-2"
                />
              </td>
              <td className="py-2 pr-2">
                <input
                  type="text"
                  name="qty"
                  inputMode="decimal"
                  defaultValue={line?.qty ?? ''}
                  placeholder="1"
                  aria-label="Quantity"
                  className="min-h-11 w-full border border-divider bg-bg px-2"
                />
              </td>
              <td className="py-2">
                <input
                  type="text"
                  name="unitPrice"
                  inputMode="decimal"
                  defaultValue={line ? line.unitPrice : defaultUnitPrice}
                  aria-label="Unit price in pounds"
                  className="min-h-11 w-full border border-divider bg-bg px-2"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {children}

      <button
        type="submit"
        disabled={pending}
        className="k mt-4 min-h-12 border border-ink px-5 hover:bg-neutral-200"
      >
        Save lines
      </button>
    </form>
  );
}
