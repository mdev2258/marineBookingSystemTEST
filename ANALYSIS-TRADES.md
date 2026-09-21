# Analysis: the app is for the marine tradesperson, not the yard

> **For Claude Code.** This **supersedes `ANALYSIS-INDEPENDENTS.md`** and changes the direction
> set in `DESIGN.md`. The customer is no longer a marina or boatyard. It is the individual
> shipwright, rigger, marine engineer or marine electrician — a one-to-five person business
> with no real system: jobs live in their head, on scraps of paper and sticky notes, and in
> their phone's texts. ("Whiteboard" in earlier notes was shorthand for *unorganised*, not a
> literal whiteboard. Don't design around one.)
>
> Read `PLAN.md`, `DESIGN.md`, `YARD-OPS.md` and this file. Then:
> 1. **Rewrite `PLAN.md`** to describe this product. It still describes a sailing school.
> 2. **Park, don't delete,** the marina-specific pieces (see §5). Remove them from navigation
>    and the seed. Ask before dropping any table.
> 3. Map the concepts in §6 onto the schema that exists. Don't create duplicates.
>
> Research compiled September 2026. Sources at the end.

---

## 1. Who the customer is

### The person
A sole trader or small firm in the marine trades around Chichester Harbour and the Solent:
shipwrights, riggers, marine diesel engineers, outboard specialists, marine electricians,
valeters and polishers.

Emsworth Yacht Harbour alone lists tenant businesses covering marine electrical engineering,
traditional shipwrights, a rigger reachable on a personal BT email address, marine diesel
engineers, and a boat maintenance firm. Thornham Marina's on-site list includes an outboard
specialist on a Gmail address and a mobile marine engineer covering the whole harbour.
**These are the customers.** They are walkable from where the founder sails.

### How they work today (inference from the research plus trade knowledge — confirm in interviews)
- **There is no system.** The job list lives in their head, on scrap paper, sticky notes, the
  back of a receipt, and a scroll of texts. Some have a whiteboard; most don't. Things get
  forgotten, quoted twice, or done and never invoiced.
- **The phone is the office.** Bookings, approvals and updates happen by call, text and WhatsApp.
- **Estimates and invoices** are Word templates, a notebook, or Xero if they're organised.
- **Their "office" is an engine bay or the top of a mast.** Dirty hands, one free thumb, bright sun.

### What makes marine different from a plumber (this is the whole product)
1. **The asset is the boat, not an address.** And the boat moves: hard standing at one yard in
   winter, a pontoon in summer, a swinging mooring, sometimes a different yard entirely.
2. **The owner is usually somewhere else.** Owners live inland and visit at weekends.
   Every approval and update is remote.
3. **Work depends on other people's schedules.** A rigger can't unstep a mast until the yard's
   crane is booked. An engineer can't change a cutless bearing until the boat is lifted.
   Afloat work on a drying mooring depends on the tide. Paint and GRP depend on the weather.
4. **Records matter for years.** Insurers and surveyors care about the age of standing rigging.
   Many policies want replacement or a professional inspection somewhere in the 10–15 year
   range, and most insurers want dated receipts as proof. The rigger who holds those records
   holds the next job.
5. **The work is seasonal and repeats.** Winterisation in autumn, commissioning in spring,
   annual engine services, antifoul every year, rigging every decade. A reminder is a sale.

---

## 2. Competition — read this before building

- **PayCamp Yard Manager** already sells a **£29/month solo plan** aimed squarely at one-person
  marine workshops: quotes, jobs and invoices, job photos and customer sign-off, parts and
  labour tracking. Recurring service reminders come on the £79 plan. Its own marketing tells
  solo marine engineers that full marina software is overkill. **This is the direct competitor.**
- **Generic trade apps** — Tradify from £34 per user per month (quoting, scheduling, invoicing,
  Xero); ServiceM8 from around £25/month; Jobber priced in dollars. Mature, cheap, not marine.

### Why build anyway — the wedge
The founder's premise: these trades are still unorganised *despite* those tools existing.
So the problem isn't missing features. **It's that office software demands structured data
entry, and a scrap of paper doesn't.** Anything slower than scribbling a note gets abandoned
by Wednesday. Our bet:

> **Capture first, organise later.** Getting a job out of their head must be quicker than
> writing it on the back of their hand — one line, no required fields. The board is where
> those captures get sorted, and everything else (owner updates, approvals, reminders,
> invoices) grows out of moving cards on it.

Plus the marine-specific pieces generic apps don't have: boat-first records, boats that
move between places, "waiting on the yard" as a first-class state, remote owners, and
reminders that generate repeat work from rig and engine history.

**Do not try to match PayCamp's feature list.** If a feature doesn't make the board faster or
turn into paid work, it's out.

---

## 3. Design principles (hard rules)

1. **Ten seconds to add a job.** Boat, what, where. Everything else optional and later.
2. **One thumb.** Every primary action reachable one-handed on a 390px phone. 48px targets.
   No drag required — tap to move a card, drag as a bonus on desktop.
3. **Capture beats completeness.** A job can exist as one line of free text with no boat, no
   owner and no place. The app nudges them to fill gaps later; it never blocks saving.
4. **The owner never logs in.** Single-use token links by email (already built — keep).
5. **"Agreed by phone" is always an option.** Any owner approval can be recorded by the trade
   with a note. The app records what happened; it doesn't force the owner online.
6. **Estimates, not quotes.** Non-binding, time and materials, extra work expected.
7. **VAT is optional.** Many sole traders are not VAT-registered. A business-level setting
   turns VAT lines on or off. If off, prices are plain totals with no VAT wording at all.
   (The UK registration threshold was raised to £90,000 in April 2024 — verify the current figure.)
8. **Not an accounts package.** Simple numbered invoices and a CSV export. No Xero sync yet.
9. **Keep the Industry design system** from `DESIGN.md` for the app. Board/TV mode is the
   one place large type and dark ground override it.

---

## 4. The board

One screen that holds everything currently in their head and on bits of paper. First screen
after login, on every device.

### Columns (fixed for v1)
| Column | Meaning |
|---|---|
| **Jotted** | Raw captures — a line of text, a pasted message. Not yet a proper job. Sort when there's time. |
| **Enquiry** | Someone asked. Nothing agreed. |
| **Estimate sent** | Waiting for the owner to say yes. |
| **Booked** | Agreed, not started. Shows the planned date if any. |
| **Waiting** | Blocked. Every card here **must** carry a reason (below). |
| **On it** | In progress. |
| **Done — to invoice** | Work finished, not billed. |
| **Invoiced** | Sent, unpaid. Shows days outstanding. |

Paid jobs drop off the board into the boat's history.

### Waiting reasons (the coloured magnets)
`yard_lift` · `crane` · `parts` · `owner_decision` · `weather` · `tide` · `access` (keys, boat locked) · `other`.
Each reason can carry a date ("crane booked Thu 16th", "parts ETA 22nd"). When the date
passes, the card flashes in the Waiting column so nothing rots there.

### A card shows, and only shows
Boat name (large) · one-line job · place (short: "EYH hard", "Bosham mooring") · waiting
reason + date if waiting · £ if invoiced and unpaid · a dot if a variation awaits the owner.

### Modes
- **Phone**: one column at a time with column tabs across the top; tap card → detail sheet.
- **Desktop**: all columns side by side.
- **Wall screen** (later, optional): read-only big-type view via a signed token, for anyone
  who does have a workshop. Not v1.

---

## 5. What to keep, repoint or park from the current build

| Existing piece | Decision |
|---|---|
| Boat file (2a) | **Keep and extend** — now the heart of the records. |
| Estimates with line items (2b) | **Keep.** Rename "quote" to "estimate" everywhere. |
| Live job + timeline (2c) | **Keep.** Timeline becomes the job's history on the board card. |
| Variations / extra-work approvals | **Keep and build first** after the board (§7 F3). |
| Owner token pages + `EmailLog` | **Keep.** |
| Cancel/rebook machinery | **Repoint** to "visit postponed" — notify owner, offer a new date. |
| Stripe payment seam | **Repoint** to paying an invoice via link. No deposits by default. |
| Print views | **Keep** — job sheet and a printable board. |
| Tide engine / hoist diary | **Park.** Maybe later as "when can I reach a drying mooring". |
| Tariffs by LOA, storage accrual, launch gate | **Park.** Marina concerns. |
| Yard working hours, short-notice fees, contractors-invited-by-yard, morning digest to a yard office | **Park.** |
| Marketing page aimed at yards | **Rewrite** (§7 F8). |

"Park" = out of nav, out of seed, code left intact behind a `FEATURE_YARD=false` flag.

---

## 6. Domain model

Portability rules from `PLAN.md` still apply: string unions not enums, integer pence, `db push`, no `Json`.

**Business** (the trade — replaces the operator/yard row)
`name`, `tradeTypes` (e.g. `"rigging,engineering"`), `ownerName`, `phone`, `email`,
`vatRegistered` boolean, `vatNumber?`, `defaultLabourRatePence`, `invoicePrefix`, `nextInvoiceNumber`,
`paymentTermsDays` (default 14), `bankDetailsText?` (shown on invoices, free text — **never** store card data).

**User** — owner of the business + optional helpers. Keep the existing single-login approach,
extended to a small list of users with the same permissions. No roles in v1.

**Customer** (the boat owner) — `name`, `email`, `phone?`, `notes?`.

**Boat** — `name`, `customerId`, `make`, `model`, `year?`, `loaCm?`, `keelType?`,
`currentPlaceId?`, `notes?`.

**Place** — where boats live. `name` ("Emsworth Yacht Harbour"), `shortName` ("EYH"),
`kind` (`yard | marina | mooring | drying_mooring | trailer | other`), `notes?`
(e.g. "keys from office", "hot works permit needed"). Boats move between places; record
moves in the boat's history.

**Equipment** (per boat — the records that make repeat work)
`boatId`, `kind` (`engine | outboard | standing_rigging | running_rigging | furler | sail | seacock | gas | electrics | other`),
`make?`, `model?`, `serial?`, `installedOn?` (date), `hours?`, `hoursRecordedOn?`,
`serviceIntervalMonths?`, `serviceIntervalHours?`, `lastServicedOn?`, `notes?`.

**Job** — `boatId`, `title`, `column` (the §4 list), `waitingReason?`, `waitingUntil?`,
`plannedOn?`, `placeId?` (where the work happens — may differ from where the boat usually is),
`position` (ordering within a column), timestamps per column transition.

**EstimateLine** — `jobId`, `kind` (`labour | parts | subcontract | other`), `description`,
`qty`, `unitPricePence`, `vatRateBps` (ignored if not VAT-registered), `done` boolean.

**Estimate** — `jobId`, `status` (`draft | sent | accepted | declined | superseded`),
`sentAt?`, `decidedAt?`, `decidedVia` (`link | phone | in_person | text`), `decisionNote?`, `token?`.

**Variation** — `jobId`, `description`, `estimatePence`, `status`
(`awaiting_owner | approved | declined | withdrawn`), `decidedVia`, `decidedAt?`,
`decisionNote?`, `token?`, `reminderSentAt?`. Creating one puts a dot on the card.

**PartOrder** — `jobId`, `item`, `supplier?`, `orderedOn?`, `etaOn?`, `arrivedOn?`, `costPence?`.
Arrival of the last outstanding part prompts "move out of Waiting?".

**Visit** — `jobId`, `startsAt`, `endsAt?`, `placeId`, `status` (`planned | done | postponed`),
`postponeReason?`. Postponing emails the owner (repointed cancel machinery).

**Invoice** — `jobId`, `number` (prefix + sequence, never reused), `issuedOn`, `dueOn`,
lines snapshotted from EstimateLines + approved Variations, `totalPence`, `vatPence`,
`status` (`draft | sent | paid | void`), `paidOn?`, `paidVia` (`link | bank | cash | card_machine`),
`stripeCheckoutSessionId?`.

**WorkRecord** (derived + printable) — for any completed job: boat, date, what was done,
equipment touched, parts fitted. **This is the "dated receipt" insurers want.** For riggers,
a "Rig record" variant lists each stay/shroud replaced with date.

**Reminder** — `boatId`, `equipmentId?`, `kind` (`service_due | rig_age | antifoul | winterise | commission | custom`),
`dueOn`, `status` (`upcoming | sent | booked | dismissed`), `sentAt?`, `token?`.

---

## 7. Features, in build order

Build and demo each before starting the next.

### F0 — Housekeeping
- `PLAN.md` rewritten for this product. `FEATURE_YARD` flag added; yard screens hidden.
- New seed (§8) replaces the yard seed.

### F1 — The board
- §4 in full: columns, cards, waiting reasons with dates, phone/desktop/TV modes.
- **Jot**: a single text box, always one tap away (floating button on every screen). Type or
  paste anything — "Westerly at Bosham, owner wants furler looked at", or a whole text from an
  owner. Saves instantly into Jotted. No other fields.
- **Sort a jot**: turn it into a job by picking boat (typeahead; unknown name creates a boat),
  place, and column. The original text is kept on the job.
- **Quick add** for when they know the details: boat, what, where. Lands in Enquiry.
- Tap card → detail sheet with "Move to…" buttons. Moving to Waiting requires a reason.
- **Accept:** a jot saved in under 5 seconds from the lock-screen-to-app path; a jot sorted
  into a job in under 15; a card moved to Waiting cannot be saved without a reason; nothing
  else in the app ever blocks a save for a missing field.

### F2 — Boat file and history
- Everything ever done to this boat, newest first. Equipment list with ages ("standing
  rigging: 11 years"). Where the boat is now and where it's been.
- Owner-facing token page: current jobs with column shown as plain English
  ("Waiting for parts — expected Tue 22nd"), completed work records. No prices unless
  an estimate/invoice was sent.
- Printable WorkRecord and Rig record.
- **Accept:** from a card, two taps to the boat's full history; a work record prints on one A4 page.

### F3 — Estimates and variations
- Build an estimate from lines; send by email with Accept / Decline (token); or mark
  "agreed by phone" with a note. Accepting moves the card to Booked.
- Raise a variation from a card in three fields (what, why, £). Owner approves by link;
  unanswered after 24 hours sends one reminder. "Agreed by phone" always available.
- Timeline shows who agreed what, when, and how.
- **Accept:** a variation raised on one phone and approved on another updates the card within a refresh.

### F4 — Waiting on other people
- Part orders with ETAs; visits with places and dates.
- Postponing a visit emails the owner the reason and a new date (or "we'll be in touch").
- Waiting cards past their date flash.
- **Accept:** set "waiting: crane, Thu 16th" — on Friday 17th the card flashes.

### F5 — Reminders that find work (the sales pitch)
- Nightly job computes due reminders from Equipment:
  standing rigging ≥ 10 years old → `rig_age`; engine past interval (months or hours) → `service_due`;
  every sailing boat in September → `winterise`; every boat in February → `commission`.
- "Due this month" screen: tick boats, one button sends each owner a short email with
  **"Yes, book me in"** → creates an Enquiry card on the board with the reminder attached.
- **Accept:** seed shows at least eight boats due; sending the batch and clicking one owner's
  link creates an Enquiry card.

### F6 — Invoices and getting paid
- From Done: generate an invoice from completed lines + approved variations. Sequential
  number. VAT only if registered. Email with a Stripe pay link (existing payments seam)
  plus bank details text. Mark paid manually for bank/cash.
- Invoiced cards show days outstanding; one reminder email at due date, one at +7 days.
- CSV export of invoices for the accountant.
- **Accept:** invoice numbers are never reused, even after a void.

### F7 — Print
- Job sheet (lines, parts, variations, signature box). Printable board (landscape A4 / A3).
- Print CSS only.

### F8 — Marketing page (`/`)
Rewrite for tradespeople, per `DESIGN.md` style. Lead with the board, then "the owner
gets updates without you picking up the phone", then reminders that find work. Dry, plain.
Suggested headline direction: *"For the jobs currently written on the back of your hand."*
Pricing placeholder only; do not publish a price until the founder decides (§10).

### Explicitly out of scope
Marina/berth/mooring management · hoist diaries · storage billing · tariffs · staff roles and
rotas · timesheets and payroll · parts inventory beyond per-job orders · accounting sync ·
SMS/WhatsApp sending · photo uploads · customer logins.

### Later, maybe
Tide windows for drying moorings (the parked engine) · photo evidence · Xero export ·
SMS · sharing a card with the yard ("needs lift Thursday").

---

## 8. Seed data (replace the yard seed)

Everything relative to "now" in Europe/London; never hardcoded dates. Owners `@example.com`.

**Business:** a two-person rigging-and-engineering firm, placeholder name
"Harbourside Marine Services" (founder to confirm), not VAT-registered, labour £55/h,
invoice prefix `HMS-`.

**Places (fictional but realistic):** "Harbour yard (hard)", "Harbour yard (pontoons)",
"Bosham mooring", "Hayling half-tide", "Itchenor drying mooring", "Workshop".

**~25 boats**, 1970s–2000s production yachts typical of the harbour (Westerly, Sadler, Moody,
Contessa, Hunter, Beneteau, Jeanneau, Dehler) plus two motor boats. Mixed equipment ages so
reminders fire: at least four with standing rigging 10+ years old, five engines past service.

**~18 live jobs across every column**, including:
- One boat carrying a realistic post-survey list, modelled on a real 2026 pre-purchase survey
  of a 1992 30ft twin lifting-keel yacht: replace keel bolts; service leaking keel hydraulic
  rams and pump; rudder bearings worn; cutless bearing worn; dripless shaft seal due;
  galley seacock corroding; alternator not charging; rigging inspection requested. Spread it
  across several cards and columns — it shows how one boat fills a board.
- Waiting cards of every reason, one past its date (flashing).
- One variation awaiting the owner (seized seacock found, £140); one approved by link; one agreed by phone.
- One postponed visit (weather) with the owner notified.
- Three invoices: one paid, one sent 5 days ago, one 19 days overdue.
- Eight reminders due this month.

---

## 9. The three-minute demo (phone in hand, in their workshop)

1. Ask what's on their mind this week. Jot three of them in front of them, as fast as they say them.
2. Sort one into a proper job. "That's the bit of paper you won't lose."
3. Move a card to Waiting → crane, Thursday. "On Friday it'll nag you."
4. Raise a variation; approve it on a second phone. "That's the argument you won't have in March."
5. Open a boat's history and print a rig record. "That's what their insurer asks for."
6. Send the reminders batch. "Eight owners just got asked if they want booking in. That's work you didn't chase."

If a screen doesn't serve this script, it isn't needed yet.

---

## 10. Open questions for the founder (Claude Code: don't guess these)

1. **Price.** The anchors are PayCamp's £29/month solo plan and Tradify's £34 per user. A
   paper-and-memory user currently pays £0. Options: free up to N boats, a low flat fee, or setup + monthly.
2. **Customer zero.** Which one tradesperson sits through §9 first?
3. Do they already pay for anything (Xero, Tradify, PayCamp)? If so, what do they hate about it?
4. Are they VAT-registered?
5. Where does their job list actually live right now — head, paper, texts, WhatsApp? Ask them to
   show you. Whatever they point at is what Jot has to beat.

---

## Sources

- Emsworth Yacht Harbour — tenant businesses page
- Thornham Marina — on-site services page
- PayCamp — pricing page (Yard Manager plans) and solo marine engineer comparison post
- DashLink, HeyBRB, Made For Builders — Tradify / ServiceM8 / Jobber UK pricing, 2026
- YBW forums — insurers and standing rigging age; insurers requiring dated receipts
- Noonsite; Topsail Insurance; Marine Survey Associates — rigging replacement and insurance
- Berthon Boat Co — Terms of Business (contractor insurance requirements), for context
- `YARD-OPS.md` and `ANALYSIS-INDEPENDENTS.md` — earlier research, now background only
