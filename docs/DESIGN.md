# Design: the Industry system

The visual design comes from a Claude Design handoff, `Marine App Design
Directions.zip` — a project called **Tidemark**, built on the **Industry**
design system. This file records what was adopted, what was changed, and why,
so the next person does not have to diff the bundle against the code.

## The system in one paragraph

A wireframe aesthetic. Steel blue on a light technical ground, condensed
headings, **square corners everywhere**, hairline borders, and `+` registration
marks at the corners of framed objects. Cards are line drawings rather than
filled surfaces. One accent hue only.

## What was adopted

**Tokens** are ported from the bundle's Industry stylesheet into the `@theme`
block of `src/app/globals.css` — the full steel accent ramp, the neutral ramp,
the ground and ink colours, and the divider mix. They are copied from the
source rather than transcribed by eye.

**Two shortcuts carried the restyle across the whole app from one file:**

1. The app was already built against a `brand-*` colour scale. Rather than
   rewrite every `className`, those names are re-pointed at the steel ramp. The
   entire app moved onto the system without touching a component.
2. Rule 1 of the system is that nothing is rounded. Instead of hunting down
   every `rounded-md`, the Tailwind radius scale is **zeroed** in `@theme`, so
   all existing radius utilities become no-ops.

**Typography** is Barlow for body and Barlow Condensed for headings, kickers,
references and numerals, loaded via `next/font` rather than the stylesheet's
`@import` so there is no extra blocking request.

**Primitives** live in `src/components/ui/`:

- `<Plate>` — the framed object. Draws the hairline border *and* the four
  registration marks. Rule 2 of the system says a framed object never appears
  without its marks, so this is the only thing that draws them: screens use
  `<Plate>` rather than applying `.blueprint` themselves, which makes
  forgetting the marks impossible rather than merely discouraged.
- `<Pill>` / `<JobPill>` — the three-tone status pill (`ok` / `now` / `due`).
- `<PaymentState>` — payment is deliberately **text, not a pill**, per the
  system.

## Deliberate deviations

| Decision | Why |
|---|---|
| **The yard stays "Harbourside Marine"** | The handoff calls the boatyard "Tidemark". In this codebase Tidemark is the placeholder name of the *software* business on the marketing page at `/`. Renaming either one is the owner's call, not a design decision. |
| **No customer accounts** | The designs assume customers log in and switch roles. This app reaches owners through single-use emailed tokens instead. A demo nobody has to sign up for is worth more than fidelity here, and it avoids building auth, resets and recovery. |
| **The marketing page at `/` is not restyled** | It belongs to the software business, not the yard. The handoff only covers the product. |
| **Deposit stays 50%** | The handoff shows 30% on approval (and 25% elsewhere — its own open question #5). Ours is 50% and lives on the service, so it is data rather than a design token. |
| **References stay `HS-XXXXXX`** | The handoff uses `TM-J118` / `TM-Q77`. Ours are already generated, unguessable and printed on emails and screens. |
| **2c is built shallow** | See below. |

## The three directions

The handoff presents 2a, 2b and 2c as **competing directions**, and says to
confirm which ships. The decision taken: **all three, as stages of one flow** —
2a the boat file, 2b the quote, 2c the live job. This is the handoff's own
guess at the likely answer.

Scope was capped at **restyle plus quote line items**, which leaves 2c partly
unbuildable as drawn: its timeline, photographs, message composer and
extra-work approvals all need storage that does not exist.

**What 2c gets instead:** the dark job header with its progress bar, and a
timeline **derived from history already stored** — created, quoted, accepted,
deposit paid, rebooked, completed, plus `EmailLog` rows. That is a real
timeline over real events with no new tables. Photos, the composer and
variations are out.

## Not ported

- `ios-frame.jsx` — a presentation bezel for the prototype. The handoff says
  explicitly not to port it.
- `support.js`, `_ds_bundle.js` — prototype runtime, not app code.
- Turn 1 (berth and mooring booking) — marked superseded in the handoff.
- Photography — every image in the prototype is a hatched placeholder. Real
  duotoned photographs would go through the system's `.duotone` wrapper.

## Open questions the handoff raised, and where they stand

1. **Which direction ships?** Answered: all three as one flow.
2. **Do customers self-serve a slot, or does everything go through a quote?**
   Answered by the app: both. A published slot can be asked for, and work with
   no date can be requested. Either way the yard quotes it before anything is
   held or owed.
3. **Is there an engineer role?** Not built. No staff model exists.
4. **Multi-boat clients — does the boat file need a switcher?** The seed has
   two owners with two boats, so this is real, but the boat file is reached per
   vessel rather than per owner.
5. **Payment split.** Ours is 50%, not the handoff's 30%.
6. **Is VAT included in displayed prices?** Unresolved. Quotes currently show a
   single figure with no VAT statement either way — worth settling before this
   goes near a real customer.
