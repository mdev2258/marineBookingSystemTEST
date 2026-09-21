'use client';

/**
 * The only client component in the record screens, and it exists for one
 * reason: on a phone there is no Ctrl+P to tell someone to press.
 *
 * Everything else about these records is server-rendered HTML and print CSS.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="k no-print min-h-12 border border-ink px-4 hover:bg-neutral-200"
    >
      Print
    </button>
  );
}
