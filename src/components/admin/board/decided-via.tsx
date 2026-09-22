import { DECIDED_VIA, DECIDED_VIA_LABEL, type DecidedVia } from '@/lib/enums';

/**
 * How the owner answered, when they did not use the link.
 *
 * "Agreed by phone" is a first-class path and not a fallback
 * (ANALYSIS-TRADES.md §3.5). The owner is inland, the trade is up a mast with
 * one bar of signal, and the deal gets done by voice. The app's job is to
 * record what actually happened, with a note and a timestamp -- not to make
 * the record tidy by pretending everyone clicks buttons.
 */
export function DecidedViaField({ name = 'decidedVia' }: { name?: string }) {
  return (
    <fieldset className="mt-3">
      <legend className="k muted">How did they tell you?</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {DECIDED_VIA.filter((v) => v !== 'link').map((v) => (
          <label
            key={v}
            className="k flex min-h-11 cursor-pointer items-center gap-2 border border-divider px-3 has-[:checked]:border-accent-700 has-[:checked]:bg-accent-100"
          >
            <input
              type="radio"
              name={name}
              value={v}
              defaultChecked={v === 'phone'}
              className="accent-accent-700"
            />
            {DECIDED_VIA_LABEL[v as DecidedVia]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
