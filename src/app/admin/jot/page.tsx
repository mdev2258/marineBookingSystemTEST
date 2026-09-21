import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/shell';
import { createJot } from '@/app/admin/board/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Jot — Harbourside Marine Services' };

/**
 * JOT. The wedge, and the only screen that has to be fast to the millisecond.
 *
 * One text box. No boat, no owner, no place, no category, no required field --
 * type or paste anything and it is saved. The target is under five seconds
 * from a locked phone, which is why the textarea autofocuses and the button is
 * a thumb's width from the bottom of the screen.
 *
 * Anything added to this screen makes the product worse. If it is slower than
 * writing on the back of your hand, they will use their hand.
 */
export default async function JotPage(props: PageProps<'/admin/jot'>) {
  const params = await props.searchParams;
  const wasEmpty = params.empty === '1';

  return (
    <AdminShell>
      <form action={createJot} className="flex min-h-[70vh] flex-col py-5">
        <label htmlFor="text" className="k">
          Get it out of your head
        </label>

        <textarea
          id="text"
          name="text"
          autoFocus
          required
          rows={8}
          placeholder="Westerly at Bosham, owner wants furler looked at"
          className="mt-3 w-full flex-1 border border-divider bg-bg p-3 text-[16px] leading-snug outline-none focus:border-accent-700"
        />

        {wasEmpty && (
          <p className="mt-2 text-[13.5px] text-accent-800">
            Nothing to save — type or paste something first.
          </p>
        )}

        <p className="mt-3 text-[13.5px] muted">
          Sort it out later. A boat, a place and a price can all wait.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="k min-h-14 flex-1 bg-accent-900 px-6 text-bg hover:bg-ink"
          >
            Save it
          </button>
          <Link
            href="/admin/board"
            className="k flex min-h-14 items-center border border-divider px-5"
          >
            Cancel
          </Link>
        </div>
      </form>
    </AdminShell>
  );
}
