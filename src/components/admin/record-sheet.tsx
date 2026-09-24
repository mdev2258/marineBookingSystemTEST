import { PrintButton } from '@/components/admin/print-button';
import { formatLondonDateLong } from '@/lib/time';

/**
 * The shared frame for a printable record: who issued it, about which boat,
 * on what date, with a place to sign.
 *
 * Both records carry the issuing business and a date because that is what
 * makes them evidence. An insurer asking "when was the rigging done" will not
 * accept a page that does not say who did it and when it was issued.
 */
export function RecordSheet({
  business,
  title,
  boat,
  owner,
  issuedOn,
  children,
}: {
  business: { name: string; phone: string | null; contactEmail: string };
  title: string;
  boat: { name: string; make: string | null; model: string | null; year: number | null; lengthMetres: number | null };
  owner: { name: string } | null;
  issuedOn: string;
  children: React.ReactNode;
}) {
  const spec = [boat.make, boat.model, boat.year, boat.lengthMetres ? `${boat.lengthMetres}m` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="py-6">
      <header className="flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
        <div>
          <p className="k">{business.name}</p>
          <h1 className="mt-1 font-condensed text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="no-print">
          <PrintButton />
        </div>
      </header>

      <dl className="sheet-row mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-4">
        <div>
          <dt className="k muted">Boat</dt>
          <dd className="font-semibold">{boat.name}</dd>
        </div>
        <div>
          <dt className="k muted">Details</dt>
          <dd>{spec || '—'}</dd>
        </div>
        <div>
          <dt className="k muted">Owner</dt>
          <dd>{owner?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="k muted">Issued</dt>
          <dd>{formatLondonDateLong(issuedOn)}</dd>
        </div>
      </dl>

      {children}

      <footer className="sheet-row mt-8 border-t border-divider pt-4 text-[12px] muted">
        <p>
          {business.name}
          {business.phone ? ` · ${business.phone}` : ''} · {business.contactEmail}
        </p>
        {/* Room above the rule to actually write, and rules long enough for a
            signature (QA r2: the old ones were the width of the word). */}
        <div className="mt-12 flex gap-10">
          <p className="flex-1 border-t border-ink pt-1">Signed</p>
          <p className="w-40 border-t border-ink pt-1">Date</p>
        </div>
      </footer>
    </article>
  );
}

/**
 * A printed quantity. Labour is hours, and a bare "2.5" on a sheet handed to an
 * owner or insurer does not say that.
 */
export function printQty(line: { qty: number; kind: string | null }): string {
  if (line.kind !== 'labour') return String(line.qty);
  return `${line.qty} ${line.qty === 1 ? 'hr' : 'hrs'}`;
}
