# How a yard actually runs — and what that means for this app

Research notes for the Harbourside Marine demo. Read alongside `PLAN.md` and `DESIGN.md`.
Compiled September 2026 from published yard tariffs, terms of business, harbour guides and owner forums.
Sources at the bottom. Where something is inferred rather than published, it says so.

---

## 0. The short version

1. **"The yard" is usually two businesses.** The marina/yard operator owns the hoist, the hard standing and the storage. The actual work (engines, rigging, shipwright, valeting) is often done by independent *tenant trades* renting units on site. The app currently assumes one entity does both.
2. **Yards sell two different kinds of thing, priced differently.**
   - *Movements and storage* (lift, wash, block off, launch, storage ashore) — a fixed **tariff by boat length**, usually **paid in advance**. Nobody "quotes" these.
   - *Labour work* — a **non-binding estimate**, billed on **time and materials**, invoiced on completion, and paid **before the boat leaves** (the yard holds a lien).
3. **50% deposit on every job is wrong.** Published terms show deposits only on **large refits**, with stage payments after. Everything else is due on invoice or before launch.
4. **The hoist diary is the heart of the yard**, and at tidal yards (most of Chichester Harbour) usable slots = *working hours ∩ tide window*. That window moves every day.
5. **Extra work found mid-job ("emergent work") is where the fights happen.** DESIGN.md cut owner approvals for variations. That is the single most valuable feature to put back.
6. **This market already has software.** PayCamp Yards sells work orders, haul-out scheduling, digital approvals and progressive invoicing to UK yards from £29/month. See §7 — it changes the strategy.

---

## 1. Who you're actually selling to

| Layer | What they do | How they book today | Realistic customer? |
|---|---|---|---|
| **Big group marinas** (Premier, MDL) | Hoist, storage, berths | Own online quote/booking tools and apps | **No.** They already have software and a head office buying it. |
| **Independent yards** (Emsworth Yacht Harbour, Hayling Yacht Co, Thornham, Bosham/Dell Quay area) | Hoist, storage, sometimes own shipwrights | Walk in, phone, email | **Yes — primary target.** Family-run, relationship-sold, tidal. |
| **Tenant trades** (engineers, riggers, valeters, shipwrights on site) | The actual labour | Phone, WhatsApp, word of mouth | **Maybe.** Cheap, fast to sell, but PayCamp has a £29 solo plan aimed exactly here. |

Evidence for the two-layer model:
- Emsworth Yacht Harbour describes a full-service boatyard whose shipwrights, outboard specialist and navigation school are separate businesses on site.
- Thornham Marina tells owners to book yard services by popping into the office, calling or emailing, and separately encourages them to use the tenant services on site.
- Premier's Chichester boatyard team works *alongside* onsite marine specialists rather than doing the work itself.
- South Dock Marina (London) states outright that it provides the space and lifting but no repair services — contractors in the yard do that.

**Implication:** a job on a boat usually involves the yard (lift, storage) *and* one or more trades. The app needs a notion of "who is doing this line of work" even if it's just a text field for now.

---

## 2. The yard calendar

| Period | What's happening | Load |
|---|---|---|
| **Sept – Nov** | Lift-outs for winter lay-up. Engine winterisation. Owners submit work lists. | Hoist heavy |
| **Dec – Feb** | Boats ashore. Labour-heavy: refits, osmosis, rigging, keel work. Short days, cold, glassfibre/paint limited by temperature. | Workshop heavy, hoist quiet |
| **Mar – May** | Spring commissioning and launches. Everyone wants the same fortnight. Antifoul, polish, rig. | **Peak.** Both hoist and labour saturated |
| **Jun – Aug** | Quick lift-hold-launch for scrubs, anodes, damage repairs. | Quiet — yards discount to fill it |

Published evidence:
- Premier Chichester splits its tariff into a winter off-peak (1 Oct – 31 Dec) and spring peak (1 Jan – 30 Apr) and adds a peak premium; it discounts July/August work to fill the quiet months.
- Yacht Havens' winter packages run six months (1 Oct – 31 Mar, or Nov–Apr) and bundle lift, wash, storage and launch.
- Premier advises booking winter storage ahead because lay-up demand is much higher.
- Premier's "Pit Stop" package lifts on a **Friday**, keeps the boat ashore ten days across two weekends, and launches on the **Monday** — a clue to how yards want DIY owners' time structured.

**Implication:** the demo seed should look like *October*, not like a sailing school's July. And the killer season for your product is **spring launch scheduling**, not autumn.

---

## 3. The working day

**Nothing published for Emsworth Yacht Harbour or Hayling Yacht Co's exact hours — ask them.** What published yards elsewhere show:

- Yard services (lifting, moving) run roughly **08:30–16:30, Monday–Friday**; outside that, and at weekends, lifting costs double (Crab Marsh).
- Crane operations **09:00–16:00 weekdays** only (South Dock).
- Noisy work permitted 08:00–18:00 weekdays, **Saturday until 14:00**, **nothing on Sunday** (South Dock).
- Premier surcharges any boatyard work outside office hours, charges **£95 for bookings or changes with under 5 working days' notice**, and **+50% for same-day/emergency** lifts.
- Hoist crews work part-time patterns with weekend flexibility required (boatfolk job ad).

**Tides — the local constraint that matters most:**
- Emsworth Yacht Harbour is behind a sill; access is roughly **1.5–2 hours either side of high water**.
- Hayling Yacht Company's approach channel is usable only about **±2.5 hours around HW**, and its marina dries.
- Northney is all-tide; Chichester Marina is through a lock.
- Tides cycle about every **12h25m**, so HW drifts ~50 minutes later each day. Across a fortnight the window moves through the entire working day and out of it again.

**Implication — this is your best feature idea:** at a tidal yard, the lift diary should *generate* bookable slots from tide predictions intersected with working hours. Half the days in a fortnight the good window falls before 08:30 or after 16:30 — the app should show that honestly and price it (out-of-hours surcharge) rather than pretend every day has 09:30 / 13:30 slots. (Inference, not published: I did not find a yard advertising this as automated. PayCamp's marketing names "the tide window" as a pain, so they know about it; check whether they solve it before claiming it as unique.)

**Physical packing (inference from owner forums):** boats ashore are parked in rows; a boat lifted early can be blocked in until spring. An owner who bought a boat ashore was told it couldn't go back in until April because two or three others would have to be moved. So yards care about **intended launch date at the moment of lift-out** — it decides where your boat is parked. Capture it at booking.

---

## 4. How work gets booked today

1. **Owner contacts the yard** — walk-in, phone or email. Web forms exist at bigger groups.
2. **Movements** (lift, wash, block off, storage, launch) are booked straight into the hoist diary at **tariff price by LOA**. No estimate needed.
3. **Labour** — owner sends a **work list** (often in autumn; a surveyor's report is a common trigger). Yard or trade gives an **estimate**.
4. Work proceeds. **Emergent work** gets found once things are opened up. Owner is phoned / WhatsApped for approval.
5. Invoice on completion. Boat released on payment.

Instructions don't only come from the owner: Berthon's terms accept work instructions from the owner's skipper, engineer, manager or surveyor unless told otherwise. Outside contractors need proof of public liability insurance before being allowed on site.

---

## 5. How money works

### Tariff items (lift / launch / storage)
- Priced **per metre or per foot of LOA**, in **length bands**, with a minimum length. (Premier Chichester: per metre, banded from 6.5m; Berthon: per foot, minimum 20ft.)
- Storage charged **per day or per week per unit length**, and runs **whether or not work is in progress** (Berthon states this explicitly). Delays cost the owner money — which is why slipped schedules cause disputes.
- Premier: all fees **payable in advance**; prices **include VAT**; card, bank transfer or direct debit, **no cash**.
- Berthon: prices **exclude VAT**. Both conventions exist.

### Labour
- **Time and materials** at an hourly rate by grade. Berthon 2026 rates run from £32/hr (1st-year apprentice) through £78 (skilled) to £85 (foreman), plus a £250 out-of-hours call-out — all ex VAT.
- **Estimates are not binding**, are based on a superficial look, exclude emergent work, and the yard may exceed them (Berthon terms 6.1–6.3).
- **Payment:** due on invoice, or before the boat leaves, whichever is earlier. **Large refits: 50% deposit then stage payments.** All other invoices due on presentation (Berthon 7.1–7.2). Yacht Havens: accounts net 7 days.
- **Lien:** the yard can keep the boat until paid, and storage keeps accruing while it does (Berthon 7.4–7.6). Owner forums confirm yards treat removing an unpaid boat very seriously.
- Many yards work to British Marine's standard terms of business (Hayling Yacht Co says so on its homepage).

### VAT (answers DESIGN.md open question 6)
Both conventions exist in the wild. Safe rule for the app: **store and show line items ex-VAT, show VAT as its own line, and show the inc-VAT total largest** — owners are consumers and will compare the number they actually pay. Make the yard's convention a setting.

---

## 6. What owners and yards complain about

From owner forums and a competitor's own list of pain points:
- **"Any update on my boat?"** — owners chase the office by phone because nobody can see job status.
- **Lift dates slipping without notice.** One owner booked a 14-day lift, the yard didn't lift on the date or tell him, his trades had to be rescheduled, the boat was out 28 days and the bill rose from £550 to £850.
- **Extra work approved verbally or on WhatsApp**, then disputed on the invoice.
- **Estimates written at the kitchen table at 9pm.**
- **Cash flow** on long refits with one invoice at the end.
- **Hoist, cradles and tide not lining up** in spring.
- **Boats blocked in** by others parked around them.

---

## 7. The competition (read this before building more)

- **PayCamp Yards** (boatyardmanager.co.uk, Towpath Digital Ltd) — UK boat yard software: work orders, cradle/zone scheduling, digital customer approvals for extra work, progressive invoicing, Xero, mobile, photos. **£29 / £79 / £99 / £199 per month.** Built by someone with 30 years in IT and 14 years living aboard. Their homepage lists almost exactly the pains in §6.
- **Harbour Assist** — marina software that also schedules lift, launch and storage ashore, raises worksheets, estimates and orders, and emails/SMS customers.
- **EliteMarinas**, **Successful Marine**, **Havenstar**, **Marina Master** — marina-group-scale systems.
- **Premier Marinas** — own online boatyard quote and booking request, plus the MyPremier app.

**What this means:** a full yard management system is a crowded market with a well-funded, experienced incumbent at the small-yard end. You will not win on feature count. Where you *can* win:

1. **Relationships in one harbour.** You can walk into Emsworth Yacht Harbour. PayCamp can't.
2. **Tidal scheduling done properly** — if (and only if) the incumbents don't already.
3. **A thin layer that doesn't replace anything** (see §8) — cheaper to say yes to than a whole system.

Honest alternative: treat this as the portfolio project and the paid automation work as the business. Both are fine outcomes; decide deliberately.

---

## 8. Design rule: don't change their working day

Everything above points to one principle — **sit on top of how the yard already works; don't replace it.**

| Their habit | What the app must do |
|---|---|
| Owners phone or walk in | Office can enter a booking for an owner in under 30 seconds. Owners are never forced online. |
| Paper job cards | Printable job sheet from any job. Engineers may never log in; the yard manager updates status. |
| Existing accounts package (Sage, Xero) | The app is **not** the invoice system of record. CSV export. Xero later, if ever. |
| Weekday 08:30–16:30 | Nothing requires yard action outside working hours. Owner notifications go out automatically; yard notifications are batched into a morning digest. |
| Estimates, not quotes | Call them estimates. Show that they're not binding. |
| Lien, pay before launch | Replace "50% deposit" with a **"balance must be paid before launch"** gate. Deposit optional, per job, default 0. |
| Tide governs the hoist | Slots generated from tide × hours. |

---

## 9. Gap analysis against the current codebase

| Current (PLAN / DESIGN) | Reality | Change |
|---|---|---|
| `PLAN.md` still describes sessions, party size, capacity, sailing school seed | DESIGN.md has moved to a yard with boats, quotes and jobs | **Update PLAN.md** — it's now misleading anyone (or any agent) reading it |
| Deposit 50% on the service, always | Deposit only on large refits; tariffs prepaid; labour paid on invoice/before launch | Deposit % per job, default 0; add "paid before launch" state |
| Everything goes through a quote | Movements are tariff-priced by LOA; only labour is estimated | Add a `Tariff` table (service × LOA band × season) that auto-prices lift/launch/storage |
| Quote = fixed price | Estimate, non-binding, emergent work expected | Rename to Estimate; add **Variation** (extra work) with owner approve/decline via emailed token |
| 2c variations and approvals cut | This is the #1 dispute source and the #1 feature in the competitor's pitch | **Build approvals first** — it reuses your existing token-email machinery |
| Fixed daily slots | Tidal yards: slots move daily with HW | Tide-aware slot generation (UKHO/Admiralty predictions or a cached table for Chichester) |
| Cancel session → rebook | Yard equivalent: lift postponed (wind, tide, hoist fault) | Repoint the cancel/rebook flow to lift slots; also notify the owner's contractors |
| No staff/trade model | Work split across yard and tenant trades | Minimum: free-text "carried out by" per line item |
| VAT unresolved | Both conventions exist | Store ex-VAT, show VAT line, inc-VAT total largest; setting per yard |
| No launch date at lift-out | Yards park boats in launch order | Capture intended launch date when booking a lift-out |
| Storage not modelled | Storage accrues daily whether work happens or not | Show running storage cost on the boat file — owners will love it and yards will like the chasing |
| Single-use emailed tokens, no accounts | Owners won't make accounts | **Keep.** Right call. |

---

## 10. What to ask a real yard (15 minutes, before building more)

1. Walk me through what happens from an owner's first phone call to the boat going back in.
2. Where does the hoist diary live right now — whiteboard, paper, Excel, software?
3. How do you decide lift times around the tide? How far ahead do you plan?
4. When an engineer finds extra work, how does the owner approve it? Has that ever gone wrong?
5. Which of your invoices are prepaid tariff and which are time and materials? Do you ever take deposits?
6. Do you quote ex-VAT or inc-VAT?
7. What software do you already pay for, and what does it annoy you with?
8. If one thing on the phone stopped ringing, which would you pick?

Question 8 is the product. Everything else is context.

---

## Sources

- Emsworth Yacht Harbour — PBO marina guide, TYHA listing, eOceanic harbour guide (sill access)
- Thornham Marina — boatyard services page (booking by office/phone/email; tenant services)
- Hayling Yacht Company — homepage (British Marine terms of business); eOceanic (±2.5h HW access)
- Premier Marinas — Chichester boatyard page and schedule of retail boatyard charges from 1 September 2026; storage ashore page
- Berthon Boat Co — Terms of Business (3 Oct 2025) and Boatyard Rates (from 1 April 2026)
- Yacht Havens (Largs, Troon) — 2026/27 winter package terms
- Crab Marsh Boat Yard (Fenland DC) and South Dock Marina (Southwark) — published working hours
- boatfolk — Boatyard Operative job advert, March 2026
- YBW forums — boatyard lien dispute (2015), lift-date dispute (2020), boat blocked in ashore (2005)
- PayCamp Yards (boatyardmanager.co.uk), Harbour Assist, EliteMarinas, Successful Software — product pages
- visitmyharbour.com, solenthandbook.com, tidechecker.com — Chichester Harbour access and tides
