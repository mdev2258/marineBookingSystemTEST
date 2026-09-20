# Marine Booking

A job, quote and diary system for marine trades — boatyards, surveyors,
riggers, shipwrights, marine engineers.

Two things live in this one app:

| Route | What it is |
|---|---|
| `/` | The **marketing site** for the software business itself. Placeholder trading name, set at the top of `src/app/page.tsx`. |
| `/book`, `/request`, `/admin`, … | A **demo app** for a fictional yard, "Harbourside Marine", used to show prospects what they would be buying. |

This is a demo, not production software. It is built to click through end to end
and look credible in front of a customer.

`docs/PLAN.md` is the original signed-off design. It describes an earlier
version of this app that sold shared sessions with seats, for sailing schools
and hire. The app has since been pivoted to marine services; the parts of the
plan about portability, timezones, capacity and the payments seam still hold,
but wherever it talks about party size, price per person or seats, the code is
now the better guide.

## How a job works

The pivot's central change is that **a job exists before it has a price.**
Every job is quoted on the boat rather than off a price list.

```
enquiry ──quote──> quoted ──accept──> pending_payment ──pay──> paid ──> completed
   │                  │                      │                  │
   │                  └─ declined            └─ expired         └─(slot cancelled)─> awaiting_rebook ──rebook──> paid
   └─ cancelled
```

Work arrives two ways, and the only difference is whether a slot is attached:

- **`/book`** — the yard publishes slots it can work (tide windows for lifts)
  and an owner asks for one.
- **`/request`** — an owner asks for work with no date, because the yard has to
  see the boat first. `sessionId` is null until it is quoted.

Both land in the same inbox at `/admin/enquiries`. The yard prices the job and
picks a slot in one step; the owner accepts with a single-use link; **the
deposit is created at that moment** and never recomputed afterwards.

A quote does **not** hold a slot. Only a paid job or a live deposit hold
occupies the yard's diary, so an enquiry nobody replies to cannot block the
crane indefinitely.

## Running it locally

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run db:push           # create the SQLite database from the schema
npm run seed              # fill it with ~3 weeks of realistic sessions
npm run dev
```

Then open http://localhost:3000. The admin is at `/admin`, using the username
and password you set in `.env`.

No Stripe key and no Resend key are needed to run or demo this. Emails are
printed to the terminal instead of sent, and still recorded in the database, so
the "3 customers notified" counter is truthful offline.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run seed` | Wipe and re-seed the demo data |
| `npm run reset` | Drop the database, recreate it, then seed |
| `npm run check` | Assert the demo data still hits the moments the demo relies on |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:studio` | Browse the database in Prisma Studio |

### Before a demo

**Re-seed shortly before the demo** — minutes, not hours — then check it:

```bash
npm run seed && npm run check
```

(`npm run seed` clears every table itself before it writes, so it is enough.
`npm run reset` additionally drops and recreates the schema, which you only
need after changing `schema.prisma`.)

Everything in the seed is positioned relative to *now*, in `Europe/London`, at
the moment it runs. There are no hardcoded dates. A fresh seed gives you:

- Today's jobs booked in and nothing marked off — mark work done live, in front
  of the prospect
- Three enquiries waiting on a price, and two quotes out waiting on the owner —
  the seed prints a live `/quote/...` link you can accept on camera
- A future slot reading exactly "1 space left", and another completely empty
- A live deposit hold 20 minutes from lapsing — **this is why you re-seed
  shortly before the demo, not the night before**; after 20 minutes the hold is
  dead and `npm run check` will tell you so
- A cancelled crane day with 3 owners notified, 1 already rebooked, 2 still to
  pick a tide, and free lift-in slots for them to move onto
- Tomorrow's jobs deliberately un-reminded, so "Send reminders now" does
  something visible

`npm run check` asserts each of those is actually true, so a drifted seed is
caught before a prospect sees it rather than during.

## Environment variables

Copy `.env.example` to `.env`. Every variable:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | `file:./dev.db` locally. A Postgres connection string in production — **see the deploy note below, it is not only this variable.** |
| `ADMIN_USERNAME` | There is no user table. This and the password below *are* the admin account. |
| `ADMIN_PASSWORD` | As above. Change it from the example value. |
| `AUTH_SECRET` | Signing key for the admin session cookie. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `RESEND_API_KEY` | Leave **blank** to print emails to the console instead of sending them. Everything still works. |
| `EMAIL_FROM` | The From address on outbound email. Must be a domain verified with Resend. |
| `DEMO_EMAIL_REDIRECT` | Safety net. When set, *every* outbound email goes here instead of the customer, no matter what. Set this for any demo run against a real Resend key. |
| `CONTACT_RECIPIENT_EMAIL` | Where the marketing page's contact form is delivered. |
| `STRIPE_SECRET_KEY` | Not required. The payments layer ships stubbed — see below. |
| `STRIPE_WEBHOOK_SECRET` | As above. |
| `NEXT_PUBLIC_BASE_URL` | Absolute origin, used to build links inside emails. |
| `CRON_SECRET` | Bearer token for `GET /api/cron/reminders`. If it is unset the endpoint refuses every request, rather than standing open. |

## Payments are deliberately unfinished

`src/lib/payments.ts` exports exactly three functions, and they are the only
place in the codebase that will ever know Stripe exists:

```ts
startCheckout(bookingId)          // → { url }
markBookingPaid(bookingId, pi)    // safe to call twice
verifyAndMarkPaid(checkoutSession) // → { bookingReference } | null
```

They currently return stubs, which is why the booking flow completes end to end
with no Stripe account. Replacing them is a self-contained job: the `stripe`
dependency, `src/app/api/stripe/webhook/route.ts` and the `StripeEvent`
idempotency handler are all still to be written. The `StripeEvent` model already
exists in the schema. No page or action needs to change.

`docs/PLAN.md` section 7 is the handover contract. Two items in it are safe in
the demo and **not safe in production** — both are commented in
`src/lib/payments.ts`:

1. `verifyAndMarkPaid` also resolves on a bare booking reference, so the demo
   can complete with no Stripe account. `/book/confirmation` is an
   unauthenticated page, so that branch must be **deleted**, not just bypassed.
2. `markBookingPaid` does not check `expiresAt`, so a payment arriving after the
   hold has lapsed resurrects a booking whose seats may already have been given
   away. Refuse-and-refund or honour-and-overbook is a commercial call, so it is
   left to be decided rather than guessed.

## Deploying to Vercel

1. Create a Postgres database (Neon, Supabase, Vercel Postgres — any of them).
2. Set `DATABASE_URL` to its connection string.
3. **Edit `prisma/schema.prisma` and change `provider = "sqlite"` to
   `provider = "postgresql"`.** Prisma 6 does not allow `env()` for the provider,
   so this is a real one-line code change and not just an environment variable.
   Missing it is the most likely thing to go wrong on deploy night.
4. Set every other variable from the table above in the Vercel project.
5. Deploy, then run `npx prisma db push` against the production database.

There is no `migrations/` folder on purpose. Migration SQL is dialect-specific,
and a migration generated against SQLite will not apply to Postgres. Both
environments are created with `prisma db push` from the same schema.

`vercel.json` registers the reminder cron at 17:00 UTC.
