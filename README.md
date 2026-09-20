# Marine Booking

A booking and admin system for small marine businesses — sailing schools, RIB
charters, paddleboard hire, marine engineers.

Two things live in this one app:

| Route | What it is |
|---|---|
| `/` | The **marketing site** for the software business itself. Placeholder trading name, set at the top of `src/app/page.tsx`. |
| `/book`, `/admin`, … | A **demo booking app** for a fictional operator, "Harbourside Sailing", used to show prospects what they would be buying. |

This is a demo, not production software. It is built to click through end to end
and look credible in front of a customer. See `docs/PLAN.md` for the signed-off
design and the reasoning behind the data model.

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

- Today's first session at 5 of 6 seats with nothing marked yet — mark people
  attended live, in front of the prospect
- A future session reading exactly "1 space left", and another completely empty
- A live pending payment 20 minutes from lapsing, holding its seats — **this is
  why you re-seed shortly before the demo, not the night before**; after 20
  minutes the hold is dead and `npm run check` will tell you so
- A cancelled session with 3 customers notified, 1 already rebooked, 2 still to
  pick a date
- Tomorrow's bookings deliberately un-reminded, so "Send reminders now" does
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
