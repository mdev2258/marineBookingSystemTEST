/**
 * Demo seed — Harbourside Marine, a services yard.
 *
 * Everything is positioned relative to "now" in Europe/London at run time --
 * there is not a single hardcoded date in here. Re-seed shortly before a demo
 * and the diary is populated for that day, not for the day this was written.
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
import { depositPence } from '../src/lib/money';
import { generateBookingReference, generateRebookToken } from '../src/lib/reference';

const prisma = new PrismaClient();

const SERVICE = {
  liftout: 'liftout-and-pressure-wash',
  liftin: 'lift-in-and-rig-check',
  survey: 'pre-purchase-survey',
  rig: 'rig-inspection',
  shipwright: 'shipwright-hull-repair',
} as const;

type ServiceSlug = (typeof SERVICE)[keyof typeof SERVICE];

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

/** owner is an index into CUSTOMERS. Two owners deliberately have two boats. */
const VESSELS = [
  { owner: 0, name: 'Kittiwake', make: 'Westerly Konsort', lengthMetres: 8.8, keelType: 'Bilge', berth: 'Pontoon C, berth 14' },
  { owner: 1, name: 'Morning Tide', make: 'Sadler 32', lengthMetres: 9.7, keelType: 'Fin', berth: 'Pontoon A, berth 3' },
  { owner: 2, name: 'Bramble', make: 'Contessa 32', lengthMetres: 9.8, keelType: 'Long', berth: 'Ashore, yard row 2' },
  { owner: 3, name: 'Osprey', make: 'Moody 36', lengthMetres: 10.9, keelType: 'Fin', berth: 'Pontoon D, berth 21' },
  { owner: 4, name: 'Solent Mist', make: 'Jeanneau Sun Odyssey 349', lengthMetres: 10.3, keelType: 'Fin', berth: 'Pontoon B, berth 8' },
  { owner: 5, name: 'Perseverance', make: 'Hallberg-Rassy 34', lengthMetres: 10.4, keelType: 'Long', berth: 'Pontoon A, berth 11' },
  { owner: 6, name: 'Halcyon', make: 'Bavaria 38', lengthMetres: 11.5, keelType: 'Fin', berth: 'Pontoon D, berth 2' },
  { owner: 7, name: 'Windflower', make: 'Fairline Targa 34', lengthMetres: 10.6, keelType: 'Planing', berth: 'Pontoon E, berth 5' },
  { owner: 8, name: 'Gannet', make: 'Dufour 375', lengthMetres: 11.2, keelType: 'Fin', berth: 'Pontoon B, berth 19' },
  { owner: 9, name: 'Teal', make: 'Westerly Griffon', lengthMetres: 8.2, keelType: 'Bilge', berth: 'Ashore, yard row 4' },
  { owner: 10, name: 'Cormorant', make: 'Princess 42', lengthMetres: 12.8, keelType: 'Planing', berth: 'Pontoon E, berth 1' },
  { owner: 11, name: 'Mistral', make: 'Beneteau Oceanis 34', lengthMetres: 10.2, keelType: 'Lifting', berth: 'Pontoon C, berth 7' },
  { owner: 12, name: 'Puffin', make: 'Cornish Crabber 24', lengthMetres: 7.3, keelType: 'Long', berth: 'Swinging mooring 12' },
  { owner: 13, name: 'Whimbrel', make: 'Rustler 36', lengthMetres: 11.0, keelType: 'Long', berth: 'Pontoon A, berth 17' },
  { owner: 14, name: 'Redshank', make: 'Hanse 345', lengthMetres: 10.4, keelType: 'Fin', berth: 'Pontoon D, berth 9' },
  { owner: 15, name: 'Curlew', make: 'Nicholson 32', lengthMetres: 9.8, keelType: 'Long', berth: 'Ashore, yard row 1' },
  { owner: 16, name: 'Shearwater', make: 'Southerly 110', lengthMetres: 11.2, keelType: 'Lifting', berth: 'Pontoon B, berth 4' },
  { owner: 17, name: 'Sea Urchin', make: 'Cobra 850', lengthMetres: 8.5, keelType: 'Fin', berth: 'Swinging mooring 6' },
  // Second boats.
  { owner: 0, name: 'Little Auk', make: 'Drascombe Lugger', lengthMetres: 5.7, keelType: 'Lifting', berth: 'Dinghy park 22' },
  { owner: 10, name: 'Gadwall', make: 'Nordhavn 40', lengthMetres: 12.2, keelType: 'Displacement', berth: 'Pontoon E, berth 3' },
];

/** All @example.com, so a stray send with no DEMO_EMAIL_REDIRECT still cannot reach anyone. */
function emailFor(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').join('.')}@example.com`;
}

type SessionSpec = { key: string; offset: number; time: string; service: ServiceSlug; notes?: string };

const SESSIONS: SessionSpec[] = [
  // ---- Past. Gaps at -9, -6, -4 and -2 so the day view has believable empty days.
  { key: 'p10a', offset: -10, time: '08:30', service: SERVICE.liftout, notes: 'HW Lymington 09:10' },
  { key: 'p10b', offset: -10, time: '13:00', service: SERVICE.survey },
  { key: 'p8a', offset: -8, time: '09:00', service: SERVICE.rig },
  { key: 'p8b', offset: -8, time: '14:00', service: SERVICE.liftout, notes: 'HW Lymington 14:40' },
  { key: 'p7a', offset: -7, time: '08:00', service: SERVICE.shipwright },
  { key: 'p5a', offset: -5, time: '09:30', service: SERVICE.liftout, notes: 'HW Lymington 10:05' },
  { key: 'cancelled', offset: -5, time: '13:30', service: SERVICE.liftin, notes: 'HW Lymington 14:15' },
  { key: 'p5c', offset: -5, time: '15:00', service: SERVICE.rig },
  { key: 'p3a', offset: -3, time: '09:00', service: SERVICE.survey },
  { key: 'p3b', offset: -3, time: '14:30', service: SERVICE.liftout, notes: 'HW Lymington 15:20' },
  { key: 'p1a', offset: -1, time: '08:30', service: SERVICE.liftin, notes: 'HW Lymington 09:00' },
  { key: 'p1b', offset: -1, time: '13:00', service: SERVICE.rig },

  // ---- Today. t0a is the one marked off in front of the prospect.
  { key: 't0a', offset: 0, time: '08:30', service: SERVICE.liftout, notes: 'HW Lymington 09:15' },
  { key: 't0b', offset: 0, time: '11:00', service: SERVICE.survey },
  { key: 't0c', offset: 0, time: '15:00', service: SERVICE.rig },

  // ---- Future. +1 is deliberately un-reminded so "Send reminders now" does something.
  { key: 'f1a', offset: 1, time: '08:00', service: SERVICE.liftout, notes: 'HW Lymington 08:35' },
  { key: 'f1b', offset: 1, time: '13:00', service: SERVICE.shipwright },
  { key: 'f2a', offset: 2, time: '09:30', service: SERVICE.rig },
  { key: 'f3a', offset: 3, time: '10:00', service: SERVICE.survey }, // capacity 2, 1 taken -> "1 space left"
  { key: 'f4a', offset: 4, time: '08:30', service: SERVICE.liftout, notes: 'HW Lymington 09:05' }, // empty
  { key: 'f6a', offset: 6, time: '13:30', service: SERVICE.liftin, notes: 'HW Lymington 14:00' }, // rebook target
  { key: 'f7a', offset: 7, time: '09:00', service: SERVICE.rig },
  { key: 'f9a', offset: 9, time: '08:30', service: SERVICE.liftout, notes: 'HW Lymington 09:20' }, // live hold
  { key: 'f11a', offset: 11, time: '10:00', service: SERVICE.survey },
];

type BookingSpec = {
  /** Omit for an unscheduled job: an enquiry the yard has not put in the diary yet. */
  session?: string;
  vessel: number;
  status: string;
  /** The agreed or offered price, in whole pounds. Omit while still an enquiry. */
  quotedPounds?: number;
  requestNotes?: string;
  quoteNotes?: string;
  expiresInMinutes?: number;
  rebookedFrom?: string;
};

const BOOKINGS: BookingSpec[] = [
  // ---- Past work, done and invoiced.
  { session: 'p10a', vessel: 0, status: 'completed', quotedPounds: 280 },
  { session: 'p10b', vessel: 2, status: 'completed', quotedPounds: 650 },
  { session: 'p8a', vessel: 3, status: 'completed', quotedPounds: 340 },
  { session: 'p8a', vessel: 4, status: 'completed', quotedPounds: 340 },
  { session: 'p8b', vessel: 5, status: 'completed', quotedPounds: 295 },
  { session: 'p7a', vessel: 6, status: 'completed', quotedPounds: 1450 },
  // The boat that was not ready when the crane turned up.
  { session: 'p5a', vessel: 7, status: 'no_show', quotedPounds: 310 },
  { session: 'p5c', vessel: 8, status: 'completed', quotedPounds: 340 },
  { session: 'p5c', vessel: 9, status: 'completed', quotedPounds: 320 },
  { session: 'p3a', vessel: 10, status: 'completed', quotedPounds: 780 },
  { session: 'p3b', vessel: 11, status: 'completed', quotedPounds: 285 },
  { session: 'p1a', vessel: 12, status: 'completed', quotedPounds: 260 },
  { session: 'p1b', vessel: 13, status: 'completed', quotedPounds: 350 },
  // A deposit that was never paid; the hold lapsed and the slot went back out.
  { session: 'p5a', vessel: 14, status: 'expired', quotedPounds: 290 },

  // ---- The cancelled lift-in. Two still waiting, one already moved to f6a below.
  { session: 'cancelled', vessel: 15, status: 'awaiting_rebook', quotedPounds: 275 },
  { session: 'cancelled', vessel: 16, status: 'awaiting_rebook', quotedPounds: 300 },

  // ---- Today. Booked in, nothing marked off yet: this is the live demo moment.
  { session: 't0a', vessel: 1, status: 'paid', quotedPounds: 285 },
  { session: 't0b', vessel: 17, status: 'paid', quotedPounds: 690 },
  { session: 't0b', vessel: 18, status: 'paid', quotedPounds: 420 },
  { session: 't0c', vessel: 19, status: 'paid', quotedPounds: 360 },

  // ---- Tomorrow. reminderSentAt stays null: the reminder button needs work to do.
  { session: 'f1a', vessel: 2, status: 'paid', quotedPounds: 295 },
  { session: 'f1b', vessel: 3, status: 'paid', quotedPounds: 1680 },
  { session: 'f2a', vessel: 4, status: 'paid', quotedPounds: 340 },

  // ---- f3a is a survey day with room for two; one taken -> "1 space left".
  { session: 'f3a', vessel: 5, status: 'paid', quotedPounds: 720 },

  // ---- f4a deliberately has no bookings at all.

  // ---- f6a: the rebook target. Carries the job moved off the cancelled slot.
  { session: 'f6a', vessel: 6, status: 'paid', quotedPounds: 310 },
  { session: 'f6a', vessel: 15, status: 'paid', quotedPounds: 275, rebookedFrom: 'cancelled' },

  { session: 'f7a', vessel: 8, status: 'paid', quotedPounds: 340 },
  { session: 'f11a', vessel: 9, status: 'paid', quotedPounds: 660 },

  // ---- f9a: a deposit request 20 minutes from lapsing. Holds the slot until it does.
  { session: 'f9a', vessel: 10, status: 'pending_payment', quotedPounds: 320, expiresInMinutes: 20 },

  // ---- The yard's inbox: work requested, not yet priced. No slot, no deposit.
  {
    vessel: 12,
    status: 'enquiry',
    requestNotes:
      'Rudder feels stiff on the helm since we dried out. Could you take a look next time she is ashore?',
  },
  {
    vessel: 13,
    status: 'enquiry',
    requestNotes: 'Due a lift and scrub before the winter. Any tide that suits you before the end of the month.',
  },
  {
    vessel: 17,
    status: 'enquiry',
    requestNotes: 'Buying her subject to survey — need a full pre-purchase done in the next fortnight if you can.',
  },

  // ---- Quotes out, waiting on the customer. These carry a live accept link.
  {
    vessel: 11,
    status: 'quoted',
    quotedPounds: 1240,
    requestNotes: 'Soft patch in the deck around the forehatch, want it made good properly.',
    quoteNotes: 'Cut out and relaminate approx 0.5m², fair and gelcoat to match. Excludes any core replacement beyond 0.5m², which we would come back to you on.',
  },
  {
    vessel: 14,
    status: 'quoted',
    quotedPounds: 385,
    requestNotes: 'Standing rigging is 11 years old. Inspection and a written report for insurance.',
    quoteNotes: 'Full rig inspection aloft, swage and terminal check, written report for underwriters. Does not include any replacement wire.',
  },

  // ---- One that went the other way, so the pipeline is not unrealistically clean.
  {
    vessel: 19,
    status: 'declined',
    quotedPounds: 2100,
    requestNotes: 'Osmosis treatment quote please.',
    quoteNotes: 'Peel, dry, epoxy schedule and antifoul. Six to eight weeks ashore.',
  },
];

async function clear() {
  // FK-safe order: children before parents.
  await prisma.emailLog.deleteMany();
  await prisma.stripeEvent.deleteMany();
  await prisma.sessionCancellation.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.vessel.deleteMany();
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
      name: 'Harbourside Marine',
      slug: 'harbourside-marine',
      timezone: 'Europe/London',
      currency: 'GBP',
      contactEmail: 'yard@harboursidemarine.example.com',
      phone: '01590 000000',
    },
  });

  const serviceDefs = [
    {
      slug: SERVICE.liftout,
      name: 'Liftout & pressure wash',
      description:
        'Crane out, pressure wash off and chock ashore. Priced on length and keel configuration.',
      durationMinutes: 90,
      defaultCapacity: 1,
      tideDependent: true,
      sortOrder: 0,
    },
    {
      slug: SERVICE.liftin,
      name: 'Lift-in & rig check',
      description: 'Back in the water, mast stepped and rig tuned, engine run and checked.',
      durationMinutes: 90,
      defaultCapacity: 1,
      tideDependent: true,
      sortOrder: 1,
    },
    {
      slug: SERVICE.survey,
      name: 'Pre-purchase survey',
      description:
        'Full structural and systems survey with a written report, suitable for insurance and finance.',
      durationMinutes: 240,
      defaultCapacity: 2,
      tideDependent: false,
      sortOrder: 2,
    },
    {
      slug: SERVICE.rig,
      name: 'Rig inspection',
      description: 'Inspection aloft, swage and terminal check, written report for underwriters.',
      durationMinutes: 120,
      defaultCapacity: 2,
      tideDependent: false,
      sortOrder: 3,
    },
    {
      slug: SERVICE.shipwright,
      name: 'Shipwright & hull repair',
      description: 'Laminate, timber and gelcoat work. Quoted after we have seen the damage.',
      durationMinutes: 480,
      defaultCapacity: 1,
      tideDependent: false,
      sortOrder: 4,
    },
  ];

  const servicesBySlug = new Map<string, Awaited<ReturnType<typeof prisma.sessionType.create>>>();
  for (const s of serviceDefs) {
    servicesBySlug.set(
      s.slug,
      await prisma.sessionType.create({
        data: { ...s, operatorId: operator.id, depositPercent: 50, active: true },
      }),
    );
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

  const vessels = [];
  for (const v of VESSELS) {
    vessels.push(
      await prisma.vessel.create({
        data: {
          operatorId: operator.id,
          customerId: customers[v.owner].id,
          name: v.name,
          make: v.make,
          lengthMetres: v.lengthMetres,
          keelType: v.keelType,
          berth: v.berth,
        },
      }),
    );
  }

  const sessionsByKey = new Map<string, Awaited<ReturnType<typeof prisma.session.create>>>();
  for (const spec of SESSIONS) {
    const service = servicesBySlug.get(spec.service)!;
    const startsAt = londonDateTimeToUtc(addDays(today, spec.offset), spec.time);

    sessionsByKey.set(
      spec.key,
      await prisma.session.create({
        data: {
          operatorId: operator.id,
          sessionTypeId: service.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + service.durationMinutes * 60_000),
          // Snapshotted from the service default, then independently editable.
          capacity: service.defaultCapacity,
          notes: spec.notes,
          status: spec.key === 'cancelled' ? 'cancelled' : 'scheduled',
        },
      }),
    );
  }

  const cancelledSession = sessionsByKey.get('cancelled')!;

  await prisma.sessionCancellation.create({
    data: {
      sessionId: cancelledSession.id,
      reason: 'weather',
      note: 'Force 6 gusting 7 in the Solent — crane not safe to work',
      cancelledBy: 'admin',
    },
  });

  const notified: { bookingId: string; customerId: string; email: string }[] = [];
  let liveQuoteToken: string | null = null;

  for (const spec of BOOKINGS) {
    const session = spec.session ? sessionsByKey.get(spec.session)! : null;
    const vessel = vessels[spec.vessel];
    const customerId = vessel.customerId;

    const sessionSpec = spec.session ? SESSIONS.find((s) => s.key === spec.session)! : null;
    const service = sessionSpec ? servicesBySlug.get(sessionSpec.service)! : null;

    const quoted = spec.quotedPounds != null ? spec.quotedPounds * 100 : null;
    // A deposit exists only once the customer has accepted; see money.ts.
    const accepted = ['pending_payment', 'paid', 'completed', 'no_show', 'awaiting_rebook', 'expired'].includes(
      spec.status,
    );
    const deposit =
      accepted && quoted != null ? depositPence(quoted, service?.depositPercent ?? 50) : null;

    const settled = ['paid', 'completed', 'no_show', 'awaiting_rebook'].includes(spec.status);
    const isPast = session ? session.startsAt < now : false;

    const quoteToken = spec.status === 'quoted' ? generateRebookToken() : null;
    if (quoteToken && !liveQuoteToken) liveQuoteToken = quoteToken;

    const booking = await prisma.booking.create({
      data: {
        reference: generateBookingReference(),
        operatorId: operator.id,
        sessionId: session?.id ?? null,
        customerId,
        vesselId: vessel.id,

        requestNotes: spec.requestNotes,
        quotedPence: quoted,
        quotedAt: quoted != null ? new Date(now.getTime() - 3 * 86_400_000) : null,
        quoteNotes: spec.quoteNotes,
        acceptedAt: accepted ? new Date(now.getTime() - 2 * 86_400_000) : null,
        depositPence: deposit,

        status: spec.status,
        expiresAt:
          spec.expiresInMinutes != null
            ? new Date(now.getTime() + spec.expiresInMinutes * 60_000)
            : null,
        paidAt: settled ? new Date(now.getTime() - 86_400_000) : null,
        stripePaymentIntentId: settled ? `pi_seed_${generateRebookToken().slice(0, 18)}` : null,

        completedAt: spec.status === 'completed' && session ? session.endsAt : null,
        attendanceMarkedAt:
          (spec.status === 'completed' || spec.status === 'no_show') && session ? session.endsAt : null,

        rebookToken: spec.status === 'awaiting_rebook' ? generateRebookToken() : null,
        rebookedFromSessionId: spec.rebookedFrom ? cancelledSession.id : null,
        rebookedAt: spec.rebookedFrom
          ? new Date(cancelledSession.startsAt.getTime() + 3_600_000)
          : null,
        quoteToken,

        // Past jobs were reminded the evening before. Tomorrow's deliberately were not.
        reminderSentAt:
          isPast && settled && session ? new Date(session.startsAt.getTime() - 57_600_000) : null,
      },
    });

    if (spec.status === 'awaiting_rebook' || spec.rebookedFrom) {
      notified.push({
        bookingId: booking.id,
        customerId,
        email: customers.find((c) => c.id === customerId)!.email,
      });
    }
  }

  // The evidence trail behind "3 customers notified". Written directly, never sent:
  // sessionId is the CANCELLED slot even for the customer who has since moved,
  // because that is the slot they were notified about.
  for (const n of notified) {
    await prisma.emailLog.create({
      data: {
        type: 'cancellation',
        toEmail: n.email,
        deliveredTo: process.env.DEMO_EMAIL_REDIRECT?.trim() || n.email,
        subject: 'Cancelled: Lift-in & rig check',
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
          'We run engine servicing out of Hamble and the diary is still a paper book. Can you do callout slots rather than fixed ones?',
      },
      {
        name: 'Ian Prosser',
        email: 'ian@example.com',
        business: 'Solent Rigging',
        message: 'Interested in the £40/month. How long does setup take if we want it live before the winter lift season?',
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
    vessels: await prisma.vessel.count(),
    enquiries: await prisma.booking.count({ where: { status: 'enquiry' } }),
    quoted: await prisma.booking.count({ where: { status: 'quoted' } }),
  };

  console.log(
    [
      '',
      `Seeded ${counts.sessions} slots, ${counts.bookings} jobs, ${counts.vessels} vessels.`,
      `Today in London is ${today}.`,
      `Inbox: ${counts.enquiries} awaiting a quote, ${counts.quoted} quotes out.`,
      `Cancelled slot: ${notified.length} customers notified.`,
      rebookable?.rebookToken ? `Rebook link:  /rebook/${rebookable.rebookToken}` : '',
      liveQuoteToken ? `Quote link:   /quote/${liveQuoteToken}` : '',
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
