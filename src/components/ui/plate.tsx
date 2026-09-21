/**
 * A framed object in the Industry system: hairline border, square corners, and
 * a + registration mark straddling each corner.
 *
 * Rule 2 of the system is that a framed object NEVER appears without its
 * marks, so this is the one component that draws them. Screens use <Plate>
 * rather than applying `.blueprint` themselves, which makes forgetting the
 * marks impossible rather than merely discouraged.
 */
export function Plate({
  children,
  className = '',
  onDark = false,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  /** Reverses the marks so they stay visible on an accent-900 field. */
  onDark?: boolean;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  return (
    <Tag className={`blueprint ${onDark ? 'on-dark' : ''} ${className}`}>
      <i className="corner tl" aria-hidden />
      <i className="corner tr" aria-hidden />
      <i className="corner bl" aria-hidden />
      <i className="corner br" aria-hidden />
      {children}
    </Tag>
  );
}
