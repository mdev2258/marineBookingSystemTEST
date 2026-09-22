# Marine Booking

A job and estimate system for **one marine tradesperson** — a shipwright,
rigger, marine diesel engineer or marine electrician, one to five people.

Not a marina. Not a boatyard. Their job list currently lives in their head, on
scrap paper, and in a scroll of texts. Office software has existed for years
and they still do not use it, because structured data entry is slower than a
scrap of paper. So the whole bet is:

> **Capture first, organise later.** Getting a job out of their head has to
> beat writing it on the back of their hand. The board is where those captures
> get sorted, and everything else grows out of moving cards on it.

Two things live in this one app:

| Route | What it is |
|---|---|
| `/` | The **marketing site** for the software business itself. Placeholder trading name, set at the top of `src/app/page.tsx`. |
| `/admin/…`, `/boat/…` | A **demo app** for a fictional firm, "Harbourside Marine Services", used to show prospects what they would be buying. |

This is a demo, not production software. It is built to click through end to
end and look credible in front of a customer.

**`ANALYSIS-TRADES.md` is the spec** and wins any disagreement with the code or
the docs. `docs/PLAN.md` is the design that implements it. `YARD-OPS.md` and
`ANALYSIS-INDEPENDENTS.md` are earlier research, kept for the reasoning and
**superseded** — build nothing from them unless `ANALYSIS-TRADES.md` asks for
it by name.

## What makes this different from a plumber's job app

Four things, and they are the only reasons to build it rather than sell them
Tradify:

1. **The asset is the boat, not an address** — and the boat moves between yard,
   pontoon and mooring.
2. **The owner is somewhere else.** They live inland and visit at weekends, so
   every approval and update is remote.
3. **Work waits on other people** — the yard's crane, the tide, the weather,
   parts. "Waiting" is a first-class state and always carries a reason.
4. **Records matter for years.** Insurers ask the age of standing rigging and
   want dated receipts. The trade holding those records gets the next job.

## How a job works

**A job exists before it has a price, and before it has a boat.** Both are the
premise of the product rather than loose validation — see `docs/PLAN.md` §1.

`Booking.column` is the job's state, and it is the board:

```
jotted → enquiry → estimate_sent → booked → waiting → on_it → done_to_invoice → invoiced
                                                                                    ↓
                                                            paid — drops off the board
                                                                   into the boat's history
```

- **Jot** (`/admin/jot`) — one text box, no other fields. Type or paste
  anything and it saves with no boat, no owner and no place. One tap away from
  every admin screen.
- **Sort** turns a jot into a job: boat, place, column. The captured text stays
  on the row verbatim. Typing a boat that does not exist creates it.
- **Waiting** is the one save in the whole app that can be refused. A card
  cannot enter it without a reason, enforced in `moveJob()` — the single write
  path — not only in the form. Past its date, the card flashes.
- **The boat file** (`/admin/boats/[id]`) is everything ever done to that boat,
  plus the kit and its ages, and prints as a work record or a rig record.
- **The owner** never logs in. `/boat/[token]` shows them plain-English status
  — "Waiting for crane — expected Sat 19 Sep" — and prices **only** where an
  estimate or invoice was actually sent to them.

### The yard era is parked, not deleted

An earlier version of this app sold a boatyard's crane diary. That code is
intact behind `FEATURE_YARD` (`src/lib/features.ts`), off by default:
`Session`, `SessionType` and `SessionCancellation` keep their tables, and
`/admin/day`, `/admin/sessions/*`, `/book/*`, `/booking/[reference]`,
`/rebook/[token]` and `/request` return 404 rather than merely being unlinked.

The cancel/rebook machinery is being repointed to "visit postponed", so it is
worth more intact than in the git history. **Ask before dropping any of those
tables.**

Set `FEATURE_YARD=true` in `.env` to walk the old flow. It is read at module
scope, so a deployment needs a redeploy and not just an env-var change.

## Running it locally

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run db:push           # create the tables from the schema
npm run seed              # fill it with a realistic board
npm run dev
```

Then open http://localhost:3000. The admin is at `/admin`, which lands on the
board, using the username and password you set in `.env`.

No Stripe key and no Resend key are needed to run or demo this. Emails are
printed to the terminal instead of sent, and still recorded in the database, so
the "N owners notified" counters are truthful offline.

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

**Re-seed shortly before the demo**, then check it:

```bash
npm run seed && npm run check
```

(`npm run seed` clears every table itself before it writes, so it is enough.
`npm run reset` additionally drops and recreates the schema, which you only
need after changing `schema.prisma`. Note `--force-reset` is blocked for AI
agents without explicit consent.)

Everything in the seed is positioned relative to *now*, in `Europe/London`, at
the moment it runs. There are no hardcoded dates. A fresh seed gives you:

- A board with every column populated, including two **jots with no boat and no
  owner at all**
- One Waiting card **past its date**, flashing, and a card for every one of the
  eight waiting reasons
- One boat carrying a realistic post-survey list spread across four columns —
  it shows how one boat fills a board
- A variation awaiting the owner (seized seacock, £140), one approved by link,
  and one **agreed by phone** with a note
- A postponed visit (weather) with the owner already notified
- Three invoices: one paid, one sent five days ago, one **19 days overdue**
- Ten reminders due: five for standing rigging past ten years old, five for
  engines past their service interval

`npm run check` asserts each of those is actually true, so a drifted seed is
caught before a prospect sees it rather than during. It has earned its keep: it
has caught an overbooked rebook target, quotes seeded with no slot, a "1 space
left" that was really 2, a midnight rollover that staled a whole seed
mid-session, and a card sitting in *Estimate sent* with no estimate behind it.

It also checks the calendar helpers before it checks any data, because every
date in the seed is computed with them and a clamping bug would make every
other assertion agree with a wrong seed.

## Conventions worth knowing before you edit

- **Money is `Int` pence.** No `Decimal`, no floats. `qty` on a line is the
  only Float, and it is not money.
- **A calendar date is a `String` `"yyyy-MM-dd"`**, not a `DateTime`.
  `plannedOn`, `waitingUntil`, `dueOn`, `installedOn` all mean *a day*. Storing
  a bare day as an instant is how a job planned for the 16th renders as the
  15th in BST. Instants stay `DateTime` and stay UTC.
- **All London/UTC conversion goes through `src/lib/time.ts`.** Nothing else
  may import `date-fns-tz`.
- **Idempotency is structural**, never check-then-write: the status or the
  token goes in the `WHERE` clause and is cleared by the same statement, so a
  double submit matches zero rows.
- **Email is never sent inside a transaction.** A rollback cannot unsend a
  message. Commit first, then send.
- **"N notified" is always a `COUNT` over `EmailLog`**, never a stored counter.
- **Every Server Action re-checks the admin cookie itself.** `src/proxy.ts` is
  a redirect for humans, not an authorisation boundary.
- **VAT is optional.** When the business is not registered, the word VAT
  appears *nowhere* — not a 0% line, not "inc. VAT".

## Environment variables

Copy `.env.example` to `.env`. Every variable:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | The **pooled** Postgres connection string, used by the running app. Append `?pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | The **direct** Postgres connection string for the same database. `prisma db push` and the seed need a real session and cannot go through the pooler. Miss this and schema pushes hang or fail. |
| `ADMIN_USERNAME` | There is no user table. This and the password below *are* the admin account. |
| `ADMIN_PASSWORD` | As above. Change it from the example value. |
| `AUTH_SECRET` | Signing key for the admin session cookie. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `RESEND_API_KEY` | Leave **blank** to print emails to the console instead of sending them. Everything still works. |
| `EMAIL_FROM` | The From address on outbound email. Must be a domain verified with Resend. |
| `DEMO_EMAIL_REDIRECT` | Safety net. When set, *every* outbound email goes here instead of the owner, no matter what. Set this for any demo run against a real Resend key. |
| `CONTACT_RECIPIENT_EMAIL` | Where the marketing page's contact form is delivered. |
| `FEATURE_YARD` | `true` un-parks the old boatyard diary. Off by default; read at build time for static routes. |
| `STRIPE_SECRET_KEY` | Not required. The payments layer ships stubbed — see below. |
| `STRIPE_WEBHOOK_SECRET` | As above. |
| `NEXT_PUBLIC_BASE_URL` | Absolute origin, used to build links inside emails. |
| `CRON_SECRET` | Bearer token for `GET /api/cron/reminders`. If it is unset the endpoint refuses every request, rather than standing open. |

## Payments are deliberately unfinished

`src/lib/payments.ts` is the only place in the codebase that will ever know
Stripe exists:

```ts
startCheckout(bookingId)           // → { url }
markBookingPaid(bookingId, pi)     // safe to call twice
verifyAndMarkPaid(checkoutSession) // → { bookingReference } | null
```

Under the trades product this seam is **repointed from deposits to invoices**.
There is no deposit by default: a tradesperson invoices on completion, and the
pay link on an invoice is the one place money moves.

They currently return stubs, which is why the app completes end to end with no
Stripe account. Replacing them is a self-contained job: the `stripe`
dependency, `src/app/api/stripe/webhook/route.ts` and the `StripeEvent`
idempotency handler are all still to be written. The `StripeEvent` model
already exists in the schema.

`docs/PLAN.md` §6 is the handover contract. Two items in it are safe in the
demo and **not safe in production** — both are commented in
`src/lib/payments.ts`:

1. `verifyAndMarkPaid` also resolves on a bare booking reference, so the demo
   can complete with no Stripe account. That branch must be **deleted**, not
   just bypassed.
2. `markBookingPaid` does not check `expiresAt`. Refuse-and-refund or
   honour-and-overbook is a commercial call, so it is left to be decided rather
   than guessed.

**Do not "finish" these unasked.** They are left for a payments specialist on
purpose.

## Deploying to Vercel

1. Create a Postgres database — Neon, Supabase, Vercel Postgres, any of them.
2. Set `DATABASE_URL` to its **pooled** connection string (with
   `?pgbouncer=true&connection_limit=1`) and `DIRECT_URL` to its **direct**
   one. Both, always. The app runs through the pooler because every serverless
   invocation opens a connection; `prisma db push` and the seed cannot, because
   they need a real session.
3. Set every other variable from the table above in the Vercel project.
4. Deploy. `vercel-build` runs `prisma db push` for you, but **only when
   `VERCEL_ENV=production`** — a preview deployment must never reshape the
   database the live install is using. Give previews their own branch of the
   database if you want them to run at all.

`db push` is used rather than migrations because nothing here holds real data
yet. The moment install #1 holds a trade's actual job book, adopt
`prisma migrate`: baseline the existing database into an initial migration and
change `vercel-build` to `prisma migrate deploy`. Deferring costs nothing;
running `db push` against a database someone depends on eventually will not.

There is no SQLite mode. Demos are given from a deployed URL, so Postgres was
already the dialect every demo and every customer ran on — keeping SQLite for
local dev only meant the path that shipped was the one nobody exercised.
Local dev points at its own branch of the same Postgres.

`vercel.json` registers the reminder cron at 17:00 UTC, which is 18:00 London
in summer and 17:00 in winter. Vercel crons are UTC-only.

## Windows notes

Each of these has cost a cycle at least once:

- The dev server holds the Prisma query-engine DLL. **Kill it before
  `prisma generate` or `npm run build`**, or you get an opaque `EPERM` rename
  error. If a build then fails inside `.next/dev/types/`, delete `.next`.
- `tsx` does not read `.env` the way the Prisma CLI does — the scripts pass
  `--env-file=.env` explicitly.
- A `*/` inside a CSS comment closes it early and takes the whole stylesheet
  down.
- `cd` does not change drive in `cmd.exe` — use `cd /d`.
