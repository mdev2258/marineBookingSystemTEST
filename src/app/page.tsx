import { ContactForm } from '@/components/marketing/contact-form';

// PLACEHOLDER — swap for the real trading name (and the footer email) before
// this goes anywhere near a prospect.
const BUSINESS = 'Tidemark Software';
const CONTACT_EMAIL = 'hello@example.com';

export const metadata = {
  title: `${BUSINESS} — job and quote software for marine trades`,
  description:
    'One system for boatyards, surveyors, riggers, shipwrights and marine engineers. Enquiries, quotes, deposits and the yard diary in one place. Setup from £600, then £40 a month.',
};

const PROBLEMS = [
  {
    title: 'Enquiries that go cold',
    body: 'A request comes in by phone, another by email, a third through the website. One of them gets written on a pad and never priced. Every job that comes in lands in one list that is not done with until somebody has quoted it.',
  },
  {
    title: 'Quotes chased by phone',
    body: 'You price the job from the yard on your phone. The owner gets it as an email with the boat, the price and the date on it, and accepts with one tap. The deposit lands without you invoicing anybody.',
  },
  {
    title: 'The tide and the forecast',
    body: 'Call off a crane day at 06:30 from the slipway. Every owner booked in is emailed the reason and a link to pick a new tide, their deposit moves with them, and you can see who has rebooked and who still needs a ring.',
  },
];

const STEPS = [
  {
    title: 'A half-hour call',
    body: 'You walk me through how work reaches you now and what actually goes wrong. If it is not a fit, I will say so on the call.',
  },
  {
    title: 'I set it up around you',
    body: 'Your services, your deposit terms, your wording, your tide windows. Usually live within two weeks. You do not fill in a setup wizard.',
  },
  {
    title: 'You price work and get paid',
    body: 'Owners ask, you quote, they accept and pay. I host it, keep it patched, and answer the phone when something looks wrong.',
  },
];

const INCLUDED = [
  'One inbox for every enquiry, by boat',
  'Quote from your phone; they accept and pay online',
  'Card deposits taken the moment a quote is accepted',
  'A yard diary built for one thumb and wet hands',
  'Vessel records: length, keel, berth, and what you did last time',
  'Tide and weather cancellations with one-tap rebooking',
  'Hosting, backups, updates and support',
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <span className="font-semibold tracking-tight">{BUSINESS}</span>
          <a
            href="#contact"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Get in touch
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5">
        <section className="py-14 sm:py-20">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Your next job is on a pad, in a text, or in someone&rsquo;s head.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-700">
            I build small job and quote systems for boatyards, surveyors, riggers, shipwrights and
            marine engineers — one place where every enquiry, quote, deposit and boat lives, that
            works on a phone in the rain.
          </p>
          <p className="mt-8">
            <a
              href="#contact"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700 sm:w-auto"
            >
              Tell me about your setup
            </a>
          </p>
        </section>

        <section className="border-t border-slate-200 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Three things it fixes</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title}>
                <h3 className="font-semibold text-brand-700">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-slate-700">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-200 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 space-y-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-700">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-slate-200 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <div className="mt-8 rounded-lg border border-slate-200 p-6">
            <p className="text-3xl font-semibold tracking-tight">
              From £600 <span className="text-lg font-normal text-slate-600">one-off setup</span>
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              then £40 <span className="text-lg font-normal text-slate-600">a month</span>
            </p>
            <p className="mt-4 text-slate-700">
              No per-booking commission and no long contract — a month&rsquo;s notice and it stops.
              Card processing fees are charged by the payment provider directly.
            </p>
            <ul className="mt-6 space-y-2.5">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-3 text-slate-700">
                  <span aria-hidden className="font-semibold text-brand-600">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="contact" className="scroll-mt-16 border-t border-slate-200 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Get in touch</h2>
          <p className="mt-3 mb-8 text-slate-700">
            Tell me roughly how work reaches you today and I will tell you whether this is worth
            your money.
          </p>
          <ContactForm />
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto max-w-3xl px-5 text-sm text-slate-600">
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
