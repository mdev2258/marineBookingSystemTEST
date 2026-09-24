import { getBusiness } from '@/lib/business';

/**
 * The chrome an owner sees. Used by every token page.
 *
 * The business name used to be a link to /book, which is parked behind
 * FEATURE_YARD -- a tradesperson has no public slot list to send anyone to.
 * It is plain text now: an owner arriving from an emailed link has exactly
 * one thing to do on the page they landed on, and a header link is only a way
 * to lose them.
 *
 * With no `business` passed it reads the Operator row itself, so no page can
 * fall back to a made-up phone number.
 */
export async function PublicShell({
  children,
  business: passed,
  width = 'wide',
}: {
  children: React.ReactNode;
  business?: { name: string; phone: string | null };
  width?: 'wide' | 'narrow';
}) {
  const business = passed ?? (await getBusiness());
  // Header and content share one width, so their left edges line up.
  const max = width === 'narrow' ? 'max-w-xl' : 'max-w-2xl';
  return (
    <>
      <header className="border-b border-divider">
        <div className={`mx-auto flex ${max} items-center justify-between gap-4 px-5 py-4`}>
          <span className="font-condensed font-semibold tracking-tight">{business?.name}</span>
          {business?.phone && (
            <a
              href={`tel:${business.phone.replace(/\s/g, '')}`}
              className="text-sm whitespace-nowrap text-accent-700 underline"
            >
              {business.phone}
            </a>
          )}
        </div>
      </header>
      <main className={`mx-auto w-full px-5 py-8 ${max}`}>
        {children}
      </main>
    </>
  );
}
