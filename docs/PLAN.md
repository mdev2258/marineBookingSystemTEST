# Marine Booking — Approved Demo Plan

> This is the signed-off plan, reproduced so that the payments specialist and any
> reviewer are reading the same source of truth.
>
> **Boundary note:** the initial build deliberately stops at the payments seam.
> `src/lib/payments.ts` contains three stubbed-but-fully-typed functions.
> `stripe`, `src/app/api/stripe/webhook/route.ts` and every Stripe SDK call are
> the specialist's to add. The app demos end to end on the stubs alone.

Stack: Next 16.3.5 (App Router, TS, Tailwind v4), React 19, **Prisma pinned to 6.19.3**, `resend@6`, `jose` (Edge-safe HS256 cookie), `date-fns-tz`. (`stripe@22` is the specialist's to install.)

## 1. Prisma data model

**Global rules for dialect portability** (SQLite dev <-> Postgres prod):

| Avoid | Use instead | Why |
|---|---|---|
| `enum` blocks | `String` column + TS `as const` union + Zod | Prisma enum support on SQLite has been inconsistent across versions; string columns are identical SQL on both |
| `@db.*` native types | plain `String` / `Int` / `DateTime` | `@db.VarChar`, `@db.Timestamptz` are provider-specific and fail validation on the other |
| `Decimal` | `Int` pence everywhere | SQLite has no real decimal; also kills float money bugs |
| `Json` | `String` (none needed here) | SQLite `Json` is a string under the hood, queries diverge |
| `mode: 'insensitive'` | lowercase emails on write, exact-match on read | Postgres-only; **throws** on SQLite |
| `createMany({ skipDuplicates })` | loop or `upsert` in seed | unsupported on SQLite |
| `migrations/` folder | **`prisma db push` on both** | migration SQL is dialect-specific; a SQLite-generated migration will not apply to Neon. This is the single most likely deploy-night failure |

Statuses as TS unions in `src/lib/enums.ts`, e.g. `BOOKING_STATUS = ['pending_payment','paid','expired','cancelled','awaiting_rebook','attended','no_show'] as const`.

### Models

**`Operator`** — deliberately generic; the fictional operator is one row.
`id` cuid PK, `name`, `slug @unique`, `timezone` default `"Europe/London"`, `currency` default `"GBP"`, `contactEmail`, `phone?`, `createdAt`.
Relations: `sessionTypes[]`, `sessions[]`, `customers[]`, `bookings[]`.

**`SessionType`** — the lookup table that keeps this non-sailing-specific. Swap rows and it's a RIB charter or paddleboard hire; no code changes.
`id`, `operatorId` -> Operator, `name` ("RYA Level 1 Dinghy", "Sunset RIB Blast"), `slug`, `description?`, `durationMinutes Int`, `defaultCapacity Int`, `defaultPricePence Int`, `depositPercent Int @default(50)`, `active Boolean @default(true)`, `sortOrder Int @default(0)`.
`@@unique([operatorId, slug])`

**`Session`**
`id`, `operatorId`, `sessionTypeId` -> SessionType, `startsAt DateTime` (UTC instant), `endsAt DateTime`, **`capacity Int`**, **`pricePerPersonPence Int`**, `status String @default("scheduled")` (`scheduled | cancelled`), `notes?`, `createdAt`, `updatedAt`.
`@@index([operatorId, startsAt])`, `@@index([sessionTypeId, startsAt])`
Capacity and price are **snapshotted** from `SessionType` defaults at creation, then independently editable — never read price through the relation at booking time.

**`Customer`**
`id`, `operatorId`, `name`, `email` (stored lowercased), `phone?`, `createdAt`.
`@@unique([operatorId, email])`

**`Booking`** — the centre of the model.
`id` cuid, `reference String @unique` (human-readable `HS-7QK2ND`, used in emails and as the public URL key), `operatorId`, `sessionId` -> Session, `customerId` -> Customer, `partySize Int`, `pricePerPersonPence Int` (snapshot), `totalPence Int`, **`depositPence Int`**, `status String @default("pending_payment")`, **`expiresAt DateTime?`**, **`stripeCheckoutSessionId String? @unique`**, `stripePaymentIntentId String? @unique`, `paidAt?`, `attendanceMarkedAt?`, `cancelledAt?`, **`rebookToken String? @unique`**, **`rebookedFromSessionId String?`**, `rebookedAt?`, `reminderSentAt?`, `notes?`, `createdAt`, `updatedAt`.
`@@index([sessionId, status])`, `@@index([customerId])`

`depositPence = Math.round(0.5 * partySize * pricePerPersonPence)` — computed once at creation, never recomputed.

**Status lifecycle:**

```
pending_payment --paid-------------> paid --> attended | no_show
      |                               |
      +-expired (abandoned)           +-(session cancelled)--> awaiting_rebook --rebook--> paid
                                      +-cancelled (admin/customer, no rebook)
```

`awaiting_rebook` exists so admin can render **"3 notified, 1 rebooked, 2 awaiting"** — that counter is the demo moment.

**`SessionCancellation`**
`id`, `sessionId String @unique` -> Session, `reason String` (`weather | tide | mechanical | other`), `note String?` (free text shown verbatim in the email), `cancelledAt`, `cancelledBy String @default("admin")`.

**`EmailLog`** — the evidence trail for "3 customers notified".
`id`, `type String` (`booking_confirmation | cancellation | rebook_confirmation | reminder | contact_form`), `toEmail` (the *intended* recipient), `deliveredTo` (the actual `DEMO_EMAIL_REDIRECT` address), `subject`, `status String` (`sent | failed`), `providerId String?` (Resend id), `error String?`, `bookingId?`, `sessionId?`, `customerId?`, `createdAt`.
`@@index([sessionId, type])`, `@@index([bookingId])`
Notified count = `count(EmailLog where sessionId = X and type = 'cancellation' and status = 'sent')`. One query, one source of truth — no denormalised counter to drift.

**`StripeEvent`** — webhook idempotency.
`id String @id` (the Stripe `evt_...` id), `type String`, `processedAt DateTime @default(now())`.
Handler does `prisma.stripeEvent.create()` **first, inside the transaction**; a unique violation (`P2002`) means already processed -> return 200 immediately. A column on `Booking` is the wrong shape because several event types touch one booking.
(The initial build creates the MODEL only — the handler is the specialist's.)

**`ContactMessage`** — `id`, `name`, `email`, `business?`, `message`, `createdAt`. Persisted so a Resend outage doesn't silently swallow a lead during the demo.

No admin-session table — stateless signed JWT cookie.

### Do pending bookings hold capacity? — Yes.

A `pending_payment` booking **holds its seats, but only until `expiresAt`.** Stripe Checkout `expires_at` will be 30 minutes (Stripe's minimum), mirrored into `Booking.expiresAt` at creation. The stub sets `expiresAt = now + 30min` directly.

**Spaces-left, exactly:**

```
spacesLeft(session) = session.capacity - SUM(partySize) over bookings WHERE
    sessionId = session.id
AND ( status IN ('paid','attended','no_show')
      OR (status = 'pending_payment' AND expiresAt > now()) )
```

`cancelled`, `expired` and `awaiting_rebook` never consume capacity. (`awaiting_rebook` belongs to a cancelled session, so it is not occupying a live one.)

Release happens two ways, neither of which correctness depends on:

1. **`checkout.session.expired` webhook** -> flip `pending_payment` -> `expired`. Primary. (Specialist's.)
2. **Daily cron sweep** -> same flip for any `pending_payment` with `expiresAt < now()`. Tidiness only.

The time predicate is baked into the availability query, so a seat is freed the instant it expires even if neither fires.

### Rebook transfer — **move the row.**

On rebook, the *same* `Booking` row gets `sessionId` updated, `rebookedFromSessionId` set to the cancelled session, `rebookedAt = now()`, `status` back to `paid`, `rebookToken = null` (single use). Deposit, `stripePaymentIntentId` and `reference` are untouched — the deposit transfers by virtue of never having moved.

Rejected cancel-and-clone: it splits one Stripe payment across two booking rows, breaks the `stripePaymentIntentId @unique` 1:1 invariant, and makes the admin day view show ghost duplicates.

The deposit transfers **unchanged** even if the new session's price differs. Balance-due-on-the-day is out of scope.

## 2. Route structure

### Pages

| Route | Purpose |
|---|---|
| `/` | Marketing single page: problem headline, 3 problems, 3 steps, pricing, contact form |
| `/book` | Public session list — date, time, type, price, spaces left; filter by session type; `force-dynamic` |
| `/book/[sessionId]` | Booking form (name, email, phone, party size) -> creates pending booking -> redirects to Stripe |
| `/book/confirmation` | Stripe `success_url` landing, `?cs={CHECKOUT_SESSION_ID}` — calls `verifyAndMarkPaid()`, then shows the reference |
| `/book/abandoned` | Stripe `cancel_url` — "no payment taken, your hold is released" |
| `/booking/[reference]` | Public booking detail — what was booked, deposit paid, balance due |
| `/rebook/[token]` | Rebook picker for a customer whose session was cancelled |
| `/admin/login` | Single hardcoded login form (env username/password) |
| `/admin` | Redirects to `/admin/day?date=<today in London>` |
| `/admin/day` | **Primary screen.** Day view: sessions for the date, each booking with name/phone/email/party size, attended / no-show toggles, prev/next day |
| `/admin/sessions` | Upcoming sessions list with fill levels; entry point to create |
| `/admin/sessions/new` | Create session — type, date, time, capacity, price (prefilled from `SessionType` defaults) |
| `/admin/sessions/[id]` | Edit session + its bookings + "Cancel this session" |
| `/admin/sessions/[id]/cancel` | Cancel flow: reason radio (weather/tide/mechanical/other) + note, preview "this will email N customers", confirm -> result page showing "3 customers notified, 0 failed" |

### API routes

| Route | Purpose |
|---|---|
| `POST /api/stripe/webhook` | **SPECIALIST'S — not created by the initial build** |
| `GET /api/cron/reminders` | Vercel Cron target; `Authorization: Bearer $CRON_SECRET` check; sends next-day reminders; also sweeps expired holds |

### Server actions (`src/app/**/actions.ts`)

- `submitContactForm` — persist `ContactMessage`, email the freelancer, log to `EmailLog`
- `createPendingBooking` — upsert `Customer`, re-check availability, create `Booking(pending_payment, expiresAt)`, call `startCheckout()`, redirect
- `adminLogin` / `adminLogout` — verify env creds, set/clear signed cookie
- `createSession` / `updateSession`
- `markAttendance(bookingId, 'attended' | 'no_show')`
- `cancelSession(sessionId, reason, note)` — **transaction**: set `Session.status='cancelled'`, create `SessionCancellation`, flip every `paid` booking to `awaiting_rebook` with a fresh `rebookToken`. **Then, after commit**, send cancellation emails sequentially, writing one `EmailLog` per send. Never email inside a transaction.
- `confirmRebook(token, newSessionId)` — validate token, same `sessionTypeId`, capacity available; move the row; send rebook confirmation
- `sendRemindersNow` — admin button calling the identical function as the cron

### Middleware

Protect `/admin/*` (except `/admin/login`) by verifying the `jose` HS256 cookie. **Next 16 renamed `middleware.ts` -> `proxy.ts`** — use whichever file the scaffold actually generates; verify at scaffold time rather than assuming.

## 3. Seed script

`prisma/seed.ts`, run with `tsx`. **Everything relative to "now" in `Europe/London` at run time** — never hardcoded dates. Re-runnable: delete all rows in FK-safe order first. **Must never send email** (writes `EmailLog` rows directly).

- 1 `Operator`: "Harbourside Sailing", Lymington.
- 4 `SessionType`s: *RYA Level 1 Dinghy* (6 @ £95, 4h), *Keelboat Taster* (8 @ £60, 3h), *Sunset RIB Blast* (10 @ £35, 1.5h), *Paddleboard Hire* (12 @ £20, 2h).
- ~24 `Session`s spanning **now -10 days to now +11 days**, 2-3 per day at 09:30 / 13:30 / 17:30 London, skipping a couple of days so the day view has a realistic empty day.
- ~18 `Customer`s, all `@example.com` — so even a missing `DEMO_EMAIL_REDIRECT` cannot reach a real person.
- ~45 `Booking`s:
  - **Past sessions:** all `attended` except three `no_show` and one `cancelled`.
  - **Today:** one session ~80% full with a mix of unmarked bookings, ready to be marked live in front of the prospect.
  - **Future:** one **nearly full** (5/6 — makes "spaces left: 1" visible), one **completely empty**, one mid-fill, plus **one live `pending_payment` with `expiresAt` 20 minutes out**.
  - One `expired` pending in the past.
- **One past cancelled session** with its `SessionCancellation` (reason `weather`, note "Force 6 gusting 7 in the Solent"), its bookings in `awaiting_rebook` (one already `rebookedFromSessionId`-linked onto a later session), and matching `cancellation` `EmailLog` rows.
- A couple of `ContactMessage` rows.

Add `npm run seed` and `npm run reset` (`db push --force-reset` + seed).

## 4. Mobile-first

Design at 390px first; desktop is a max-width container, nothing more. Tailwind base classes unprefixed, `sm:`/`md:` only to widen.

**Most care, in order:**

1. **`/admin/day` — the pontoon screen.** One thumb, bright sun, possibly wet hands. Sticky date header with large prev/next chevrons. One card per session; one row per booking. Phone and email are `tel:` / `mailto:` links. Attended / no-show are two side-by-side buttons at **minimum 48px tall**, full-width within the row, immediate colour-state change (optimistic UI via `useOptimistic`) — no dropdowns, no swipe gestures, no modals. High contrast, no light grey on white.
2. **`/admin/sessions/[id]/cancel`** — done in a hurry at 06:30. Large reason radio cards (not a `<select>`), a plain "This will email 7 customers" line above a single full-width destructive button, result screen stating the notified count.
3. **`/book/[sessionId]`** — `inputMode="numeric"` on party size, `type="tel"`/`type="email"`, a stepper not a spinner, deposit recalculated live above submit.
4. `/book` list — cards not a table; date, time, type, price, spaces-left legible without horizontal scroll.
5. `/` marketing — plain, generous whitespace, one accent colour, sober sans. **No gradients, no hero photography, no stock imagery.** Contact form reachable fast on mobile.

## 5. Build order

**Phase 0 — scaffold.** `create-next-app`, `git init`, `.gitignore`. **Pin `prisma@6.19.3` and `@prisma/client@6.19.3` explicitly.** `.env.example` with: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `DEMO_EMAIL_REDIRECT`, `CONTACT_RECIPIENT_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_BASE_URL`, `CRON_SECRET`.

**Phase 1 — schema + seed.** Full `schema.prisma`, `db push`, seed, Prisma singleton, `src/lib/enums.ts`, `src/lib/money.ts`, `src/lib/time.ts` (every London-date conversion goes through this one file), `src/lib/availability.ts` (the `spacesLeft` query, used by every surface).

**Phase 2 — admin auth + day view.** Build first: primary screen, seed gives it instant content.

**Phase 3 — session CRUD.**

**Phase 4 — cancel + rebook (the sale).** `cancelSession`, email templates, `EmailLog`, notified counter, `/rebook/[token]`.

**Phase 5 — public booking up to the payment seam.** `/book`, `/book/[sessionId]`, `createPendingBooking`, `/booking/[reference]`, confirmation + abandoned pages.

**Phase 6 — reminders.** `sendReminders()` shared by `/api/cron/reminders` and the admin button; `vercel.json` cron `0 17 * * *`.

**Phase 7 — marketing page + contact form.**

## 6. Carry these through

- `export const dynamic = 'force-dynamic'` on `/book` and every `/admin/*` page, or a prospect sees "3 spaces left" after the last seat went.
- Reminders = "the evening before": cron at 17:00 UTC selects `paid` bookings whose session's *London date* is tomorrow and `reminderSentAt IS NULL`. `reminderSentAt` lives on **`Booking`, not `Session`**.
- Rebook link = picker with the soonest same-type session **pre-selected**, not a one-click auto-move. Handle "no suitable sessions yet — we'll be in touch".
- BST ends 25 October; Vercel runs UTC, local dev runs GMT+1. All London conversions through `src/lib/time.ts`. Sanity-check a 00:30 and a 23:30 session.
- Last-seat race: re-check availability inside `createPendingBooking` immediately before insert. Not locked — acceptable for a demo.
- README: setup steps, every env var explained, the Vercel/Postgres provider-edit step, and "re-seed the morning of a demo".

## 7. The payments seam (handover contract)

`src/lib/payments.ts` exports exactly three functions. Everything else in the app
calls only these; nothing else knows Stripe exists.

```ts
export async function startCheckout(bookingId: string): Promise<{ url: string }>
export async function markBookingPaid(bookingId: string, stripePaymentIntentId: string): Promise<void>
export async function verifyAndMarkPaid(checkoutSessionId: string): Promise<{ bookingReference: string } | null>
```

- `startCheckout` — stub returns `{ url: '/book/confirmation?demo=1&ref=<reference>' }`.
  The specialist replaces it with `stripe.checkout.sessions.create({ expires_at: now+30min, ... })`,
  persists `stripeCheckoutSessionId` on the booking, and returns the hosted URL.
- `markBookingPaid` — **must be safely callable twice.** Implemented as a
  status-predicated `updateMany`, so the second call matches zero rows.
  The webhook handler will call this.
- `verifyAndMarkPaid` — the confirmation page calls THIS, never Stripe directly.
  The stub resolves the booking from the demo `ref`. The specialist replaces the body with
  `stripe.checkout.sessions.retrieve(id)` + `markBookingPaid`. Page code is unchanged.

Also reserved for the specialist: `npm i stripe`, `src/app/api/stripe/webhook/route.ts`,
and the `StripeEvent` idempotency handler (the model already exists).
