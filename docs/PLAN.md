# Marine Booking — Demo Plan

> **Rewritten 2026-09-21 for the trades product.** The previous version of this
> file described a sailing school, and the version before the pivot described a
> boatyard. Both are gone. `ANALYSIS-TRADES.md` is the research this plan
> implements and wins any disagreement with this file.
>
> **Boundary note:** the build deliberately stops at the payments seam.
> `src/lib/payments.ts` contains stubbed-but-fully-typed functions. `stripe`,
> `src/app/api/stripe/webhook/route.ts` and every Stripe SDK call are the
> specialist's to add. The app demos end to end on the stubs alone.

Stack: Next 16.3.5 (App Router, TS, Tailwind v4), React 19, **Prisma pinned to
6.19.3**, `resend@6`, `jose` (Edge-safe HS256 cookie), `date-fns-tz`.
(`stripe@22` is the specialist's to install.)

## 0. Who this is for

One marine tradesperson — a shipwright, rigger, marine diesel engineer or
marine electrician, one to five people — working Chichester Harbour and the
eastern Solent. Not a marina. Not a boatyard.

Their job list currently lives in their head, on scrap paper, and in a scroll
of texts. Office software has existed for years and they still do not use it,
because **structured data entry is slower than a scrap of paper.** So:

> **Capture first, organise later.** Getting a job out of their head must be
> quicker than writing it on the back of their hand — one line, no required
> fields. The board is where those captures get sorted, and everything else
> grows out of moving cards on it.

Four things make this different from a plumber's job app, and they are the only
reasons to build it rather than sell them Tradify:

1. **The asset is the boat, not an address** — and the boat moves between yard,
   pontoon and mooring.
2. **The owner is somewhere else.** Every approval is remote.
3. **Work waits on other people** — the yard's crane, the tide, the weather,
   parts. "Waiting" is a first-class state with a reason attached.
4. **Records matter for years.** Insurers ask the age of standing rigging and
   want dated receipts. The trade holding those records gets the next job.

## 1. Prisma data model

**Global rules for dialect portability** (SQLite dev <-> Postgres prod). These
survive from the previous plan unchanged and still bite:

| Avoid | Use instead | Why |
|---|---|---|
| `enum` blocks | `String` column + TS `as const` union + Zod | Prisma enum support on SQLite has been inconsistent across versions; string columns are identical SQL on both |
| `@db.*` native types | plain `String` / `Int` / `DateTime` | provider-specific, fail validation on the other |
| `Decimal` | `Int` pence everywhere | SQLite has no real decimal; also kills float money bugs |
| `Json` | `String` | SQLite `Json` is a string under the hood, queries diverge |
| `mode: 'insensitive'` | lowercase emails on write, exact-match on read | Postgres-only; **throws** on SQLite |
| `createMany({ skipDuplicates })` | loop or `upsert` in seed | unsupported on SQLite |
| `migrations/` folder | **`prisma db push` on both** | a SQLite-generated migration will not apply to Neon. Still the single most likely deploy-night failure |

**New rule: a calendar date is a `String`, not a `DateTime`.** Anything meaning
"a day" — `plannedOn`, `waitingUntil`, `dueOn`, `installedOn`, `lastServicedOn`
— is `"yyyy-MM-dd"` (the `LondonDate` type). Instants stay `DateTime` and stay
UTC. Storing a bare day as an instant is how a job planned for the 16th renders
as the 15th on a laptop in BST, and it makes every date query sortable and
comparable as a string.

Status vocabularies are TS unions in `src/lib/enums.ts`.

### Names

The model names are **domain-neutral on purpose and are not renamed.** They
already survived one pivot (sailing school -> boatyard -> trades) without a
rename, which is the whole argument for them:

| Schema | Read it as | §6 of the analysis calls it |
|---|---|---|
| `Operator` | the trade business | Business |
| `Vessel` | the boat | Boat |
| `Booking` | one job on one boat | Job |
| `QuoteLineItem` | one line of an estimate | EstimateLine |

### Models

**`Operator`** — the business. One row. Carries the things that change what the
app prints: `tradeTypes`, `vatRegistered` + `vatNumber`,
`defaultLabourRatePence`, `invoicePrefix` + `nextInvoiceNumber`,
`paymentTermsDays`, `bankDetailsText`.

`vatRegistered` is load-bearing. Many sole traders are under the registration
threshold, and when it is false **the word VAT appears nowhere** — not as a 0%
line, not as "inc. VAT". Prices are plain totals.

**`Place`** — where boats live and where work happens. `name`, `shortName` (what
fits on a card: "EYH hard"), `kind` (`yard | marina | mooring | drying_mooring
| trailer | other`), `notes` ("keys from the office", "hot works permit").

**`Customer`** — the owner. Unchanged.

**`Vessel`** — the boat. `customerId` is **nullable**: a jot can name a boat
before anyone knows whose it is.

**`VesselMove`** — append-only history of where a boat has been. Only the boat
file reads it.

**`Equipment`** — per-boat kit with an age or an interval: engine, outboard,
standing rigging, furler, seacocks. `installedOn`, `hours`,
`serviceIntervalMonths` / `serviceIntervalHours`, `lastServicedOn`. **This
table is what turns into repeat work.**

**`Booking`** — one job. The card on the board.

`column` is the job's real state: `jotted | enquiry | estimate_sent | booked |
waiting | on_it | done_to_invoice | invoiced`, plus `paid`, which is
deliberately not a column — a paid job drops off the board into the boat's
history. `waitingReason` + `waitingUntil`, `plannedOn`, `placeId`, `position`
(sparse: 100, 200, 300), `columnChangedAt`.

**`vesselId` and `customerId` are nullable, and this is the most load-bearing
fact in the schema.** A job can exist as one line of free text with no boat, no
owner and no place. Every "why is this nullable?" tidy-up breaks the premise of
the product. It is the same rule as `quotedPence`: a job exists before it has a
price, and now, before it has a boat.

`status` and the Stripe columns remain, driving the parked yard flow and the
payment seam. **Nothing on the board reads `status`.**

**`QuoteLineItem`** — a line of work: `kind` (`labour | parts | subcontract |
other`), `description`, `qty` (Float — labour is quoted in hours and 2.5h is
normal), `unitPricePence`, `amountPence`, `vatRateBps`, `done`.

Lines live on the **job**, not on the Estimate. They are the working list the
trade ticks off (`done`); an Estimate is a document sent at a point in time
that snapshots their total; an Invoice snapshots them again into `InvoiceLine`.

`amountPence = round(qty * unitPricePence)` is computed on write in one place
and stored, so a sent estimate cannot be re-totalled by a later rounding change.

**`Estimate`** — `status` (`draft | sent | accepted | declined | superseded`),
`totalPence` + `vatPence` snapshotted at send, `decidedVia`, `decisionNote`,
`token`. Re-estimating **supersedes rather than edits**, so what the owner
agreed to is still readable after the price changes.

The word is **estimate**, not quote: non-binding, time and materials, extra
work expected.

**`Variation`** — extra work found once the job is open. `description`,
`reason`, `estimatePence`, `status` (`awaiting_owner | approved | declined |
withdrawn`), `token`, `reminderSentAt` (exactly one chase at 24h, not a drip
campaign). An unanswered variation puts a dot on the board card.

**`PartOrder`** — `item`, `supplier`, `orderedOn`, `etaOn`, `arrivedOn`,
`costPence`. Arrival of the last outstanding part **offers** to move the card
out of Waiting; it never moves it on its own.

**`Visit`** — a planned attendance: `startsAt`, `placeId`, `status` (`planned |
done | postponed`), `postponeReason`. Postponing emails the owner.

**`Invoice`** / **`InvoiceLine`** — `number` (prefix + sequence, **never
reused**, even after a void), `issuedOn`, `dueOn`, `totalPence`, `status`,
`paidVia`, two reminder timestamps. Lines are **snapshotted** from the job's
done lines plus approved variations: editing a job after invoicing must not
change what was billed.

**`Reminder`** — `vesselId`, `equipmentId?`, `kind` (`service_due | rig_age |
antifoul | winterise | commission | custom`), `dueOn`, `status`, `token`.

**`EmailLog`** — unchanged, and still the evidence trail. "N owners notified" is
a `COUNT`, never a stored counter, which is why the local-mode email path still
writes rows with no Resend key.

**`StripeEvent`**, **`ContactMessage`** — unchanged.

**Parked:** `SessionType`, `Session`, `SessionCancellation`. Behind
`FEATURE_YARD`, out of nav, out of the seed, tables intact. See §5 of the
analysis; **ask before dropping any of them.**

### "Agreed by phone" is always an option

Every owner decision — an estimate, a variation — can be recorded by the trade
with a note, via `decidedVia: 'phone' | 'in_person' | 'text'`. The app records
what happened. It never forces the owner online, and it never treats the phone
as a degraded path.

### Idempotency stays structural

The status or the token goes in the `WHERE` clause and is cleared by the same
statement, so a double submit matches zero rows. Never check-then-write.

### Email is never sent inside a transaction

A rollback cannot unsend a message. Commit first, then send, one at a time.

## 2. Route structure

| Route | Purpose |
|---|---|
| `/` | Marketing page, **for tradespeople** (F8) |
| `/admin` | -> the board |
| `/admin/board` | **The primary screen.** Columns, cards, jot, sort (F1) |
| `/admin/boats/[id]` | Boat file: history, equipment, where it's been (F2) |
| `/admin/reminders` | "Due this month", batch send (F5) |
| `/admin/invoices` | List, CSV export (F6) |
| `/admin/login` | Single login (env creds) |
| `/boat/[token]` | Owner-facing: their boat's current jobs and work records (F2) |
| `/estimate/[token]` | Owner accepts or declines an estimate (F3) |
| `/variation/[token]` | Owner approves extra work (F3) |
| `/invoice/[token]` | Owner views and pays an invoice (F6) |
| `/reminder/[token]` | "Yes, book me in" -> creates an Enquiry card (F5) |
| `GET /api/cron/reminders` | Nightly: compute due reminders, chase variations and invoices |

Parked behind `FEATURE_YARD`: `/admin/day`, `/admin/sessions/*`, `/book/*`,
`/booking/[reference]`, `/rebook/[token]`, `/request`.

**The owner never logs in.** Every owner-facing route is a single-use token
link, cleared the moment it is spent.

**Every Server Action re-checks the admin cookie itself.** `src/proxy.ts` is a
redirect for humans, not an authorisation boundary; an action is a public POST
endpoint in its own right.

## 3. Mobile-first, and then some

Design at **390px** first. Their office is an engine bay or the top of a mast:
dirty hands, one free thumb, bright sun.

- **One thumb.** Every primary action reachable one-handed. 48px targets.
- **No drag required.** Tap to move a card; drag is a desktop bonus.
- **Nothing blocks a save** for a missing field, with exactly one exception:
  a card cannot enter Waiting without a reason.
- Phone: one column at a time with tabs. Desktop: columns side by side.

Keep the Industry design system (`DESIGN.md`) for the app. Board/TV mode is the
one place large type and a dark ground override it.

## 4. Build order

Each phase is built, checked and committed before the next starts. Acceptance
criteria are in `ANALYSIS-TRADES.md` §7.

| | | |
|---|---|---|
| **F0** | Housekeeping | Schema, enums, `FEATURE_YARD`, this file, new seed, `npm run check` |
| **F1** | The board | Columns, cards, jot, sort, waiting reasons — **the wedge** |
| **F2** | Boat file | History, equipment ages, owner page, printable work + rig record |
| **F3** | Estimates and variations | Send, accept by link or by phone, the dot on the card |
| **F4** | Waiting on other people | Part orders, visits, postponement, flashing cards |
| **F5** | Reminders | Nightly computation, "due this month", batch send — **the pitch** |
| **F6** | Invoices | Numbering, VAT-conditional, pay link, chasing, CSV |
| **F7** | Print | Job sheet, printable board |
| **F8** | Marketing page | Rewritten for tradespeople. **No price until the founder sets one** |

## 5. Carry these through

- `export const dynamic = 'force-dynamic'` on the board and every `/admin/*`
  page. The production build once prerendered `/admin`'s redirect and would
  have sent every visitor to the deploy date forever — verify in the browser,
  not by reading.
- All London/UTC conversion goes through `src/lib/time.ts`. **Nothing else may
  import `date-fns-tz`.** BST ends 25 October; Vercel runs UTC; a UK laptop
  does not.
- Money is `Int` pence. No `Decimal`, no floats. `qty` is the only Float and it
  is not money.
- `npm run seed` then `npm run check` before any demo. Re-seed **minutes**
  before showing it, not the night before.
- The dev server holds the Prisma query-engine DLL — kill it before
  `prisma generate` or `npm run build`, or you get an opaque EPERM rename error.
- `prisma db push --force-reset` is blocked for AI agents without explicit
  consent. `npm run seed` clears every table itself and is enough unless the
  schema changed.
- A `*/` inside a CSS comment closes it early and takes the whole stylesheet
  down.

## 6. The payments seam (handover contract)

`src/lib/payments.ts` is the only file that will ever know Stripe exists.

Under the trades product the seam is **repointed from deposits to invoices**:
there is no deposit by default. A tradesperson invoices on completion, and the
pay link on an invoice is the one place money moves.

Two behaviours documented in that file are demo-safe and production-unsafe
(bare-reference mark-paid; no `expiresAt` check). They are left for a payments
specialist on purpose. **Do not "finish" them unasked.**

## 7. Open questions — do not guess these

From `ANALYSIS-TRADES.md` §10, still open and still the founder's:

1. **Price.** Anchors: PayCamp £29/month solo, Tradify £34/user. A
   paper-and-memory user currently pays £0. **F8 ships with no price.**
2. Customer zero — which tradesperson sits through the three-minute demo first?
3. Do they already pay for anything, and what do they hate about it?
4. Are they VAT-registered?
5. Where does their job list actually live right now? Whatever they point at is
   what Jot has to beat.
