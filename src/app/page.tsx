import { ContactForm } from '@/components/marketing/contact-form';
import { Plate } from '@/components/ui/plate';
import { JOB_COLUMN_LABEL, WAITING_REASON_LABEL } from '@/lib/enums';

// Demo trading name and address -- swap for the real ones before launch. The
// .example domain is reserved, so a prospect's mail can never reach a stranger.
const BUSINESS = 'Tidemark Software';
const CONTACT_EMAIL = 'hello@tidemark.example';

export const metadata = {
  title: `${BUSINESS} — a job board for marine trades`,
  description:
    'For shipwrights, riggers, marine engineers and electricians. Get the job out of your head in one line, sort it later, and let the boat’s history find you the next one.',
};

// A picture of the board, not the board. Column and reason names come from
// the enums so the page cannot drift from what the app actually says.
const BOARD: { column: keyof typeof JOB_COLUMN_LABEL; cards: Card[] }[] = [
  {
    column: 'jotted',
    cards: [
      { boat: 'No boat yet', job: 'Sundowner cutless bearing? ring Pete' },
      { boat: 'No boat yet', job: 'bloke at Bosham, furler sticking' },
    ],
  },
  {
    column: 'waiting',
    cards: [
      { boat: 'Kittiwake', job: 'Unstep mast, re-rig', waiting: 'crane', until: 'Thu 16', flash: true },
      { boat: 'Blue Moss', job: 'Replace seacocks', waiting: 'parts', until: 'ETA 22nd' },
    ],
  },
  {
    column: 'on_it',
    cards: [{ boat: 'Mary Ellen', job: 'Engine service, 1GM10', place: 'EYH hard' }],
  },
  {
    column: 'invoiced',
    cards: [{ boat: 'Tern II', job: 'Winterise', place: 'Itchenor', owed: '£185 · 12 days' }],
  },
];

type Card = {
  boat: string;
  job: string;
  place?: string;
  waiting?: keyof typeof WAITING_REASON_LABEL;
  until?: string;
  flash?: boolean;
  owed?: string;
};

const OWNER = [
  {
    title: 'Estimates they answer from the sofa',
    body: 'The owner gets the estimate by email and says yes or no with one tap. No account, no password. If they rang you instead, you tick “agreed by phone” and it’s on the record.',
  },
  {
    title: 'Extra work, agreed before you do it',
    body: 'Found a weeping seacock? Send the variation from the boat. They approve it in writing, the card gets a dot until they do. That’s the argument you won’t have in March.',
  },
  {
    title: 'Where their boat is up to',
    body: 'Each owner has one link to their boat: what’s booked, what’s waiting on the crane, what you’ve done. They check that instead of ringing you.',
  },
];

const DULL_BITS = [
  'Numbered invoices, never reused',
  'VAT only if you’re registered — otherwise the word never appears',
  'A CSV for your accountant',
  'Printable job sheet for the helper, and a printable board',
  'Parts on order with ETAs, visits you can postpone with one email',
  'Works on a phone with one thumb. Nothing to drag',
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-divider bg-bg">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <span className="font-condensed text-lg font-semibold uppercase tracking-[0.08em]">
            {BUSINESS}
          </span>
          <a
            href="#contact"
            className="bg-brand-600 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-[0.08em] text-white hover:bg-brand-700"
          >
            Get in touch
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5">
        <section className="py-14 sm:py-20">
          <p className="k text-accent-700">For shipwrights, riggers, marine engineers and electricians</p>
          <h1 className="mt-4 text-4xl uppercase sm:text-6xl">
            For the jobs currently written on the back of your hand.
          </h1>
          <p className="mt-6 text-lg leading-relaxed muted">
            Type one line — <em>“Sundowner, cutless bearing, EYH hard”</em> — and it’s on the board.
            No boat, owner or price required. Sort it out later, when your hands are clean.
          </p>
          <p className="mt-8">
            <a
              href="#contact"
              className="inline-flex min-h-12 w-full items-center justify-center bg-brand-600 px-6 font-condensed font-semibold uppercase tracking-[0.08em] text-white hover:bg-brand-700 sm:w-auto"
            >
              Tell me where your job list lives now
            </a>
          </p>
        </section>

        <section className="border-t border-divider py-12 sm:py-16">
          <p className="k text-accent-700">01 · The board</p>
          <h2 className="mt-3 text-3xl uppercase">Everything in your head, on one screen</h2>
          <p className="mt-4 leading-relaxed muted">
            Eight columns, from {JOB_COLUMN_LABEL.jotted} to {JOB_COLUMN_LABEL.invoiced}. Tap a card
            to move it. Nothing sits in {JOB_COLUMN_LABEL.waiting} without a reason — the yard’s
            crane, parts, the tide, the owner — and when its date passes, the card flashes until you
            deal with it.
          </p>

          <Plate className="mt-8 bg-white p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BOARD.map(({ column, cards }) => (
                <div key={column}>
                  <p className="k muted">
                    {JOB_COLUMN_LABEL[column]} · {cards.length}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {cards.map((c) => (
                      <li
                        key={c.job}
                        className={`border border-divider bg-bg p-2 ${c.flash ? 'flash' : ''}`}
                      >
                        <p
                          className={`font-condensed leading-tight ${
                            column === 'jotted' ? 'text-sm italic muted' : 'text-base font-semibold'
                          }`}
                        >
                          {c.boat}
                        </p>
                        <p className="text-xs leading-snug">{c.job}</p>
                        {c.waiting && (
                          <p className="mt-1.5 inline-block bg-neutral-200 px-1.5 py-1 font-condensed text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-neutral-700">
                            {WAITING_REASON_LABEL[c.waiting]} · {c.until}
                          </p>
                        )}
                        {c.place && <p className="ref mt-1 muted">{c.place}</p>}
                        {c.owed && <p className="ref mt-1 text-accent-700">{c.owed}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Plate>
          <p className="mt-3 text-sm muted">
            Four of the eight columns. On a phone you see one at a time.
          </p>
        </section>

        <section className="border-t border-divider py-12 sm:py-16">
          <p className="k text-accent-700">02 · The owner</p>
          <h2 className="mt-3 text-3xl uppercase">
            The owner gets updates without you picking up the phone
          </h2>
          <p className="mt-4 leading-relaxed muted">
            They live inland and visit at weekends. So every approval happens by link, and every
            answer lands back on the card.
          </p>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {OWNER.map((p) => (
              <div key={p.title}>
                {/* Two lines reserved so the three bodies start level at desktop widths. */}
                <h3 className="text-lg uppercase text-balance text-accent-700 sm:min-h-[2lh]">{p.title}</h3>
                <p className="mt-2 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-divider py-12 sm:py-16">
          <p className="k text-accent-700">03 · The next job</p>
          <h2 className="mt-3 text-3xl uppercase">Reminders that find you work</h2>
          <p className="mt-4 leading-relaxed">
            Every boat keeps its history: what you did, when, and how old the kit is. Standing
            rigging past ten years, engines past their service, antifoul due. Once a month you see
            who’s due and send the lot in one go. When an owner taps “yes, book me in”, it lands on
            your board as an enquiry.
          </p>
          <p className="mt-4 leading-relaxed">
            And when their insurer asks how old the rigging is, you print them a dated rig record.
            The rigger who holds the records gets the next job.
          </p>
        </section>

        <section className="border-t border-divider py-12 sm:py-16">
          <p className="k text-accent-700">04 · The rest</p>
          <h2 className="mt-3 text-3xl uppercase">The dull bits, done</h2>
          <ul className="mt-6 space-y-2.5">
            {DULL_BITS.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="font-semibold text-accent-700">
                  +
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm muted">
            Not marina software, not an accounts package, no timesheets. One trade, their boats,
            their jobs.
          </p>
        </section>

        <section className="border-t border-divider py-12 sm:py-16">
          <p className="k text-accent-700">05 · Price</p>
          <h2 className="mt-3 text-3xl uppercase">Not set yet</h2>
          {/* No price until the founder sets one: ANALYSIS-TRADES §10 Q1. */}
          <Plate className="mt-6 bg-white p-6">
            <p className="leading-relaxed">
              I’m building this with the first few tradespeople who use it, and the price will be
              set with them. If you already pay for something — or pay nothing and use a notebook —
              tell me, and tell me what you’d hate about paying more.
            </p>
          </Plate>
        </section>

        <section id="contact" className="scroll-mt-16 border-t border-divider py-12 sm:py-16">
          <p className="k text-accent-700">06 · Talk to me</p>
          <h2 className="mt-3 text-3xl uppercase">Get in touch</h2>
          <p className="mt-3 mb-8 muted">
            Show me where your job list lives now. If this wouldn’t beat it, I’ll say so.
          </p>
          <ContactForm />
        </section>
      </main>

      <footer className="border-t border-divider py-8">
        <div className="mx-auto max-w-3xl px-5 text-sm muted">
          <p>
            {BUSINESS} &middot;{' '}
            <a className="underline hover:text-brand-700" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </footer>
    </>
  );
}
