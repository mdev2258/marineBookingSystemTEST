/**
 * Demo seed — Harbourside Marine Services, a two-person rigging-and-
 * engineering firm working Chichester Harbour and the eastern Solent.
 *
 * Everything is positioned relative to "now" in Europe/London at run time --
 * there is not a single hardcoded date in here. Re-seed shortly before a demo
 * and the board reads for that day, not for the day this was written.
 *
 * Re-runnable: every table is cleared first, in FK-safe order.
 *
 * This script MUST NEVER SEND EMAIL. EmailLog rows are written directly,
 * because screens count them ("8 owners notified") and that number has to be
 * right in a seeded demo that has never had a Resend key.
 *
 * See ANALYSIS-TRADES.md §8 for what this is required to contain, and
 * `npm run check` for the assertions that hold it to that.
 */

import { PrismaClient } from '@prisma/client';
// Relative imports, not the "@/" alias: tsx runs this outside Next's resolver.
import { addDays, addMonths, addYears, todayInLondon, londonDateTimeToUtc } from '../src/lib/time';
import { generateBookingReference, generateRebookToken } from '../src/lib/reference';

const prisma = new PrismaClient();

const TODAY = todayInLondon();
const LABOUR = 5500; // £55/h, the business default

/** £ -> pence, for readability below. */
const p = (pounds: number) => Math.round(pounds * 100);

// ---------------------------------------------------------------------------
// Places. A boat MOVES between these; that is the whole difference between
// this and a plumber's address book.
// ---------------------------------------------------------------------------

const PLACES = [
  { key: 'hard', name: 'Harbour yard (hard standing)', shortName: 'HY hard', kind: 'yard', notes: 'Book the crane through the yard office, 48h notice.' },
  { key: 'pontoon', name: 'Harbour yard (pontoons)', shortName: 'HY pontoon', kind: 'marina', notes: null },
  { key: 'bosham', name: 'Bosham mooring', shortName: 'Bosham', kind: 'mooring', notes: 'Tender from the hard. Dries at springs.' },
  { key: 'hayling', name: 'Hayling half-tide', shortName: 'Hayling', kind: 'mooring', notes: null },
  { key: 'itchenor', name: 'Itchenor drying mooring', shortName: 'Itchenor', kind: 'drying_mooring', notes: 'Only reachable either side of HW. Check the tide before setting off.' },
  { key: 'workshop', name: 'Workshop', shortName: 'Workshop', kind: 'other', notes: 'Bench work — furlers, pumps, alternators.' },
] as const;

type PlaceKey = (typeof PLACES)[number]['key'];

// ---------------------------------------------------------------------------
// Owners. All @example.com, so even a missing DEMO_EMAIL_REDIRECT cannot
// reach a real person.
// ---------------------------------------------------------------------------

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
  { name: 'Ruth Gillingham', phone: '07700 900375' },
  { name: 'Peter Vane', phone: '07700 900397' },
];

/**
 * 25 boats: 1970s-2000s production yachts typical of the harbour, plus two
 * motor boats. `owner` indexes CUSTOMERS; three owners deliberately have two
 * boats, because the boat file has to cope with it.
 *
 * `rigYears` / `engineMonths` position the equipment ages that make reminders
 * fire. At least four boats carry standing rigging 10+ years old and five
 * engines are past their service interval -- §8 requires both.
 */
const VESSELS: {
  key: string;
  owner: number;
  name: string;
  make: string;
  model: string;
  year: number;
  loa: number;
  keel: string;
  place: PlaceKey;
  rigYears?: number;
  engineMonths?: number;
  engineMake?: string;
}[] = [
  { key: 'kittiwake', owner: 0, name: 'Kittiwake', make: 'Westerly', model: 'Konsort', year: 1981, loa: 8.8, keel: 'Bilge', place: 'pontoon', rigYears: 13, engineMonths: 16, engineMake: 'Volvo Penta MD2020' },
  { key: 'morningtide', owner: 1, name: 'Morning Tide', make: 'Sadler', model: '32', year: 1985, loa: 9.7, keel: 'Fin', place: 'hard', rigYears: 7, engineMonths: 5, engineMake: 'Yanmar 2GM20' },
  { key: 'bramble', owner: 2, name: 'Bramble', make: 'Contessa', model: '32', year: 1979, loa: 9.8, keel: 'Long', place: 'bosham', rigYears: 11, engineMonths: 22, engineMake: 'Beta Marine 20' },
  { key: 'osprey', owner: 3, name: 'Osprey', make: 'Moody', model: '36', year: 1990, loa: 10.9, keel: 'Fin', place: 'pontoon', rigYears: 6, engineMonths: 9, engineMake: 'Volvo Penta MD22' },
  { key: 'halcyon', owner: 4, name: 'Halcyon', make: 'Hunter', model: 'Legend 306', year: 1992, loa: 9.2, keel: 'Twin lifting', place: 'hard', rigYears: 12, engineMonths: 19, engineMake: 'Yanmar 2GM20F' },
  { key: 'seaurchin', owner: 5, name: 'Sea Urchin', make: 'Beneteau', model: 'Oceanis 350', year: 1993, loa: 10.4, keel: 'Fin', place: 'itchenor', rigYears: 9, engineMonths: 3, engineMake: 'Volvo Penta 2003' },
  { key: 'wildgoose', owner: 6, name: 'Wild Goose', make: 'Jeanneau', model: 'Sun Odyssey 32', year: 1998, loa: 9.9, keel: 'Fin', place: 'pontoon', rigYears: 4, engineMonths: 7, engineMake: 'Yanmar 2GM20F' },
  { key: 'tamarisk', owner: 7, name: 'Tamarisk', make: 'Dehler', model: '34', year: 1996, loa: 10.2, keel: 'Fin', place: 'hayling', rigYears: 14, engineMonths: 11, engineMake: 'Volvo Penta MD2030' },
  { key: 'curlew', owner: 8, name: 'Curlew', make: 'Westerly', model: 'Griffon', year: 1983, loa: 8.0, keel: 'Bilge', place: 'bosham', rigYears: 8, engineMonths: 26, engineMake: 'Bukh DV20' },
  { key: 'saltwind', owner: 9, name: 'Saltwind', make: 'Moody', model: '31', year: 1987, loa: 9.4, keel: 'Fin', place: 'hard', rigYears: 10, engineMonths: 4, engineMake: 'Yanmar 3GM30' },
  { key: 'marlin', owner: 10, name: 'Marlin', make: 'Sadler', model: '29', year: 1982, loa: 8.8, keel: 'Bilge', place: 'pontoon', rigYears: 5, engineMonths: 14, engineMake: 'Volvo Penta MD7A' },
  { key: 'pipit', owner: 11, name: 'Pipit', make: 'Contessa', model: '26', year: 1975, loa: 7.9, keel: 'Long', place: 'itchenor', rigYears: 16, engineMonths: 2, engineMake: 'Yanmar 1GM10' },
  { key: 'greylag', owner: 12, name: 'Greylag', make: 'Hunter', model: 'Channel 31', year: 1989, loa: 9.4, keel: 'Fin', place: 'pontoon', rigYears: 3, engineMonths: 6, engineMake: 'Volvo Penta 2002' },
  { key: 'sirocco', owner: 13, name: 'Sirocco', make: 'Beneteau', model: 'First 285', year: 1988, loa: 8.6, keel: 'Fin', place: 'hard', rigYears: 9, engineMonths: 21, engineMake: 'Volvo Penta MD2010' },
  { key: 'petrel', owner: 14, name: 'Petrel', make: 'Jeanneau', model: 'Sun Fizz', year: 1981, loa: 11.6, keel: 'Fin', place: 'pontoon', rigYears: 15, engineMonths: 8, engineMake: 'Perkins 4108' },
  { key: 'skua', owner: 15, name: 'Skua', make: 'Westerly', model: 'Fulmar', year: 1986, loa: 9.8, keel: 'Fin', place: 'bosham', rigYears: 2, engineMonths: 13, engineMake: 'Volvo Penta 2003' },
  { key: 'lodestar', owner: 16, name: 'Lodestar', make: 'Moody', model: '346', year: 1991, loa: 10.5, keel: 'Fin', place: 'pontoon', rigYears: 7, engineMonths: 1, engineMake: 'Yanmar 3GM30F' },
  { key: 'thistle', owner: 17, name: 'Thistle', make: 'Sadler', model: '34', year: 1988, loa: 10.4, keel: 'Fin', place: 'hayling', rigYears: 6, engineMonths: 17, engineMake: 'Volvo Penta MD22' },
  { key: 'gannet', owner: 18, name: 'Gannet', make: 'Dehler', model: '31', year: 1994, loa: 9.4, keel: 'Fin', place: 'hard', rigYears: 11, engineMonths: 10, engineMake: 'Yanmar 2GM20F' },
  { key: 'whimbrel', owner: 19, name: 'Whimbrel', make: 'Hunter', model: 'Horizon 272', year: 1995, loa: 8.3, keel: 'Bilge', place: 'itchenor', rigYears: 5, engineMonths: 23, engineMake: 'Volvo Penta MD2010' },
  // Owners with a second boat.
  { key: 'redshank', owner: 0, name: 'Redshank', make: 'Westerly', model: 'Centaur', year: 1977, loa: 7.9, keel: 'Bilge', place: 'bosham', rigYears: 18, engineMonths: 12, engineMake: 'Volvo Penta MD2B' },
  { key: 'ternagain', owner: 4, name: 'Tern Again', make: 'Contessa', model: '28', year: 1984, loa: 8.5, keel: 'Fin', place: 'hard', rigYears: 4, engineMonths: 15, engineMake: 'Yanmar 2GM' },
  { key: 'bosunsbird', owner: 5, name: "Bosun's Bird", make: 'Beneteau', model: 'Oceanis 311', year: 2001, loa: 9.5, keel: 'Fin', place: 'pontoon', rigYears: 8, engineMonths: 5, engineMake: 'Volvo Penta 2020' },
  // Two motor boats: no rig at all, so nothing may assume a mast.
  { key: 'jolyroger', owner: 9, name: 'Jolly Roger', make: 'Fairline', model: 'Targa 34', year: 1999, loa: 10.4, keel: 'Planing', place: 'pontoon', engineMonths: 18, engineMake: 'Volvo Penta KAD42' },
  { key: 'harbourpilot', owner: 13, name: 'Harbour Pilot', make: 'Orkney', model: 'Fastliner 19', year: 2004, loa: 5.8, keel: 'Planing', place: 'hard', engineMonths: 20, engineMake: 'Mariner 60' },
];

async function clear() {
  // FK-safe order: children before parents.
  await prisma.emailLog.deleteMany();
  await prisma.stripeEvent.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.visit.deleteMany();
  await prisma.partOrder.deleteMany();
  await prisma.variation.deleteMany();
  await prisma.estimate.deleteMany();
  await prisma.quoteLineItem.deleteMany();
  await prisma.sessionCancellation.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.vesselMove.deleteMany();
  await prisma.vessel.deleteMany();
  await prisma.session.deleteMany();
  await prisma.sessionType.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.place.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.contactMessage.deleteMany();
}

async function main() {
  await clear();

  // -------------------------------------------------------------------------
  // The business
  // -------------------------------------------------------------------------

  const op = await prisma.operator.create({
    data: {
      name: 'Harbourside Marine Services',
      slug: 'harbourside-marine-services',
      ownerName: 'Dave Pascoe',
      contactEmail: 'dave@harbourside.example',
      phone: '07700 900001',
      tradeTypes: 'rigging,engineering',
      // Under the threshold, so the word VAT must not appear anywhere in the
      // app while this is false. Flip it to exercise the other path.
      vatRegistered: false,
      defaultLabourRatePence: LABOUR,
      invoicePrefix: 'HMS-',
      nextInvoiceNumber: 4, // three invoices are seeded below
      paymentTermsDays: 14,
      bankDetailsText: 'Harbourside Marine Services · Sort 12-34-56 · Acct 12345678',
    },
  });

  const places: Record<string, string> = {};
  for (const [i, pl] of PLACES.entries()) {
    const row = await prisma.place.create({
      data: {
        operatorId: op.id,
        name: pl.name,
        shortName: pl.shortName,
        kind: pl.kind,
        notes: pl.notes,
        sortOrder: i,
      },
    });
    places[pl.key] = row.id;
  }

  // -------------------------------------------------------------------------
  // Owners and boats
  // -------------------------------------------------------------------------

  const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`;

  const customers: string[] = [];
  for (const c of CUSTOMERS) {
    const row = await prisma.customer.create({
      data: {
        operatorId: op.id,
        name: c.name,
        email: emailFor(c.name),
        phone: c.phone,
      },
    });
    customers.push(row.id);
  }

  const vessels: Record<string, string> = {};
  const rigEquipment: Record<string, string> = {};
  const engineEquipment: Record<string, string> = {};

  for (const v of VESSELS) {
    const row = await prisma.vessel.create({
      data: {
        operatorId: op.id,
        customerId: customers[v.owner],
        name: v.name,
        make: v.make,
        model: v.model,
        year: v.year,
        lengthMetres: v.loa,
        keelType: v.keel,
        currentPlaceId: places[v.place],
        ownerToken: generateRebookToken(),
      },
    });
    vessels[v.key] = row.id;

    if (v.rigYears != null) {
      const rig = await prisma.equipment.create({
        data: {
          vesselId: row.id,
          kind: 'standing_rigging',
          make: '1x19 stainless, swaged',
          installedOn: addYears(TODAY, -v.rigYears),
          notes: v.rigYears >= 10 ? 'Insurer asked about age at last renewal.' : null,
        },
      });
      rigEquipment[v.key] = rig.id;
    }

    if (v.engineMonths != null) {
      const engine = await prisma.equipment.create({
        data: {
          vesselId: row.id,
          kind: v.key === 'harbourpilot' ? 'outboard' : 'engine',
          make: v.engineMake ?? null,
          // Annual service is the norm on these, so anything past 12 months is
          // due and anything past ~18 is the conversation that sells a job.
          serviceIntervalMonths: 12,
          lastServicedOn: addMonths(TODAY, -v.engineMonths),
          hours: 900 + v.engineMonths * 17,
          hoursRecordedOn: addMonths(TODAY, -v.engineMonths),
        },
      });
      engineEquipment[v.key] = engine.id;
    }
  }

  // A boat that came off the mooring onto the hard, so the boat file has a
  // move to show and "where has this been" is a real question.
  await prisma.vesselMove.create({
    data: {
      vesselId: vessels.halcyon,
      movedOn: addDays(TODAY, -34),
      fromName: 'Bosham mooring',
      toName: 'Harbour yard (hard standing)',
      note: 'Lifted for the pre-purchase survey list.',
    },
  });

  // -------------------------------------------------------------------------
  // The board
  // -------------------------------------------------------------------------

  let seq = 0;
  async function job(input: {
    vessel?: string;
    column: string;
    title: string;
    place?: PlaceKey;
    waitingReason?: string;
    waitingUntil?: string;
    plannedOn?: string;
    requestNotes?: string;
    daysInColumn?: number;
    quotedPence?: number;
    acceptedDaysAgo?: number;
  }) {
    seq += 1;
    const v = input.vessel ? VESSELS.find((x) => x.key === input.vessel) : undefined;
    return prisma.booking.create({
      data: {
        reference: generateBookingReference('HMS'),
        operatorId: op.id,
        vesselId: input.vessel ? vessels[input.vessel] : null,
        customerId: v ? customers[v.owner] : null,
        title: input.title,
        requestNotes: input.requestNotes ?? null,
        column: input.column,
        waitingReason: input.waitingReason ?? null,
        waitingUntil: input.waitingUntil ?? null,
        plannedOn: input.plannedOn ?? null,
        placeId: input.place ? places[input.place] : v ? places[v.place] : null,
        position: seq * 100,
        columnChangedAt: londonDateTimeToUtc(addDays(TODAY, -(input.daysInColumn ?? 1)), '09:00'),
        // Backdated, or the timeline reads "job raised today, estimate sent
        // four days ago". createdAt defaults to now(), and every other date on
        // a seeded job is relative to TODAY, so it has to be pushed back
        // behind the oldest thing that happened to it.
        createdAt: londonDateTimeToUtc(
          addDays(
            TODAY,
            -(Math.max(
              input.daysInColumn ?? 1,
              input.acceptedDaysAgo ?? 0,
              input.quotedPence ? 6 : 0,
            ) + 3),
          ),
          '08:00',
        ),
        quotedPence: input.quotedPence ?? null,
        quotedAt: input.quotedPence ? londonDateTimeToUtc(addDays(TODAY, -6), '17:00') : null,
        acceptedAt:
          input.acceptedDaysAgo != null
            ? londonDateTimeToUtc(addDays(TODAY, -input.acceptedDaysAgo), '18:30')
            : null,
        // The parked yard lifecycle. Nothing on the board reads this; it is set
        // coherently so the flag-on screens are not nonsense.
        status:
          input.column === 'paid'
            ? 'paid'
            : input.column === 'invoiced' || input.column === 'done_to_invoice'
              ? 'completed'
              : 'enquiry',
      },
    });
  }

  // --- Jotted: raw capture. No boat, no owner, no place. This is the product.
  await job({
    column: 'jotted',
    title: 'Westerly at Bosham — furler',
    requestNotes: 'Westerly at Bosham, owner wants furler looked at. Fenwick? the blue one',
    daysInColumn: 0,
  });
  await job({
    column: 'jotted',
    title: 'Mast step corrosion — call back',
    requestNotes:
      'Voicemail from a bloke at Itchenor, mast step looked green, wants someone to look before he lays up. Number on the other phone',
    daysInColumn: 2,
  });

  // --- Enquiry
  await job({ vessel: 'wildgoose', column: 'enquiry', title: 'Annual engine service', requestNotes: 'Due its service, and the alternator belt squeals on start-up.', daysInColumn: 3 });
  await job({ vessel: 'skua', column: 'enquiry', title: 'Replace running rigging — halyards and sheets', daysInColumn: 1 });

  // --- Estimate sent
  const estGannet = await job({ vessel: 'gannet', column: 'estimate_sent', title: 'Standing rigging replacement', quotedPence: p(4180), daysInColumn: 4 });
  const estThistle = await job({ vessel: 'thistle', column: 'estimate_sent', title: 'Seacock replacement, 4 off', quotedPence: p(642), daysInColumn: 2 });

  // --- Booked
  const bookedSalt = await job({ vessel: 'saltwind', column: 'booked', title: 'Engine service + impeller', plannedOn: addDays(TODAY, 3), quotedPence: p(340), acceptedDaysAgo: 2, daysInColumn: 2 });
  await job({ vessel: 'lodestar', column: 'booked', title: 'Rig check and tune before lay-up', plannedOn: addDays(TODAY, 6), quotedPence: p(220), acceptedDaysAgo: 1, daysInColumn: 1 });

  // --- Waiting: one card per reason, and one PAST its date so it flashes.
  const waitCrane = await job({
    vessel: 'halcyon', column: 'waiting', title: 'Cutless bearing + shaft seal',
    waitingReason: 'crane', waitingUntil: addDays(TODAY, -2), daysInColumn: 9,
    requestNotes: 'Needs lifting again to get the shaft out. Crane was booked, then moved.',
  });
  const waitParts = await job({
    vessel: 'bramble', column: 'waiting', title: 'Alternator not charging',
    waitingReason: 'parts', waitingUntil: addDays(TODAY, 4), daysInColumn: 5,
  });
  await job({ vessel: 'tamarisk', column: 'waiting', title: 'Rudder bearing play — estimate sent, owner deciding', waitingReason: 'owner_decision', waitingUntil: addDays(TODAY, 2), daysInColumn: 6, quotedPence: p(980) });
  await job({ vessel: 'sirocco', column: 'waiting', title: 'Antifoul and anodes', waitingReason: 'yard_lift', waitingUntil: addDays(TODAY, 8), daysInColumn: 3 });
  await job({ vessel: 'petrel', column: 'waiting', title: 'Topsides polish', waitingReason: 'weather', waitingUntil: addDays(TODAY, 1), daysInColumn: 4 });
  await job({ vessel: 'pipit', column: 'waiting', title: 'Log impeller — needs the tide to get alongside', waitingReason: 'tide', waitingUntil: addDays(TODAY, 2), daysInColumn: 2, place: 'itchenor' });
  await job({ vessel: 'whimbrel', column: 'waiting', title: 'Gas locker drain — owner has the keys', waitingReason: 'access', waitingUntil: addDays(TODAY, 5), daysInColumn: 7 });
  await job({ vessel: 'redshank', column: 'waiting', title: 'Chase the surveyor for the report', waitingReason: 'other', waitingUntil: addDays(TODAY, 3), daysInColumn: 2 });

  // --- On it
  const onItHalcyon = await job({ vessel: 'halcyon', column: 'on_it', title: 'Keel bolts — drop, inspect, replace', quotedPence: p(2840), acceptedDaysAgo: 12, daysInColumn: 5 });
  await job({ vessel: 'seaurchin', column: 'on_it', title: 'Furler service — bench strip', place: 'workshop', quotedPence: p(430), acceptedDaysAgo: 4, daysInColumn: 2 });

  // --- Done, to invoice
  const doneMorning = await job({ vessel: 'morningtide', column: 'done_to_invoice', title: 'Rig inspection + bottlescrew replacement', quotedPence: p(615), acceptedDaysAgo: 16, daysInColumn: 2 });

  // --- Invoiced
  const invKittiwake = await job({ vessel: 'kittiwake', column: 'invoiced', title: 'Engine service + gearbox linkage', quotedPence: p(486), acceptedDaysAgo: 24, daysInColumn: 5 });
  const invMarlin = await job({ vessel: 'marlin', column: 'invoiced', title: 'Replace forestay and furling line', quotedPence: p(1240), acceptedDaysAgo: 40, daysInColumn: 19 });

  // --- The rest of the Halcyon survey list, spread across the board. One boat
  // fills a board, which is exactly the point §8 is making.
  await job({ vessel: 'halcyon', column: 'enquiry', title: 'Keel hydraulic rams and pump — both rams weeping', daysInColumn: 4 });
  const estHalcyonRig = await job({ vessel: 'halcyon', column: 'estimate_sent', title: 'Rig inspection ahead of insurance renewal', quotedPence: p(180), daysInColumn: 3 });

  // --- Off the board: paid, lives in the boat's history.
  const paidCurlew = await job({ vessel: 'curlew', column: 'paid', title: 'Winterisation and antifreeze', quotedPence: p(295), acceptedDaysAgo: 48, daysInColumn: 26 });

  // -------------------------------------------------------------------------
  // Lines. The working list the trade ticks off; an Invoice snapshots them.
  // -------------------------------------------------------------------------

  async function lines(
    bookingId: string,
    rows: { kind: string; description: string; qty: number; unit: number; done?: boolean }[],
  ) {
    for (const [i, r] of rows.entries()) {
      await prisma.quoteLineItem.create({
        data: {
          bookingId,
          kind: r.kind,
          description: r.description,
          qty: r.qty,
          unitPricePence: r.unit,
          // The one place a line total is computed. Stored, never re-derived.
          amountPence: Math.round(r.qty * r.unit),
          done: r.done ?? false,
          sortOrder: i,
        },
      });
    }
  }

  await lines(estGannet.id, [
    { kind: 'parts', description: 'Wire, terminals and turnbuckles — full set, 1x19', qty: 1, unit: p(2380) },
    { kind: 'labour', description: 'Unstep, measure, re-rig and tune', qty: 28, unit: LABOUR },
    { kind: 'subcontract', description: 'Yard crane — unstep and step', qty: 1, unit: p(260) },
  ]);
  await lines(estThistle.id, [
    { kind: 'parts', description: 'Bronze seacocks, 4 off', qty: 4, unit: p(78) },
    { kind: 'labour', description: 'Remove, re-bed and refit', qty: 6, unit: LABOUR },
  ]);
  await lines(estHalcyonRig.id, [
    { kind: 'labour', description: 'Rig inspection aloft, written report', qty: 3, unit: LABOUR },
    { kind: 'parts', description: 'Split pins, tape and sundries', qty: 1, unit: p(15) },
  ]);
  await lines(onItHalcyon.id, [
    { kind: 'labour', description: 'Drop keel, inspect bolts, clean pocket', qty: 18, unit: LABOUR, done: true },
    { kind: 'parts', description: 'Keel bolts and backing plates', qty: 1, unit: p(880), done: true },
    { kind: 'labour', description: 'Re-bed and torque, refit', qty: 12, unit: LABOUR },
    { kind: 'subcontract', description: 'Crane hire — lift and hold', qty: 1, unit: p(310), done: true },
  ]);
  await lines(doneMorning.id, [
    { kind: 'labour', description: 'Full rig inspection, aloft', qty: 5, unit: LABOUR, done: true },
    { kind: 'parts', description: 'Bottlescrews, 2 off', qty: 2, unit: p(84), done: true },
    { kind: 'labour', description: 'Replace and tune', qty: 3, unit: LABOUR, done: true },
  ]);
  await lines(invKittiwake.id, [
    { kind: 'labour', description: 'Annual engine service', qty: 4, unit: LABOUR, done: true },
    { kind: 'parts', description: 'Filters, impeller, oil', qty: 1, unit: p(146), done: true },
    { kind: 'labour', description: 'Gearbox linkage adjustment', qty: 2, unit: LABOUR, done: true },
  ]);
  await lines(invMarlin.id, [
    { kind: 'parts', description: 'Forestay, 1x19 with swage', qty: 1, unit: p(410), done: true },
    { kind: 'parts', description: 'Furling line and blocks', qty: 1, unit: p(165), done: true },
    { kind: 'labour', description: 'Replacement aloft, no unstep', qty: 12, unit: LABOUR, done: true },
  ]);
  await lines(paidCurlew.id, [
    { kind: 'labour', description: 'Winterise engine and freshwater system', qty: 3, unit: LABOUR, done: true },
    { kind: 'parts', description: 'Antifreeze and inhibitor', qty: 1, unit: p(130), done: true },
  ]);
  await lines(bookedSalt.id, [
    { kind: 'labour', description: 'Engine service', qty: 4, unit: LABOUR },
    { kind: 'parts', description: 'Impeller and filters', qty: 1, unit: p(120) },
  ]);

  // -------------------------------------------------------------------------
  // Estimates: two out and unanswered, one accepted by link, one by phone.
  // -------------------------------------------------------------------------

  await prisma.estimate.create({
    data: {
      bookingId: estGannet.id,
      status: 'sent',
      totalPence: p(4180),
      notes: 'Assumes the mast comes down on a yard crane day. Time and materials beyond that.',
      sentAt: londonDateTimeToUtc(addDays(TODAY, -4), '16:20'),
      token: generateRebookToken(),
    },
  });
  await prisma.estimate.create({
    data: {
      bookingId: estHalcyonRig.id,
      status: 'sent',
      totalPence: p(180),
      sentAt: londonDateTimeToUtc(addDays(TODAY, -3), '08:50'),
      token: generateRebookToken(),
    },
  });
  await prisma.estimate.create({
    data: {
      bookingId: estThistle.id,
      status: 'sent',
      totalPence: p(642),
      sentAt: londonDateTimeToUtc(addDays(TODAY, -2), '11:05'),
      token: generateRebookToken(),
    },
  });
  await prisma.estimate.create({
    data: {
      bookingId: bookedSalt.id,
      status: 'accepted',
      totalPence: p(340),
      sentAt: londonDateTimeToUtc(addDays(TODAY, -3), '09:40'),
      decidedAt: londonDateTimeToUtc(addDays(TODAY, -2), '18:30'),
      decidedVia: 'link',
    },
  });
  await prisma.estimate.create({
    data: {
      bookingId: onItHalcyon.id,
      status: 'accepted',
      totalPence: p(2840),
      sentAt: londonDateTimeToUtc(addDays(TODAY, -14), '15:00'),
      decidedAt: londonDateTimeToUtc(addDays(TODAY, -12), '08:15'),
      decidedVia: 'phone',
      decisionNote: 'Rang back first thing — go ahead, wants it done before the weather turns.',
    },
  });

  // -------------------------------------------------------------------------
  // Variations. §8: one awaiting the owner, one approved by link, one agreed
  // by phone. The unanswered one puts a dot on the board card.
  // -------------------------------------------------------------------------

  await prisma.variation.create({
    data: {
      bookingId: onItHalcyon.id,
      description: 'Galley seacock seized — replace while the boat is open',
      reason: 'Found corroded solid when the keel came out. Not safe to leave another season.',
      estimatePence: p(140),
      status: 'awaiting_owner',
      token: generateRebookToken(),
      createdAt: londonDateTimeToUtc(addDays(TODAY, -1), '14:10'),
    },
  });
  await prisma.variation.create({
    data: {
      bookingId: onItHalcyon.id,
      description: 'Rudder bearing shows play — shim and re-seat',
      reason: 'Picked up on the same lift. Cheaper now than a separate haul-out.',
      estimatePence: p(260),
      status: 'approved',
      decidedVia: 'link',
      decidedAt: londonDateTimeToUtc(addDays(TODAY, -3), '20:05'),
      createdAt: londonDateTimeToUtc(addDays(TODAY, -4), '10:00'),
    },
  });
  await prisma.variation.create({
    data: {
      bookingId: doneMorning.id,
      description: 'Second bottlescrew cracked — replaced the pair',
      reason: 'Would not have lasted the winter.',
      estimatePence: p(84),
      status: 'approved',
      decidedVia: 'phone',
      decisionNote: 'Agreed on the phone from the masthead. Said just do it.',
      decidedAt: londonDateTimeToUtc(addDays(TODAY, -15), '11:30'),
      createdAt: londonDateTimeToUtc(addDays(TODAY, -15), '11:20'),
    },
  });

  // -------------------------------------------------------------------------
  // Parts on order, and visits. The Waiting column has to be about something.
  // -------------------------------------------------------------------------

  await prisma.partOrder.create({
    data: {
      bookingId: waitParts.id,
      item: 'Alternator, 12V 80A',
      supplier: 'ASAP Supplies',
      orderedOn: addDays(TODAY, -5),
      etaOn: addDays(TODAY, 4),
      costPence: p(318),
    },
  });
  await prisma.partOrder.create({
    data: {
      bookingId: waitParts.id,
      item: 'Drive belt',
      supplier: 'ASAP Supplies',
      orderedOn: addDays(TODAY, -5),
      etaOn: addDays(TODAY, -1),
      arrivedOn: addDays(TODAY, -1),
      costPence: p(14),
    },
  });
  await prisma.partOrder.create({
    data: {
      bookingId: waitCrane.id,
      item: 'Cutless bearing 25mm, dripless seal kit',
      supplier: 'Marine Engineering Supplies',
      orderedOn: addDays(TODAY, -12),
      etaOn: addDays(TODAY, -6),
      arrivedOn: addDays(TODAY, -6),
      costPence: p(196),
    },
  });

  await prisma.visit.create({
    data: {
      bookingId: bookedSalt.id,
      placeId: places.hard,
      startsAt: londonDateTimeToUtc(addDays(TODAY, 3), '09:00'),
      endsAt: londonDateTimeToUtc(addDays(TODAY, 3), '13:00'),
      status: 'planned',
    },
  });
  // The postponed one. §8: weather, owner notified.
  await prisma.visit.create({
    data: {
      bookingId: waitCrane.id,
      placeId: places.hard,
      startsAt: londonDateTimeToUtc(addDays(TODAY, -2), '08:00'),
      endsAt: londonDateTimeToUtc(addDays(TODAY, -2), '16:00'),
      status: 'postponed',
      postponeReason: 'weather',
      postponeNote: 'Forecast 30kt gusting 40 across the yard — the crane will not lift in that.',
    },
  });

  // -------------------------------------------------------------------------
  // Invoices: one paid, one sent 5 days ago, one 19 days overdue.
  // -------------------------------------------------------------------------

  async function invoice(input: {
    bookingId: string;
    number: string;
    issuedDaysAgo: number;
    status: string;
    paidDaysAgo?: number;
    paidVia?: string;
    rows: { description: string; qty: number; unit: number }[];
  }) {
    const issuedOn = addDays(TODAY, -input.issuedDaysAgo);
    // DERIVED, never typed. The first version of this seed took a hand-typed
    // total, and two of three invoices disagreed with their own lines (£476 of
    // lines against a stated £486) -- the exact document an owner disputes.
    // npm run check now fails if any invoice's total drifts from its lines.
    const totalPence = input.rows.reduce((n, r) => n + Math.round(r.qty * r.unit), 0);
    const inv = await prisma.invoice.create({
      data: {
        operatorId: op.id,
        bookingId: input.bookingId,
        number: input.number,
        issuedOn,
        dueOn: addDays(issuedOn, 14),
        totalPence,
        status: input.status,
        paidOn: input.paidDaysAgo != null ? addDays(TODAY, -input.paidDaysAgo) : null,
        paidVia: input.paidVia ?? null,
        token: generateRebookToken(),
      },
    });
    for (const [i, r] of input.rows.entries()) {
      await prisma.invoiceLine.create({
        data: {
          invoiceId: inv.id,
          description: r.description,
          qty: r.qty,
          unitPricePence: r.unit,
          amountPence: Math.round(r.qty * r.unit),
          sortOrder: i,
        },
      });
    }
    return inv;
  }

  await invoice({
    bookingId: paidCurlew.id,
    number: 'HMS-0001',
    issuedDaysAgo: 30,
    status: 'paid',
    paidDaysAgo: 22,
    paidVia: 'bank',
    rows: [
      { description: 'Winterise engine and freshwater system', qty: 3, unit: LABOUR },
      { description: 'Antifreeze and inhibitor', qty: 1, unit: p(130) },
    ],
  });
  await invoice({
    bookingId: invKittiwake.id,
    number: 'HMS-0002',
    issuedDaysAgo: 5,
    status: 'sent',
    rows: [
      { description: 'Annual engine service', qty: 4, unit: LABOUR },
      { description: 'Filters, impeller, oil', qty: 1, unit: p(146) },
      { description: 'Gearbox linkage adjustment', qty: 2, unit: LABOUR },
    ],
  });
  // 33 days out on 14-day terms = 19 days overdue.
  const marlinInvoice = await invoice({
    bookingId: invMarlin.id,
    number: 'HMS-0003',
    issuedDaysAgo: 33,
    status: 'sent',
    rows: [
      { description: 'Forestay, 1x19 with swage', qty: 1, unit: p(410) },
      { description: 'Furling line and blocks', qty: 1, unit: p(165) },
      { description: 'Replacement aloft, no unstep', qty: 12, unit: LABOUR },
    ],
  });

  // HMS-0003 is 19 days overdue and has already had both of its chases -- the
  // EmailLog below says so. The timestamps must agree, or the first real cron
  // run would send them again.
  await prisma.invoice.update({
    where: { id: marlinInvoice.id },
    data: {
      dueReminderSentAt: londonDateTimeToUtc(addDays(TODAY, -19), '07:00'),
      overdueReminderSentAt: londonDateTimeToUtc(addDays(TODAY, -12), '07:00'),
    },
  });

  // -------------------------------------------------------------------------
  // Reminders due this month — the sales pitch. §8 wants at least eight.
  // -------------------------------------------------------------------------

  const dueThisMonth = [
    { v: 'redshank', kind: 'rig_age', msg: 'Standing rigging is 18 years old. Most insurers want it replaced or professionally inspected somewhere around 10-15 years.' },
    { v: 'pipit', kind: 'rig_age', msg: 'Standing rigging is 16 years old — worth an inspection before renewal.' },
    { v: 'petrel', kind: 'rig_age', msg: 'Standing rigging is 15 years old.' },
    { v: 'tamarisk', kind: 'rig_age', msg: 'Standing rigging is 14 years old.' },
    { v: 'kittiwake', kind: 'rig_age', msg: 'Standing rigging is 13 years old.' },
    { v: 'curlew', kind: 'service_due', msg: 'Engine service is 26 months overdue.' },
    { v: 'whimbrel', kind: 'service_due', msg: 'Engine service is 23 months overdue.' },
    { v: 'bramble', kind: 'service_due', msg: 'Engine service is 22 months overdue.' },
    { v: 'sirocco', kind: 'service_due', msg: 'Engine service is 21 months overdue.' },
    { v: 'harbourpilot', kind: 'service_due', msg: 'Outboard service is 20 months overdue.' },
  ];

  for (const [i, r] of dueThisMonth.entries()) {
    await prisma.reminder.create({
      data: {
        vesselId: vessels[r.v],
        equipmentId: r.kind === 'rig_age' ? rigEquipment[r.v] : engineEquipment[r.v],
        kind: r.kind,
        // Spread across the coming fortnight so "due this month" is a real list.
        dueOn: addDays(TODAY, i - 2),
        status: 'upcoming',
        message: r.msg,
      },
    });
  }

  // One already sent, so the screen is not all one state.
  await prisma.reminder.create({
    data: {
      vesselId: vessels.greylag,
      kind: 'winterise',
      dueOn: addDays(TODAY, -6),
      status: 'sent',
      sentAt: londonDateTimeToUtc(addDays(TODAY, -6), '07:00'),
      message: 'Winterisation — worth booking before the first hard frost.',
      token: generateRebookToken(),
    },
  });

  // -------------------------------------------------------------------------
  // EmailLog. Written directly: these are the evidence behind every "N owners
  // notified" count on screen, and this script must never actually send.
  // -------------------------------------------------------------------------

  async function logged(input: {
    type: string;
    vesselKey: string;
    bookingId?: string;
    subject: string;
    daysAgo: number;
  }) {
    const v = VESSELS.find((x) => x.key === input.vesselKey)!;
    const email = emailFor(CUSTOMERS[v.owner].name);
    await prisma.emailLog.create({
      data: {
        type: input.type,
        toEmail: email,
        deliveredTo: email,
        subject: input.subject,
        status: 'sent',
        providerId: 'local-dev',
        bookingId: input.bookingId ?? null,
        customerId: customers[v.owner],
        vesselId: vessels[input.vesselKey],
        createdAt: londonDateTimeToUtc(addDays(TODAY, -input.daysAgo), '08:30'),
      },
    });
  }

  await logged({ type: 'estimate', vesselKey: 'gannet', bookingId: estGannet.id, subject: 'Your estimate for Gannet — £4,180.00', daysAgo: 4 });
  await logged({ type: 'estimate', vesselKey: 'thistle', bookingId: estThistle.id, subject: 'Your estimate for Thistle — £642.00', daysAgo: 2 });
  await logged({ type: 'variation', vesselKey: 'halcyon', bookingId: onItHalcyon.id, subject: 'Halcyon — extra work found: galley seacock', daysAgo: 1 });
  await logged({ type: 'visit_postponed', vesselKey: 'halcyon', bookingId: waitCrane.id, subject: 'Halcyon — Thursday postponed, weather', daysAgo: 2 });
  await logged({ type: 'invoice', vesselKey: 'kittiwake', bookingId: invKittiwake.id, subject: 'Invoice HMS-0002 — Kittiwake', daysAgo: 5 });
  await logged({ type: 'invoice', vesselKey: 'marlin', bookingId: invMarlin.id, subject: 'Invoice HMS-0003 — Marlin', daysAgo: 33 });
  await logged({ type: 'invoice_reminder', vesselKey: 'marlin', bookingId: invMarlin.id, subject: 'Invoice HMS-0003 is overdue', daysAgo: 12 });
  await logged({ type: 'service_reminder', vesselKey: 'greylag', subject: 'Greylag — worth booking winterisation?', daysAgo: 6 });

  await prisma.contactMessage.create({
    data: {
      name: 'Nick Arundel',
      email: 'nick.arundel@example.com',
      business: 'Arundel Marine Electrical',
      message: 'Saw this at the boat show. I am one man and a van — do I need the whole thing?',
    },
  });

  console.log('Seeded Harbourside Marine Services:', {
    places: PLACES.length,
    boats: VESSELS.length,
    jobs: await prisma.booking.count(),
    onBoard: await prisma.booking.count({ where: { column: { not: 'paid' } } }),
    remindersDue: await prisma.reminder.count({ where: { status: 'upcoming' } }),
    invoices: await prisma.invoice.count(),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
