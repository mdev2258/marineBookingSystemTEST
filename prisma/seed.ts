/**
 * Demo seed.
 *
 * Everything is positioned relative to "now" in Europe/London at run time --
 * there is not a single hardcoded date in here. Re-seed on the morning of a
 * demo and the day view is populated for that day, not for the day this was
 * written.
 *
 * Re-runnable: every table is cleared first, in FK-safe order.
 *
 * This script MUST NEVER SEND EMAIL. The cancellation EmailLog rows are
 * written directly, because the admin cancel screen counts them to say
 * "3 customers notified" and that number has to be right in a seeded demo
 * that has never had a Resend key.
 */

import { PrismaClient } from '@prisma/client';
// Relative imports, not the "@/" alias: tsx runs this outside Next's resolver.
import { addDays, londonDateTimeToUtc, todayInLondon } from '../src/lib/time';
import { depositPence, totalPence } from '../src/lib/money';
import { generateBookingReference, generateRebookToken } from '../src/lib/reference';

const prisma = new PrismaClient();

const TYPE = {
  dinghy: 'rya-level-1-dinghy',
  keelboat: 'keelboat-taster',
  rib: 'sunset-rib-blast',
  paddleboard: 'paddleboard-hire',
} as const;

type TypeSlug = (typeof TYPE)[keyof typeof TYPE];

const CUSTOMERS = [
  { name: 'Alice Fenwick', phone: '07700 900012' },
  { name: 'Tom Ashby', phone: '07700 900034' },
  { name: 'Priya Nair', phone: '07700 900056' },
  { name: 'Gareth Lloyd', phone: '07700 900078' },
  { name: 'Marta Kowalska', phone: '07700 900090' },
  { name: 'Ewan Blackwood', phone: '07700 900111' },
  { name: 'Sophie Trent', phone: '07700 900133' },
  { name: 'Danny Okafor', phone: '07700 900155' },
  { name: 'Helen Vasey', phone: '07700 900177' },
  { name: 'Rob Standing', phone: '07700 900199' },
  { name: 'Nina Achterberg', phone: '07700 900210' },
  { name: 'Callum Reid', phone: '07700 900232' },
  { name: 'Jess Hartley', phone: '07700 900254' },
  { name: 'Owen Pryce', phone: '07700 900276' },
  { name: 'Bea Coulson', phone: '07700 900298' },
  { name: 'Sam Whitlock', phone: '07700 900319' },
  { name: 'Ffion Meredith', phone: '07700 900331' },
  { name: 'Joe Ballantyne', phone: '07700 900353' },
];

/** All @example.com, so a stray send with no DEMO_EMAIL_REDIRECT still cannot reach anyone. */
function emailFor(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').join('.')}@example.com`;
}

/**
 * A session to create. `key` is how the booking table below refers back to it.
 * `offset` is days from today in London; `time` is a London wall clock.
 */
type SessionSpec = {
  key: string;
  offset: number;
  time: string;
  type: TypeSlug;
};

const SESSIONS: SessionSpec[] = [
  // ---- Past. Gaps at -9, -6, -4 and -2 so the day view has believable empty days.
  { key: 'p10a', offset: -10, time: '09:30', type: TYPE.dinghy },
  { key: 'p10b', offset: -10, time: '13:30', type: TYPE.keelboat },
  { key: 'p8a', offset: -8, time: '09:30', type: TYPE.dinghy },
  { key: 'p8b', offset: -8, time: '17:30', type: TYPE.rib },
  { key: 'p7a', offset: -7, time: '13:30', type: TYPE.paddleboard },
  { key: 'p5a', offset: -5, time: '09:30', type: TYPE.dinghy },
  { key: 'cancelled', offset: -5, time: '13:30', type: TYPE.keelboat },
  { key: 'p5c', offset: -5, time: '17:30', type: TYPE.rib },
  { key: 'p3a', offset: -3, time: '09:30', type: TYPE.keelboat },
  { key: 'p3b', offset: -3, time: '17:30', type: TYPE.rib },
  { key: 'p1a', offset: -1, time: '09:30', type: TYPE.dinghy },
  { key: 'p1b', offset: -1, time: '13:30', type: TYPE.paddleboard },

  // ---- Today. t0a is the one marked live in front of the prospect.
  { key: 't0a', offset: 0, time: '09:30', type: TYPE.dinghy },
  { key: 't0b', offset: 0, time: '13:30', type: TYPE.keelboat },
  { key: 't0c', offset: 0, time: '17:30', type: TYPE.rib },

  // ---- Future. +1 is deliberately un-reminded so "Send reminders now" does something.
  { key: 'f1a', offset: 1, time: '09:30', type: TYPE.dinghy },
  { key: 'f1b', offset: 1, time: '13:30', type: TYPE.keelboat },
  { key: 'f2a', offset: 2, time: '17:30', type: TYPE.rib },
  { key: 'f3a', offset: 3, time: '09:30', type: TYPE.dinghy }, // 5/6 -> "1 space left"
  { key: 'f4a', offset: 4, time: '13:30', type: TYPE.paddleboard }, // completely empty
  { key: 'f6a', offset: 6, time: '09:30', type: TYPE.keelboat }, // rebook target
  { key: 'f7a', offset: 7, time: '17:30', type: TYPE.rib },
  { key: 'f9a', offset: 9, time: '09:30', type: TYPE.dinghy }, // holds a live pending_payment
  { key: 'f11a', offset: 11, time: '13:30', type: TYPE.keelboat },
];

type BookingSpec = {
  session: string;
  /** Index into CUSTOMERS. */
  customer: number;
  partySize: number;
  status: 'paid' | 'attended' | 'no_show' | 'cancelled' | 'expired' | 'pending_payment' | 'awaiting_rebook';
  /** Minutes from now until a pending hold lapses. */
  expiresInMinutes?: number;
  /** Set for the one booking that has already been moved off the cancelled session. */
  rebookedFrom?: string;
};

const BOOKINGS: BookingSpec[] = [
  // ---- Past: attended, with three no-shows and one cancellation.
  { session: 'p10a', customer: 0, partySize: 2, status: 'attended' },
  { session: 'p10a', customer: 1, partySize: 1, status: 'attended' },
  { session: 'p10b', customer: 2, partySize: 2, status: 'attended' },
  { session: 'p10b', customer: 3, partySize: 3, status: 'no_show' },
  { session: 'p8a', customer: 4, partySize: 1, status: 'attended' },
  { session: 'p8a', customer: 5, partySize: 2, status: 'attended' },
  { session: 'p8b', customer: 6, partySize: 4, status: 'attended' },
  { session: 'p8b', customer: 7, partySize: 2, status: 'cancelled' },
  { session: 'p7a', customer: 8, partySize: 2, status: 'attended' },
  { session: 'p7a', customer: 9, partySize: 3, status: 'no_show' },
  { session: 'p5a', customer: 10, partySize: 2, status: 'attended' },
  { session: 'p5a', customer: 11, partySize: 2, status: 'attended' },
  // The abandoned checkout that was never paid for. Never consumed a seat.
  { session: 'p5a', customer: 12, partySize: 1, status: 'expired' },
  { session: 'p5c', customer: 13, partySize: 2, status: 'attended' },
  { session: 'p5c', customer: 14, partySize: 3, status: 'attended' },
  { session: 'p3a', customer: 15, partySize: 2, status: 'attended' },
  { session: 'p3a', customer: 16, partySize: 1, status: 'no_show' },
  { session: 'p3b', customer: 17, partySize: 2, status: 'attended' },
  { session: 'p3b', customer: 0, partySize: 2, status: 'attended' },
  { session: 'p1a', customer: 1, partySize: 2, status: 'attended' },
  { session: 'p1a', customer: 2, partySize: 1, status: 'attended' },
  { session: 'p1b', customer: 3, partySize: 4, status: 'attended' },

  // ---- The cancelled session. Two still waiting, one already moved to f6a below.
  { session: 'cancelled', customer: 4, partySize: 2, status: 'awaiting_rebook' },
  { session: 'cancelled', customer: 5, partySize: 1, status: 'awaiting_rebook' },

  // ---- Today. t0a sits at 5 of 6 seats, all unmarked, ready to mark live.
  { session: 't0a', customer: 6, partySize: 2, status: 'paid' },
  { session: 't0a', customer: 7, partySize: 2, status: 'paid' },
  { session: 't0a', customer: 8, partySize: 1, status: 'paid' },
  { session: 't0b', customer: 9, partySize: 2, status: 'paid' },
  { session: 't0b', customer: 10, partySize: 3, status: 'paid' },
  { session: 't0c', customer: 11, partySize: 2, status: 'paid' },
  { session: 't0c', customer: 12, partySize: 4, status: 'paid' },

  // ---- Tomorrow. reminderSentAt stays null on these: the reminder button needs work to do.
  { session: 'f1a', customer: 13, partySize: 2, status: 'paid' },
  { session: 'f1a', customer: 14, partySize: 2, status: 'paid' },
  { session: 'f1b', customer: 15, partySize: 3, status: 'paid' },
  { session: 'f2a', customer: 16, partySize: 2, status: 'paid' },

  // ---- f3a: 5 of 6 taken, so the public list reads "1 space left".
  { session: 'f3a', customer: 17, partySize: 2, status: 'paid' },
  { session: 'f3a', customer: 0, partySize: 2, status: 'paid' },
  { session: 'f3a', customer: 1, partySize: 1, status: 'paid' },

  // ---- f4a deliberately has no bookings at all.

  // ---- f6a: the rebook target. Carries the booking moved off the cancelled session.
  { session: 'f6a', customer: 2, partySize: 2, status: 'paid' },
  { session: 'f6a', customer: 3, partySize: 1, status: 'paid' },
  { session: 'f6a', customer: 6, partySize: 2, status: 'paid', rebookedFrom: 'cancelled' },

  { session: 'f7a', customer: 4, partySize: 2, status: 'paid' },
  { session: 'f7a', customer: 5, partySize: 3, status: 'paid' },

  // ---- f9a: a live hold, 20 minutes from lapsing. Occupies seats until it does.
  { session: 'f9a', customer: 7, partySize: 2, status: 'paid' },
  { session: 'f9a', customer: 8, partySize: 2, status: 'pending_payment', expiresInMinutes: 20 },

  { session: 'f11a', customer: 9, partySize: 2, status: 'paid' },
];

async function clear() {
  // FK-safe order: children before parents.
  await prisma.emailLog.deleteMany();
  await prisma.stripeEvent.deleteMany();
  await prisma.sessionCancellation.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.session.deleteMany();
  await prisma.sessionType.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.contactMessage.deleteMany();
}

async function main() {
  await clear();

  const today = todayInLondon();
  const now = new Date();

  const operator = await prisma.operator.create({
    data: {
      name: 'Harbourside Sailing',
      slug: 'harbourside-sailing',
      timezone: 'Europe/London',
      currency: 'GBP',
      contactEmail: 'bookings@harboursidesailing.example.com',
      phone: '01590 000000',
    },
  });

  const typeDefs = [
    {
      slug: TYPE.dinghy,
      name: 'RYA Level 1 Dinghy',
      description: 'Two-day introduction to dinghy sailing. No experience needed, all kit provided.',
      durationMinutes: 240,
      defaultCapacity: 6,
      defaultPricePence: 9500,
      sortOrder: 0,
    },
    {
      slug: TYPE.keelboat,
      name: 'Keelboat Taster',
      description: 'Three hours on a stable keelboat with an instructor. The gentle way in.',
      durationMinutes: 180,
      defaultCapacity: 8,
      defaultPricePence: 6000,
      sortOrder: 1,
    },
    {
      slug: TYPE.rib,
      name: 'Sunset RIB Blast',
      description: 'Ninety minutes out into the Solent at speed. Bring a waterproof.',
      durationMinutes: 90,
      defaultCapacity: 10,
      defaultPricePence: 3500,
      sortOrder: 2,
    },
    {
      slug: TYPE.paddleboard,
      name: 'Paddleboard Hire',
      description: 'Board, leash and buoyancy aid for two hours on the river.',
      durationMinutes: 120,
      defaultCapacity: 12,
      defaultPricePence: 2000,
      sortOrder: 3,
    },
  ];

  const typesBySlug = new Map<string, Awaited<ReturnType<typeof prisma.sessionType.create>>>();
  for (const t of typeDefs) {
    const created = await prisma.sessionType.create({
      data: { ...t, operatorId: operator.id, depositPercent: 50, active: true },
    });
    typesBySlug.set(t.slug, created);
  }

  const customers = [];
  for (const c of CUSTOMERS) {
    customers.push(
      await prisma.customer.create({
        data: {
          operatorId: operator.id,
          name: c.name,
          email: emailFor(c.name), // lowercased on write; never queried case-insensitively
          phone: c.phone,
        },
      }),
    );
  }

  const sessionsByKey = new Map<string, Awaited<ReturnType<typeof prisma.session.create>>>();
  for (const spec of SESSIONS) {
    const type = typesBySlug.get(spec.type)!;
    const startsAt = londonDateTimeToUtc(addDays(today, spec.offset), spec.time);
    const endsAt = new Date(startsAt.getTime() + type.durationMinutes * 60_000);

    const created = await prisma.session.create({
      data: {
        operatorId: operator.id,
        sessionTypeId: type.id,
        startsAt,
        endsAt,
        // Snapshotted from the type's defaults, then independently editable.
        capacity: type.defaultCapacity,
        pricePerPersonPence: type.defaultPricePence,
        status: spec.key === 'cancelled' ? 'cancelled' : 'scheduled',
      },
    });
    sessionsByKey.set(spec.key, created);
  }

  const cancelledSession = sessionsByKey.get('cancelled')!;

  await prisma.sessionCancellation.create({
    data: {
      sessionId: cancelledSession.id,
      reason: 'weather',
      note: 'Force 6 gusting 7 in the Solent',
      cancelledBy: 'admin',
    },
  });

  // Bookings that were notified about the cancellation, for the EmailLog rows below.
  const notified: { bookingId: string; customerId: string; email: string; reference: string }[] = [];

  for (const spec of BOOKINGS) {
    const session = sessionsByKey.get(spec.session)!;
    const sessionSpec = SESSIONS.find((s) => s.key === spec.session)!;
    const type = typesBySlug.get(sessionSpec.type)!;
    const customer = customers[spec.customer];

    const total = totalPence(spec.partySize, session.pricePerPersonPence);
    const deposit = depositPence(spec.partySize, session.pricePerPersonPence, type.depositPercent);

    const isPast = session.startsAt < now;
    const paidLike = spec.status !== 'pending_payment' && spec.status !== 'expired';

    const booking = await prisma.booking.create({
      data: {
        reference: generateBookingReference(),
        operatorId: operator.id,
        sessionId: session.id,
        customerId: customer.id,
        partySize: spec.partySize,
        pricePerPersonPence: session.pricePerPersonPence,
        totalPence: total,
        depositPence: deposit,
        status: spec.status,

        // A hold is the only thing that carries an expiry; everything else has paid.
        expiresAt:
          spec.expiresInMinutes != null
            ? new Date(now.getTime() + spec.expiresInMinutes * 60_000)
            : null,
        paidAt: paidLike ? new Date(session.createdAt.getTime()) : null,
        stripePaymentIntentId: paidLike ? `pi_seed_${generateRebookToken().slice(0, 18)}` : null,

        attendanceMarkedAt:
          spec.status === 'attended' || spec.status === 'no_show' ? session.endsAt : null,
        cancelledAt: spec.status === 'cancelled' ? session.startsAt : null,

        // Still-waiting customers keep a live single-use link; the moved one has spent it.
        rebookToken: spec.status === 'awaiting_rebook' ? generateRebookToken() : null,
        rebookedFromSessionId: spec.rebookedFrom ? cancelledSession.id : null,
        rebookedAt: spec.rebookedFrom ? new Date(cancelledSession.startsAt.getTime() + 3_600_000) : null,

        // Past sessions were reminded the evening before. Tomorrow's deliberately were not.
        reminderSentAt: isPast && paidLike ? new Date(session.startsAt.getTime() - 57_600_000) : null,
      },
    });

    if (spec.status === 'awaiting_rebook' || spec.rebookedFrom) {
      notified.push({
        bookingId: booking.id,
        customerId: customer.id,
        email: customer.email,
        reference: booking.reference,
      });
    }
  }

  // The evidence trail behind "3 customers notified". Written directly, never sent:
  // sessionId is the CANCELLED session even for the customer who has since moved,
  // because that is the session they were notified about.
  for (const n of notified) {
    await prisma.emailLog.create({
      data: {
        type: 'cancellation',
        toEmail: n.email,
        deliveredTo: process.env.DEMO_EMAIL_REDIRECT?.trim() || n.email,
        subject: 'Cancelled: Keelboat Taster',
        status: 'sent',
        providerId: 'local-dev',
        bookingId: n.bookingId,
        sessionId: cancelledSession.id,
        customerId: n.customerId,
      },
    });
  }

  await prisma.contactMessage.createMany({
    data: [
      {
        name: 'Rachel Dunne',
        email: 'rachel@example.com',
        business: 'Dunne Marine Engineering',
        message:
          'We run engine servicing out of Hamble and the diary is still a paper book. Can you do callout slots rather than fixed sessions?',
      },
      {
        name: 'Ian Prosser',
        email: 'ian@example.com',
        business: 'Solent Paddle Co',
        message: 'Interested in the £40/month. How long does setup take if we want it live for Easter?',
      },
    ],
  });

  const rebookable = await prisma.booking.findFirst({
    where: { status: 'awaiting_rebook', rebookToken: { not: null } },
    select: { rebookToken: true },
  });
  const counts = {
    sessions: await prisma.session.count(),
    bookings: await prisma.booking.count(),
    customers: await prisma.customer.count(),
  };

  console.log(
    [
      '',
      `Seeded ${counts.sessions} sessions, ${counts.bookings} bookings, ${counts.customers} customers.`,
      `Today in London is ${today}.`,
      `Cancelled session: ${notified.length} customers notified.`,
      rebookable?.rebookToken ? `Rebook link: /rebook/${rebookable.rebookToken}` : '',
      '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
