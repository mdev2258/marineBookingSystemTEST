# Analysis: retargeting at independent tidal yards

> **For Claude Code.** This supersedes the sailing-school assumptions still in `PLAN.md`
> and refines `DESIGN.md` and `YARD-OPS.md`. Read all three first, then reconcile this
> spec against the schema and components that actually exist. Where this document names
> a model or field, it describes the *concept*; map it onto what's already there rather
> than creating duplicates. Ask before any destructive migration.
>
> **First task before any feature work:** rewrite `PLAN.md` so it describes the yard app,
> not sessions and party sizes. Stale plans produce wrong code.

Research compiled September 2026. Sources at the end.

---

## 1. Who this is for

### Primary customer: the small independent tidal yard

Owner-run or employee-owned yards in Chichester Harbour and the eastern Solent with
roughly 1–15 staff, one crane or hoist, hard standing for tens of boats, and tenant trades
on site. Examples, all public businesses:

| Yard | Profile | How you book today |
|---|---|---|
| Emsworth Yacht Harbour | Employee-owned since 2024 (12 staff); 40T crane; basin behind a sill, access ~1.5–2h either side of HW; tenant engineers, electrician, rigger, shipwrights | Office, phone |
| Hayling Yacht Company | Family-run since 1935; half-tide, drying marina; approach ~±2.5h HW; works to British Marine terms | Phone (still lists a fax number) |
| Bosham Yacht Company | Tiny: 10-tonne crane on Bosham Quay; lifts and launches "on request"; DIY welcome | A mobile number on a 2018-era website. No online booking at all |
| Wilson's Boatyard, Hayling | Family-run, moorings, winter storage, lifting | Phone/email |
| Dell Quay Yacht Yard, Haines (Itchenor) | Small traditional yards | Phone |

**Not the target:** Premier (Chichester, Port Solent) and MDL (Northney) have their own
booking software. Thornham Marina and Northshore (Itchenor) now belong to the Trafalgar
Group — a regional operator, possibly a later customer, but not "independent".

### What these yards have in common
- Bookings arrive by **phone, walk-in and email**. Staff are on the hard, not at a desk.
- The **hoist diary is governed by the tide**, and they plan it in their heads or on a whiteboard.
- The work on boats is split between **the yard and tenant trades**.
- Office hours are **weekdays only** (Birdham Pool, a nearby comparable, is 9–5 Mon–Fri, closed weekends).
- They will not change how they work for software. Whatever we build has to fit around them.

### Secondary user: tenant trades (free, invited by the yard)
Sole-trader engineers, riggers, electricians and valeters on site. Many run on a mobile
number and a Gmail or BT address. Generic job apps already exist for them at roughly
£25–£44 per user per month (Tradify, ServiceM8, Jobber), and PayCamp Yards has a £29 solo
engineer plan. **Don't sell to trades.** Let the yard invite them, free, to update status
on jobs *at that yard*. The yard pays; the trades make the yard's product more useful.

### Owners (end customers)
Never asked to create an account. Everything reaches them by email with single-use
tokens (already built — keep it).

---

## 2. Positioning

**"The front desk and hoist diary for small tidal yards."**

Not a yard management system. Competitors (PayCamp Yards, Harbour Assist, EliteMarinas,
Havenstar, Marina Master) already sell full systems. PayCamp in particular already offers
work orders, cradle/zone scheduling, email approvals for extra work, progressive invoicing
and Xero from £29/month. Its roots look inland (it tracks the Boat Safety Scheme and sits
inside a campsite and marina booking product).

What we do that a yard can say yes to without ripping anything out:
1. **Tide-aware lift diary** — bookable slots generated from tide predictions × working hours.
   *None of the competitor pages reviewed advertise this. Verify with a free trial of
   PayCamp before putting "only" on the marketing page.*
2. **Owner communications** — status, postponements and extra-work approvals, sent automatically.
3. **Trades on the same page** — tenant trades update their part of a job via a link.

We are **not** the invoicing system, the accounts package, the parts inventory, or
the timesheet. Yards keep Sage/Xero/paper for that.

---

## 3. Design principles (hard rules)

1. **Office-first entry.** Every owner action must also be doable by staff on the owner's
   behalf. A phone booking takes under 30 seconds on one screen.
2. **"Approved by phone" is always an option.** Any owner approval can be recorded by staff
   with a note. The app records reality; it doesn't force owners online.
3. **Nothing needs the yard outside working hours.** Owner-facing messages send automatically.
   Yard-facing notifications are batched into a morning digest.
4. **Estimates, not quotes.** Non-binding, time and materials, emergent work expected.
   Wording throughout the UI must say "estimate".
5. **Tariffs are prices, not quotes.** Lift/launch/storage are auto-priced from boat length.
6. **Show ex-VAT lines, a VAT line, and the inc-VAT total largest.** Per-yard setting for
   whether tariffs are published inc or ex VAT.
7. **Printable everything.** Job sheets and the day's lift list print cleanly on A4 for
   people who will never log in.
8. **Keep the Industry design system from `DESIGN.md`.** `<Plate>`, square corners, steel ramp.

---

## 4. Domain model changes

Map these concepts onto the existing Prisma schema. Keep `PLAN.md`'s portability rules:
string unions not enums, integer pence, `db push`, no `Json` columns.

### Yard (extend the existing operator/yard row)
- `workingHours` — per weekday open/close, e.g. Mon–Fri 08:30–16:30, Sat/Sun closed.
  Store as one string column (e.g. `"1:0830-1630;2:0830-1630;..."`) parsed in `lib/hours.ts`.
- `tideStationId` — reference station for predictions.
- `accessBeforeHwMin`, `accessAfterHwMin` — asymmetric window. Emsworth ≈ 90–120 / 90–120;
  Birdham's lock runs 3h before to 4h after **Portsmouth** HW, so the reference station
  can differ from the yard's location.
- `minHwHeightCm` — optional; below this predicted HW height (neaps) the window is unusable
  for deep-draft boats. Phase 2.
- `movementDurationMin` — default 45; how long one lift or launch occupies the hoist.
- `allowOutOfHours` + `outOfHoursSurchargePercent` — published examples double the rate at
  weekends or add a flat surcharge.
- `shortNoticeWorkingDays` + `shortNoticeFeePence` — e.g. 5 working days / £95 (Premier's
  published rule; make it configurable, default off).
- `sameDayPremiumPercent` — e.g. 50.
- `tariffsIncludeVat` — boolean.

### Boat (existing boat file)
Add or confirm: `loaCm`, `beamCm`, `draftCm`, `keelType` (`fin | bilge | long | lifting | multihull`),
`weightKg`, `location` (`afloat | ashore | away`), `intendedLaunchDate?`.
Intended launch date matters: yards park boats ashore in launch order so nobody is blocked in.

### Tariff (new)
`serviceCode` (`lift | launch | lift_hold_launch | wash | block_off | storage_day | storage_week | mast_unstep | mast_step`),
`minLoaCm`, `maxLoaCm`, `unit` (`per_metre | per_foot | flat | per_metre_per_day | per_metre_per_week`),
`pricePence`, `season` (`all | offpeak | peak`), `vatRateBps`.
Seed from realistic Solent numbers (see §9).

### Movement (new, or repoint the existing slot/session concept)
A single hoist operation. `boatId`, `type` (`lift | launch | lift_hold_launch | move_ashore`),
`startsAt`, `endsAt`, `status` (`requested | confirmed | done | postponed | cancelled`),
`tideWindowId?`, `outOfHours` boolean, `shortNotice` boolean, `pricedPence` (snapshot),
`requestedVia` (`phone | walk_in | email | online`), `notes?`.
Only water↔land movements need a tide window. `move_ashore` and mast work on the hard don't.

### Estimate + EstimateLine (rename/extend existing quote + line items)
Line `kind`: `tariff | labour | parts | subcontract`. Each line: `description`, `qty`,
`unitPricePence` (ex VAT), `vatRateBps`, `carriedOutBy` (`yard` or a Contractor id).
Estimate status: `draft | sent | accepted | declined | superseded`.
`acceptedVia`: `link | phone | in_person | email` + `acceptedNote?`.

### Variation (new — the most important model)
Extra work found mid-job. `jobId`, `description`, `estimatePence`, `raisedBy`
(yard staff or contractor), `status` (`awaiting_owner | approved | declined | withdrawn`),
`decidedVia` (`link | phone | in_person`), `decidedAt`, `decisionNote?`, `token` (single-use),
`reminderSentAt?`.

### Contractor (new)
`name`, `trade`, `phone`, `email`, `publicLiabilityExpiresOn?`, `active`.
Yards require evidence of public liability insurance before letting contractors on site —
warn at 30 days and on expiry. Contractor access is by per-job token link, no account.

### Account position (derived, not an invoice system)
For each boat: tariffs charged, estimate lines completed, payments recorded, balance.
**Launch gate:** booking or confirming a `launch` while balance > 0 shows a warning;
staff can override with a note (yards legally hold a lien, but they decide when to use it).

### Storage accrual (derived)
While `location = ashore`, accrue storage at the tariff rate per day or week. Show a running
total on the boat file and in the account position.

### Payments
Keep the Stripe seam from `PLAN.md` but narrow its use: **prepayment for tariff items**
(lift/launch/storage packages), which yards already take in advance. Labour stays
invoice-on-completion; a deposit is optional per estimate, default 0, intended only for
large refits.

---

## 5. Tide engine

### Interface
```ts
// src/lib/tides/types.ts
export type TideEvent = { type: 'HW' | 'LW'; at: Date; heightCm: number | null }
export interface TideSource {
  events(stationId: string, fromUtc: Date, toUtc: Date): Promise<TideEvent[]>
  readonly horizonDays: number
  readonly label: string            // shown in the UI footer
}
```

### Implementations
1. **`SyntheticTideSource` — for the demo.** Anchors on one known HW time and height for
   Chichester Harbour, steps forward ~12h25m per HW, and modulates height on a ~14.77-day
   spring/neap cycle. Good enough to look right; wrong by up to an hour. Every screen
   showing it must carry **"Demo tide data — not for navigation."** No network calls.
2. **`AdmiraltyTideSource` — for a real customer.** UKHO's UK Tidal API:
   - *Discovery* (free): HW/LW events about a week ahead. **Caching not permitted.**
     Not enough horizon for spring planning.
   - *Foundation* (£144/year inc VAT): current day + 13 days; caching permitted.
   - *Premium*: up to a year ahead, historical, 1-minute intervals.
   - Longer-range bulk data is also sold via ADMIRALTY Tidal Prediction Service (current + 2 years).
   - UKHO data needs a copyright licence for reproduction. **Flag this to the owner; don't
     ship it into production without one.** Station IDs: look them up via the API; the
     EasyTide URL for Chichester Harbour (Entrance) uses port ID `0068` — verify.

Select via env var `TIDE_SOURCE=synthetic|admiralty`.

### Slot generation (`src/lib/tides/slots.ts`)
For each day in range:
1. Get HW events (usually two per day).
2. For each HW, window `W = [HW - accessBeforeHwMin, HW + accessAfterHwMin]`.
3. Phase 2: drop `W` if `heightCm < minHwHeightCm` (or the boat's draft requires more).
4. `inHours = W ∩ workingHours(day)`. `outOfHours = W \ workingHours(day)` if allowed.
5. Cut each into `movementDurationMin` slots. Subtract confirmed movements.
6. Return slots tagged `in_hours | out_of_hours`, with the HW time and height attached.

Must handle: BST/GMT change (last Sunday in October — the demo season), windows spanning
midnight, days with one HW, and no in-hours window at all ("next in-hours window: Thursday
10:40–12:10").

### Acceptance tests (write these first)
- A HW at 06:10 with ±90 min access and 08:30 opening yields **zero** in-hours slots.
- A HW at 12:00 with ±90 min yields slots 10:30–13:30.
- Birdham-style asymmetric window (−180 / +240) produces a 7-hour window.
- 25 October 2026 (clocks go back) produces correct London local times.
- Two confirmed movements remove exactly their slots.

---

## 6. Features, in build order

Each has acceptance criteria. Build and demo each before starting the next.

### F0 — Update `PLAN.md` and reconcile schema
- `PLAN.md` describes this product. Sessions, party size and sailing-school seed are gone.
- Schema has the concepts in §4, mapped onto existing tables where possible.

### F1 — Tide-aware lift diary (`/admin/diary`)
The screen we lead the sales demo with.
- Week view (mobile: day view with swipe-free prev/next, per `PLAN.md` pontoon rules).
- Each day shows HW times and heights, shaded tide windows, in-hours slots, booked movements.
- Out-of-hours slots visually distinct and labelled with the surcharge.
- "Next in-hours window" shown on days that have none.
- **Accept:** the §5 tests pass; the seeded week shows at least one day with no in-hours window.

### F2 — Quick booking for phone calls
- One screen: search owner by name/phone/boat name, or create inline; pick movement type;
  tap a slot; save. Price auto-calculated from tariff × LOA, with short-notice and
  out-of-hours adjustments shown.
- `requestedVia` defaults to `phone`.
- Asks for `intendedLaunchDate` when booking a lift-out.
- Sends the owner a confirmation email with the slot, HW time, and a reminder that times
  can move with weather.
- **Accept:** a new owner + boat + lift booked in under 30 seconds by someone who has seen it once.

### F3 — Postpone a movement
Repoint the existing cancel/rebook machinery.
- Reasons: `wind | tide | hoist_fault | yard_delay | owner_request | other` + free note.
- Emails the owner **and any contractors** with work on that boat that week.
- Owner link offers the next tide-valid slots of the same type; staff can rebook for them.
- Result screen: "Owner notified. 2 contractors notified."
- **Accept:** the forum scenario — lift slips, owner's engineer turns up to nothing — cannot
  happen silently.

### F4 — Variations (extra-work approvals)
- Staff or an invited contractor raises a variation on a live job: what was found, what it
  costs (estimate), optional urgency.
- Owner gets an email with Approve / Decline buttons (single-use token).
- Staff can record "approved by phone" with a note at any point.
- Unanswered after 24 working hours → one reminder; then it appears in the morning digest.
- Every decision is timestamped with how it was made. This is the evidence trail yards
  currently don't have.
- **Accept:** a variation raised, approved via link, and the job timeline shows who
  approved what, when, and how.

### F5 — Boat file and owner status page
Extend the existing 2a/2c screens.
- Where the boat is (afloat/ashore), next movement, intended launch date.
- Estimate lines with status and who's doing them (yard or named contractor).
- Running storage cost; account position; launch gate warning.
- Owner-facing version via token: same information minus internal notes. Kills the
  "any update on my boat?" phone call.

### F6 — Contractors
- Yard adds contractors; insurance expiry warnings at 30 days and on expiry.
- Contractor receives a per-job link: mark their lines started/done, raise a variation.
- **Accept:** a contractor with expired insurance shows a red warning wherever they're assigned.

### F7 — Morning digest
- 07:30 London time, weekdays only, to the yard's office email.
- Today's movements with HW times; variations awaiting owners; launches this week with
  balances outstanding; contractor insurance expiring.
- Admin button to send it now (same function, as with reminders in `PLAN.md`).

### F8 — Print views
- `/admin/diary/print?date=` — the day's lift list on one A4 page.
- `/admin/jobs/[id]/print` — job sheet with lines, contractors, variations and a signature box.
- Print CSS only; no PDF library.

### F9 — Marketing page (`/`)
Rewrite for independent tidal yards. Plain, per `DESIGN.md`. Lead with the tide diary,
then owner messages, then approvals. Pricing placeholder: one-off setup + monthly.
Do not claim uniqueness on tides until verified (see §2).

### Explicitly out of scope
Invoicing as system of record · Xero/Sage sync · parts inventory · timesheets/payroll ·
photo uploads · berth/mooring management · multi-yard · owner accounts/logins ·
card payments for labour · SMS (email only for now).

---

## 7. Seed data (replace the sailing-school seed)

**Season:** October, relative to "now" at seed time (keep `PLAN.md`'s rule: never hardcode dates).
**Yard:** "Harbourside Marine" (fictional), Chichester Harbour, tidal, sill access
−120/+120 min, hours Mon–Fri 08:30–16:30, Sat 09:00–12:00 out-of-hours allowed at +100%.
**Tide source:** synthetic.

- ~35 boats, realistic for the harbour: Westerly, Sadler, Moody, Contessa, Hunter, Jeanneau,
  Beneteau, Dehler, a couple of motor cruisers. LOA 7–11.5m. Mix of fin, bilge and one
  lifting keel. ~20 already ashore, the rest afloat.
- Lift-outs clustered over the next three weeks, including at least one day where the tide
  window falls entirely outside hours.
- Six launches already booked for March–April next year, parked in launch order.
- One lift **postponed for wind** yesterday, with owner and one contractor notified and
  the owner rebooked.
- One variation awaiting the owner (found: seized seacock, estimate £180 ex VAT); one
  approved by link; one "approved by phone" with a note.
- Four contractors: marine engineer, rigger, electrician, valeter. One with insurance
  expiring in 10 days.
- One boat with a launch booked next week and an outstanding balance (gate warning).
- Storage accruing on every ashore boat.
- Tariffs (ex VAT, per metre LOA, illustrative Solent-level figures):
  lift + wash + block off £40, launch £30, lift-hold-launch (1 hr) £35,
  storage £1.60/m/day, mast unstep or step £120 flat up to 12m.
  Labour: skilled £72/h, semi-skilled £55/h, apprentice £38/h.
- Owners all `@example.com`, as in `PLAN.md`.

---

## 8. The five-minute demo this must support

Built for a yard manager standing in their office.

1. **Morning digest** on a phone: today's lifts with HW times, one variation waiting, one
   launch with money outstanding.
2. **Diary**: this week's tide windows. Point at the day where the window is at 06:40 —
   "the app already knows you can't lift that in hours."
3. **Phone booking**: book a lift-out live in under 30 seconds.
4. **Postpone**: "Force 7 tomorrow" → owner and engineer notified, owner offered new slots.
5. **Variation**: raise one, approve it on a second phone. Show the timeline.
6. **Boat file**: storage running cost and the launch gate.

If a screen doesn't serve this script, it isn't needed yet.

---

## 9. Numbers used above and where they came from

- Labour: Berthon (Lymington) 2026 grades run £32–£85/h ex VAT; skilled £78/h.
- Lifting: Premier Chichester from 1 Sept 2026 charges per metre LOA in bands; Berthon per foot.
- Storage: Berthon 36p per foot per day open-air, charged whether or not work is in progress.
- Short-notice £95 under 5 working days; same-day +50%; out-of-hours surcharge: Premier Chichester.
- Weekend lifting +100%: Crab Marsh Boat Yard.
- Seed figures in §7 are rounded, illustrative, and deliberately a little below big-group rates
  for a small independent. Replace with the first real customer's tariff.

---

## 10. Open questions for Max (not for Claude Code to guess)

1. Real working hours and access windows for Emsworth Yacht Harbour and Hayling Yacht Co.
2. Does PayCamp Yards generate slots from tide predictions? (14-day free trial will answer it.)
3. Tide data licence route for a paying customer: Foundation (13 days) or Premium (1 year)?
4. Price point. Previous plan was setup from £600 + £40/month; PayCamp starts at £29/month.
5. Which yard is customer zero, and who there would sit through the §8 demo.

---

## Sources

- Emsworth Yacht Harbour — tenant businesses page; TYHA listing; eOceanic harbour guide; 2024 employee-ownership coverage (Marine & Maritime)
- Hayling Yacht Company — homepage; eOceanic; harbourguides.com listing
- Bosham Yacht Company — homepage
- Birdham Pool Marina (Aquavista) — office hours and lock times
- Thornham Marina — on-site services; Northshore Boatyard — Lift & Launch page (Trafalgar Group)
- Premier Marinas — Chichester boatyard charges from 1 Sept 2026
- Berthon Boat Co — Terms of Business (Oct 2025); Boatyard Rates (Apr 2026)
- Crab Marsh Boat Yard; South Dock Marina — published hours
- PayCamp Yards (boatyardmanager.co.uk); PayCamp; marinayardmanager.co.uk guide; Harbour Assist; EliteMarinas; PierVantage
- UKHO / ADMIRALTY — UK Tidal API tiers (customer portal KB), developer FAQs, EasyTide, Tidal Prediction Service
- DashLink, HeyBRB — Tradify / ServiceM8 / Jobber UK pricing 2026
- YBW forums — lift-date dispute; boat blocked in ashore
- See also `YARD-OPS.md` for the operational research behind this spec
