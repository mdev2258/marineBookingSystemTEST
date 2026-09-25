/**
 * Demo pre-flight. Run after seeding, ideally shortly before a demo:
 *   npm run check
 *
 * These are not unit tests of the libraries; they assert that the specific
 * moments the demo relies on are actually true in the seeded database. A seed
 * that silently drifts (a column rename, a date that rolled over midnight)
 * would otherwise be discovered in front of a prospect.
 *
 * It has earned its keep: in the yard era it caught an overbooked rebook
 * target, quotes seeded with no slot, a "1 space left" that was really 2, and
 * a midnight rollover that staled a whole seed mid-session. Trust it over
 * eyeballing the screens.
 *
 * The first section checks the calendar helpers rather than the data, because
 * every date below is computed with them and a clamping bug would make every
 * other assertion here agree with a wrong seed.
 */

import { PrismaClient } from '@prisma/client';
import { addMonths, addYears, dueWording, monthsBetween, todayInLondon, yearsBetween } from '../src/lib/time';
import { JOB_COLUMN, WAITING_REASON } from '../src/lib/enums';
import { lineAmountPence, parseQty, totalsFor } from '../src/lib/estimates';
import { buildTimeline } from '../src/lib/timeline';
import { findDueWork, blocksNewAsk, dedupeKeyFor, reminderPeriod } from '../src/lib/due-work';
import { invoiceChaseStage } from '../src/lib/reminders';
import { formatPenceShort, poundsToPence } from '../src/lib/money';
import { invoiceLinesFor } from '../src/lib/invoices';
import { isLondonDate } from '../src/lib/board';

const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${expected}, got ${actual})`}`);
}

function atLeast(label: string, actual: number, min: number) {
  const ok = actual >= min;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (expected at least ${min}, got ${actual})`}`);
}

async function main() {
  const today = todayInLondon();

  // --- calendar helpers ----------------------------------------------------
  check('addMonths clamps 31 Jan + 1m to end of Feb', addMonths('2026-01-31', 1), '2026-02-28');
  check('addMonths clamps into a leap February', addMonths('2024-01-31', 1), '2024-02-29');
  check('addMonths rolls the year', addMonths('2026-12-15', 1), '2027-01-15');
  check('addMonths goes backwards', addMonths('2026-03-15', -3), '2025-12-15');
  check('addYears survives the BST boundary', addYears('2016-10-25', 10), '2026-10-25');
  check('yearsBetween counts completed anniversaries', yearsBetween('2015-10-25', '2026-09-21'), 10);
  check('yearsBetween on the anniversary itself', yearsBetween('2015-09-21', '2026-09-21'), 11);
  check('monthsBetween rounds down', monthsBetween('2025-11-30', '2026-09-21'), 9);

  // --- estimate maths (pure, no data) --------------------------------------
  // Money, so it gets checked rather than eyeballed. The VAT case that matters
  // is the unregistered one: vat must be null, never 0, so no renderer can
  // print "£0.00 VAT" for a trade who is not registered.
  const twoLines = [
    { amountPence: 15400, vatRateBps: 2000 },
    { amountPence: 7800, vatRateBps: 2000 },
  ];
  check('unregistered business has no VAT concept', JSON.stringify(totalsFor(twoLines, false)), JSON.stringify({ net: 23200, vat: null, gross: 23200 }));
  check('registered business adds VAT', JSON.stringify(totalsFor(twoLines, true)), JSON.stringify({ net: 23200, vat: 4640, gross: 27840 }));
  // Per line, not on the sum: three 1p lines at 20% round to 0p, not 1p.
  check('VAT rounds per line', totalsFor([1, 1, 1].map((a) => ({ amountPence: a, vatRateBps: 2000 })), true).vat, 0);
  check('blank quantity means one', parseQty(''), 1);
  check('decimal hours parse', parseQty('2.5'), 2.5);
  check('zero quantity is rejected', parseQty('0'), null);
  check('line total has no float drift', lineAmountPence(3, 333), 999);
  // 1.15 * 5550 is 6382.4999... in floats; the right answer is 6382.5 -> 6383.
  check('1.15 h at £55.50 is £63.83, not a penny low', lineAmountPence(1.15, 5550), 6383);
  check('card money keeps its thousands comma', formatPenceShort(124000), '£1,240');
  check('card money keeps pence when there are some', formatPenceShort(123550), '£1,235.50');
  check('a real date is a LondonDate', isLondonDate('2028-02-29'), true);
  check('31 February is refused, not crashed on', isLondonDate('2026-02-31'), false);
  check('a two-digit year is refused', isLondonDate('0099-01-01'), false);
  const tl = buildTimeline({
    createdAt: new Date('2026-09-01T09:00:00Z'),
    estimates: [{ status: 'accepted', totalPence: 24500, sentAt: new Date('2026-09-02T10:00:00Z'), decidedAt: new Date('2026-09-03T08:15:00Z'), decidedVia: 'phone', decisionNote: 'Rang back' }],
    variations: [],
  });
  check('timeline is newest first and records HOW', tl[0]?.label, 'Estimate accepted — Agreed by phone');

  // The one parser every typed price goes through. null means "tell the
  // trade", never "store £0".
  for (const [input, expected] of [
    ['95', 9500], ['95.50', 9550], ['£95.5', 9550], ['1,200', 120000], ['12,345.67', 1234567],
    ['', null], ['abc', null], ['1,20', null], ['-5', null], ['1.234', null],
    ['21474836.47', 2147483647], ['21474836.48', null], ['99999999999', null],
  ] as const) {
    check(`poundsToPence(${JSON.stringify(input)})`, poundsToPence(input), expected);
  }
  // Zero-rated is 0, not "missing": a registered business with a 0% line pays
  // VAT on the other line only.
  check(
    'VAT: registered, one 0-rated line',
    JSON.stringify(totalsFor([{ amountPence: 10000, vatRateBps: 2000 }, { amountPence: 5000, vatRateBps: 0 }], true)),
    JSON.stringify({ net: 15000, vat: 2000, gross: 17000 }),
  );

  // --- VAT on the invoice: the issueInvoice path, pure ---------------------
  // THE RULE: VAT follows registration when a price is SHOWN to the owner,
  // and the invoice bills what was agreed. These drive invoiceLinesFor, the
  // function issueInvoice builds its lines with.
  {
    const done = [
      { kind: 'labour', description: 'Re-rig', qty: 2, unitPricePence: 5000, amountPence: 10000 },
      { kind: 'parts', description: 'Added after the estimate', qty: 1, unitPricePence: 5000, amountPence: 5000 },
    ];
    const extra = [{ description: 'Seacock', estimatePence: 1000 }];
    const bill = (vatRegistered: boolean, agreed: Parameters<typeof invoiceLinesFor>[0]['agreed']) => {
      const lines = invoiceLinesFor({ vatRegistered, doneLines: done, agreed, approvedVariations: extra });
      return JSON.stringify({ rates: lines.map((l) => l.vatRateBps), totals: totalsFor(lines, vatRegistered) });
    };
    check(
      'VAT: unregistered bills no VAT at all',
      bill(false, null),
      JSON.stringify({ rates: [0, 0, 0], totals: { net: 16000, vat: null, gross: 16000 } }),
    );
    check(
      'VAT: registered, never estimated -> 20% on everything (a stored 0 on a working line is not zero-rating)',
      bill(true, null),
      JSON.stringify({ rates: [2000, 2000, 2000], totals: { net: 16000, vat: 3200, gross: 19200 } }),
    );
    check(
      'VAT: estimated before registering -> that line billed as agreed, the rest at 20%',
      bill(true, { vatPence: 0, lines: [{ description: 'Re-rig', vatRateBps: 0 }] }),
      JSON.stringify({ rates: [0, 2000, 2000], totals: { net: 16000, vat: 1200, gross: 17200 } }),
    );
    check(
      'VAT: old estimate with no frozen lines -> its VAT total decides',
      bill(true, { vatPence: 0, lines: [] }),
      JSON.stringify({ rates: [0, 0, 2000], totals: { net: 16000, vat: 200, gross: 16200 } }),
    );
    check(
      'labour prints "hrs": invoice lines keep their kind, variations have none',
      JSON.stringify(invoiceLinesFor({ vatRegistered: false, doneLines: done, agreed: null, approvedVariations: extra }).map((l) => l.kind)),
      JSON.stringify(['labour', 'parts', null]),
    );
  }

  // --- reminders: seasonal = once per year; others = 11 months from the answer
  {
    const feb = { kind: 'commission', status: 'booked', dueOn: '2027-02-03', closedAt: new Date('2027-04-10T11:00:00Z'), createdAt: new Date('2027-02-03T17:00:00Z') };
    check('seasonal answered 10 Apr 2027 still asks Feb 2028', blocksNewAsk(feb, '2028-02-01'), false);
    check('seasonal: not asked twice in the same year', blocksNewAsk(feb, '2027-02-20'), true);
    check('still-sent reminder blocks whatever the year', blocksNewAsk({ ...feb, status: 'sent' }, '2028-02-01'), true);
    const svc = { kind: 'service_due', status: 'dismissed', dueOn: '2027-01-05', closedAt: new Date('2027-04-10T11:00:00Z'), createdAt: new Date('2027-01-05T17:00:00Z') };
    check('non-seasonal quiet 11 months from the answer', blocksNewAsk(svc, '2028-02-01'), true);
    check('non-seasonal asks again after that', blocksNewAsk(svc, '2028-03-11'), false);
    check('no closedAt falls back to createdAt', blocksNewAsk({ ...svc, closedAt: null }, '2027-12-06'), false);
  }
  check('seasonal period is the year', reminderPeriod('winterise', '2026-09-24'), '2026');
  check('dedupeKey seasonal', dedupeKeyFor({ vesselId: 'v1', kind: 'antifoul', equipmentId: null, dueOn: '2027-01-02' }), 'v1|antifoul||2027');
  check('dedupeKey non-seasonal', dedupeKeyFor({ vesselId: 'v1', kind: 'service_due', equipmentId: 'e9', dueOn: '2027-01-02' }), 'v1|service_due|e9|2027-01');
  check('chase wording: today', dueWording('2026-09-23', '2026-09-23'), 'is due today');
  check('chase wording: yesterday', dueWording('2026-09-22', '2026-09-23'), 'was due yesterday');
  check('chase wording: days late', dueWording('2026-09-18', '2026-09-23'), 'was due 5 days ago');
  check('no due email after the overdue one', invoiceChaseStage({ dueOn: '2026-09-20', dueReminderSentAt: null, overdueReminderSentAt: new Date() }, '2026-09-23'), null);
  check('monthsBetween agrees with addMonths at month ends', monthsBetween('2026-03-31', '2027-04-30'), 13);
  check('monthsBetween: 31 Jan to 28 Feb is a month', monthsBetween('2026-01-31', '2026-02-28'), 1);

  // --- invoice chasing: the stage rule, pure ---------------------------------
  {
    const T = '2026-09-23', at = new Date();
    const s = (dueOn: string, due: Date | null, over: Date | null) =>
      invoiceChaseStage({ dueOn, dueReminderSentAt: due, overdueReminderSentAt: over }, T);
    check('not yet due: no chase', s('2026-09-24', null, null), null);
    check('due today: due chase', s('2026-09-23', null, null), 'due');
    check('due chase sent: nothing more that night', s('2026-09-23', at, null), null);
    check('6 days late: still waiting for the overdue one', s('2026-09-17', at, null), null);
    check('7 days late: overdue chase', s('2026-09-16', at, null), 'overdue');
    check('first seen a week late: overdue only, never due', s('2026-09-01', null, null), 'overdue');
    check('both sent: the app stops', s('2026-09-01', at, at), null);
  }

  // --- the business --------------------------------------------------------
  const op = await prisma.operator.findFirst();
  check('one business exists', op?.name, 'Harbourside Marine Services');
  // Every VAT-conditional branch in the app is exercised by this being false.
  check('business is not VAT-registered', op?.vatRegistered, false);
  check('invoice prefix is set', op?.invoicePrefix, 'HMS-');

  // --- the board (§4) ------------------------------------------------------
  // Every column populated, or the board demo has a hole in it.
  for (const column of JOB_COLUMN) {
    atLeast(`column "${column}" has a card`, await prisma.booking.count({ where: { column } }), 1);
  }

  // The whole premise: capture with no boat, no owner, no place.
  atLeast(
    'jotted cards exist with no boat and no owner',
    await prisma.booking.count({ where: { column: 'jotted', vesselId: null, customerId: null } }),
    2,
  );

  // A card in Waiting without a reason is the hole things fall through.
  check(
    'no waiting card is missing its reason',
    await prisma.booking.count({ where: { column: 'waiting', waitingReason: null } }),
    0,
  );

  for (const reason of WAITING_REASON) {
    atLeast(
      `waiting reason "${reason}" is represented`,
      await prisma.booking.count({ where: { column: 'waiting', waitingReason: reason } }),
      1,
    );
  }

  // §8: one waiting card past its date, so the flashing state is demoable.
  // String comparison is safe and index-friendly because every LondonDate is
  // stored zero-padded "yyyy-MM-dd".
  check(
    'exactly one waiting card is past its date',
    await prisma.booking.count({
      where: { column: 'waiting', waitingUntil: { lt: today } },
    }),
    1,
  );

  // --- boat records and the work they generate (§8) -------------------------
  check('25 boats', await prisma.vessel.count(), 25);
  atLeast(
    'four boats have standing rigging 10+ years old',
    await prisma.equipment.count({
      where: { kind: 'standing_rigging', installedOn: { lte: addYears(today, -10) } },
    }),
    4,
  );
  atLeast(
    'five engines are past their service interval',
    await prisma.equipment.count({
      where: {
        kind: { in: ['engine', 'outboard'] },
        serviceIntervalMonths: { not: null },
        lastServicedOn: { lt: addMonths(today, -12) },
      },
    }),
    5,
  );

  // The sales pitch: a batch worth sending.
  atLeast(
    'eight reminders are due',
    await prisma.reminder.count({ where: { status: 'upcoming' } }),
    8,
  );

  // --- estimates and variations (§8) ---------------------------------------
  atLeast('estimates are out and unanswered', await prisma.estimate.count({ where: { status: 'sent' } }), 1);
  atLeast(
    'an estimate was accepted by link',
    await prisma.estimate.count({ where: { status: 'accepted', decidedVia: 'link' } }),
    1,
  );
  // "Agreed by phone" is a first-class path, not a fallback (§3.5).
  atLeast(
    'an estimate was agreed by phone',
    await prisma.estimate.count({ where: { status: 'accepted', decidedVia: 'phone' } }),
    1,
  );

  check(
    'one variation is awaiting the owner (the dot on the card)',
    await prisma.variation.count({ where: { status: 'awaiting_owner' } }),
    1,
  );
  atLeast(
    'a variation was approved by link',
    await prisma.variation.count({ where: { status: 'approved', decidedVia: 'link' } }),
    1,
  );
  atLeast(
    'a variation was agreed by phone',
    await prisma.variation.count({ where: { status: 'approved', decidedVia: 'phone' } }),
    1,
  );

  // A card in Estimate sent with no estimate behind it is a card the owner
  // page shows as "waiting for you" with nothing for them to look at.
  const estimateSentCards = await prisma.booking.findMany({
    where: { column: 'estimate_sent' },
    select: { title: true, estimates: { where: { status: 'sent' }, select: { id: true } } },
  });
  check(
    'every Estimate sent card has a sent estimate',
    estimateSentCards.filter((c) => c.estimates.length === 0).length,
    0,
  );
  // Same lie in Waiting: "owner deciding" with nothing for them to decide on.
  check(
    'every card waiting on an owner decision has an estimate out',
    await prisma.booking.count({
      where: { column: 'waiting', waitingReason: 'owner_decision', estimates: { none: { status: 'sent' } } },
    }),
    0,
  );
  check(
    'every sent or accepted estimate has its lines frozen',
    await prisma.estimate.count({ where: { status: { in: ['sent', 'accepted'] }, lines: { none: {} } } }),
    0,
  );
  check('the business has an address for its invoices', Boolean(op?.address), true);

  // A sent estimate with no token is one the owner cannot answer.
  check(
    'every sent estimate carries a token',
    await prisma.estimate.count({ where: { status: 'sent', token: null } }),
    0,
  );
  // And a settled one must NOT: the token is single-use and cleared by the
  // same statement that settles it.
  check(
    'settled estimates have spent their token',
    await prisma.estimate.count({
      where: { status: { in: ['accepted', 'declined', 'superseded'] }, token: { not: null } },
    }),
    0,
  );
  check(
    'the awaiting variation carries a token',
    await prisma.variation.count({ where: { status: 'awaiting_owner', token: null } }),
    0,
  );
  check(
    'settled variations have spent their token',
    await prisma.variation.count({
      where: { status: { in: ['approved', 'declined', 'withdrawn'] }, token: { not: null } },
    }),
    0,
  );

  // A job cannot have been raised after its own estimate went out. The seed
  // backdates every other date relative to now, so createdAt has to move too --
  // otherwise the timeline on screen reads back to front in front of a prospect.
  const jobsWithEstimates = await prisma.booking.findMany({
    where: { estimates: { some: { sentAt: { not: null } } } },
    select: { createdAt: true, estimates: { select: { sentAt: true } } },
  });
  check(
    'no job was raised after its own estimate was sent',
    jobsWithEstimates.filter((j) =>
      j.estimates.some((e) => e.sentAt && e.sentAt < j.createdAt),
    ).length,
    0,
  );

  // --- waiting on other people (§8) ----------------------------------------
  const postponed = await prisma.visit.findFirst({ where: { status: 'postponed' } });
  check('a visit was postponed', postponed?.postponeReason, 'weather');
  // The owner being told is the point; a postponement nobody heard about is
  // the thing this product exists to stop.
  atLeast(
    'the owner was emailed about the postponement',
    await prisma.emailLog.count({ where: { type: 'visit_postponed', status: 'sent' } }),
    1,
  );
  atLeast(
    'parts are on order with an ETA still ahead',
    await prisma.partOrder.count({ where: { arrivedOn: null, etaOn: { gt: today } } }),
    1,
  );

  // A postponed visit with no reason is an email that cannot be written --
  // sendVisitPostponedEmail has to put something after "because of".
  check(
    'every postponed visit carries a reason',
    await prisma.visit.count({ where: { status: 'postponed', postponeReason: null } }),
    0,
  );

  // A card waiting on parts should have a part outstanding, or the Waiting
  // column is lying and the "everything is in" prompt never fires.
  const waitingOnParts = await prisma.booking.findMany({
    where: { column: 'waiting', waitingReason: 'parts' },
    select: { title: true, partOrders: { where: { arrivedOn: null }, select: { id: true } } },
  });
  check(
    'cards waiting on parts have a part still outstanding',
    waitingOnParts.filter((b) => b.partOrders.length === 0).length,
    0,
  );

  // --- reminders that find work (§7 F5) -------------------------------------
  // findDueWork only reads, so the rules can be checked here without the
  // pre-flight writing anything.
  const dueToday = await findDueWork(today);
  const motorBoats = new Set(
    (await prisma.vessel.findMany({ where: { keelType: 'Planing' }, select: { id: true } })).map((v) => v.id),
  );
  // A motor boat has no rig, and asking its owner to winterise one makes the
  // whole reminder batch look like spam.
  check(
    'no motor boat is told to winterise',
    dueToday.filter((d) => d.kind === 'winterise' && motorBoats.has(d.vesselId)).length,
    0,
  );
  atLeast(
    'the sweep finds old rigging',
    dueToday.filter((d) => d.kind === 'rig_age').length,
    4,
  );
  // The seasonal gate: February is commissioning for everyone, and nobody
  // winterises in spring.
  const february = await findDueWork(`${Number(today.slice(0, 4)) + 1}-02-10`);
  check('February asks nobody to winterise', february.filter((d) => d.kind === 'winterise').length, 0);
  check(
    'February asks every boat about commissioning',
    february.filter((d) => d.kind === 'commission').length,
    await prisma.vessel.count(),
  );
  check(
    'January asks every boat about antifoul',
    (await findDueWork(`${Number(today.slice(0, 4)) + 1}-01-10`)).filter((d) => d.kind === 'antifoul').length,
    await prisma.vessel.count(),
  );

  // The regression that made "Skip" last until midnight: a boat asked the same
  // question again while a recent answer to it still stands. Read-only, so it
  // catches the bug on any database the nightly sweep has actually run against.
  const recentClosedCutoff = new Date(Date.now() - 330 * 86_400_000);
  const allReminders = await prisma.reminder.findMany({
    select: { vesselId: true, kind: true, equipmentId: true, status: true, createdAt: true, closedAt: true },
  });
  const keyOf = (r: { vesselId: string; kind: string; equipmentId: string | null }) =>
    `${r.vesselId}|${r.kind}|${r.equipmentId ?? ''}`;
  const recentlyClosed = new Set(
    allReminders
      .filter((r) => (r.status === 'dismissed' || r.status === 'booked') && (r.closedAt ?? r.createdAt) >= recentClosedCutoff)
      .map(keyOf),
  );
  check(
    'nobody is re-asked while a recent answer still stands',
    allReminders.filter((r) => r.status === 'upcoming' && recentlyClosed.has(keyOf(r))).length,
    0,
  );

  check(
    'every sent reminder carries a token the owner can answer',
    await prisma.reminder.count({ where: { status: 'sent', token: null } }),
    0,
  );
  check(
    'every booked reminder points at the card it became',
    await prisma.reminder.count({ where: { status: 'booked', bookingId: null } }),
    0,
  );

  // --- money (§8) ----------------------------------------------------------
  check('three invoices', await prisma.invoice.count(), 3);
  check('one invoice is paid', await prisma.invoice.count({ where: { status: 'paid' } }), 1);

  const overdue = await prisma.invoice.findMany({
    where: { status: 'sent', dueOn: { lt: today } },
  });
  check('one invoice is overdue', overdue.length, 1);
  if (overdue[0]) {
    const daysOverdue = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${overdue[0].dueOn}T00:00:00Z`)) / 86_400_000,
    );
    check('the overdue invoice is 19 days out', daysOverdue, 19);
  }

  const numbers = (await prisma.invoice.findMany({ select: { number: true } })).map((i) => i.number);
  check('invoice numbers are unique', new Set(numbers).size, numbers.length);
  // Compared against the HIGHEST number, not the count. The old check used the
  // count, which only held while the sequence had no gaps -- and a void makes a
  // gap on purpose. After "issue 4, void 4, issue 5" the count is 4 and the
  // highest is 5, and a counter of 5 would reissue a number already used.
  const highest = Math.max(0, ...numbers.map((n) => Number(n.replace(/\D/g, ''))));
  check(
    'the invoice counter is past the highest number ever issued',
    (op?.nextInvoiceNumber ?? 0) > highest,
    true,
  );

  // An invoice's total must be exactly what its own lines add up to. The lines
  // are a snapshot; if the stored total drifted from them the document would
  // disagree with itself, and that is the invoice that gets disputed.
  const invoicesWithLines = await prisma.invoice.findMany({
    include: { lines: { select: { amountPence: true } } },
  });
  check(
    'every invoice total equals its own lines plus VAT',
    invoicesWithLines.filter(
      (i) => i.lines.reduce((n, l) => n + l.amountPence, 0) + i.vatPence !== i.totalPence,
    ).length,
    0,
  );
  if (op && !op.vatRegistered) {
    check(
      'no invoice charges VAT for an unregistered business',
      invoicesWithLines.filter((i) => i.vatPence !== 0).length,
      0,
    );
  }
  check(
    'every live invoice has a link for its owner',
    await prisma.invoice.count({ where: { status: { in: ['sent', 'paid'] }, token: null } }),
    0,
  );
  // The seeded 19-days-overdue invoice has had both chases. Its stamps must say
  // so, or the first real cron run sends them a third and fourth time.
  check(
    'the overdue invoice will not be chased again',
    await prisma.invoice.count({
      where: { status: 'sent', dueOn: { lt: today }, overdueReminderSentAt: null },
    }),
    0,
  );

  // A line total is stored, not derived, so nothing can re-total a sent
  // estimate underneath the owner. This asserts the stored value still agrees
  // with its own inputs.
  const lines = await prisma.quoteLineItem.findMany();
  const drifted = lines.filter((l) => l.amountPence !== lineAmountPence(l.qty, l.unitPricePence));
  check('no line total has drifted from qty x unit price', drifted.length, 0);

  // The owner's estimate page lists the estimate's frozen lines (or, for an
  // old estimate, the job's) under the SENT total. If they disagree, the owner
  // is looking at a sum that does not add up.
  const sentEstimates = await prisma.estimate.findMany({
    where: { status: 'sent' },
    select: { totalPence: true, lines: true, booking: { select: { title: true, lineItems: true } } },
  });
  const unsummed = sentEstimates.filter(
    (e) =>
      totalsFor(e.lines.length ? e.lines : e.booking.lineItems, op?.vatRegistered ?? false).gross !==
      e.totalPence,
  );
  check(
    `every sent estimate equals the sum of its lines${unsummed.length ? ` (${unsummed.map((e) => e.booking.title).join('; ')})` : ''}`,
    unsummed.length,
    0,
  );

  // --- the boat file and its records (§7 F2) --------------------------------
  // Every boat needs a way in for its owner, or "what the owner sees" is a
  // dead link on some boats and not others -- found in front of a prospect.
  check(
    'every boat has an owner token',
    await prisma.vessel.count({ where: { ownerToken: null } }),
    0,
  );
  check(
    'owner tokens are unique',
    new Set((await prisma.vessel.findMany({ select: { ownerToken: true } })).map((v) => v.ownerToken))
      .size,
    await prisma.vessel.count(),
  );

  // A boat that has been somewhere else, so the history has something to show.
  atLeast('a boat has moved between places', await prisma.vesselMove.count(), 1);

  // The demo prints a rig record. An empty one is worse than not printing it.
  const rigWork = await prisma.booking.findMany({
    where: {
      column: { in: ['done_to_invoice', 'invoiced', 'paid'] },
      lineItems: { some: { done: true } },
    },
    select: { title: true, vesselId: true, lineItems: { select: { description: true } } },
  });
  const rigRe = /rig|mast|stay|shroud|forestay|halyard|furler|bottlescrew/i;
  const withRig = rigWork.filter((j) =>
    rigRe.test([j.title, ...j.lineItems.map((l) => l.description)].join(' ')),
  );
  atLeast('completed rigging work exists to print', withRig.length, 1);

  // And the work record needs finished lines to list.
  atLeast(
    'completed jobs have ticked-off lines',
    await prisma.booking.count({
      where: {
        column: { in: ['done_to_invoice', 'invoiced', 'paid'] },
        lineItems: { some: { done: true } },
      },
    }),
    3,
  );

  // --- freshness -----------------------------------------------------------
  // The seed is positioned relative to "now". If it was seeded yesterday and
  // left overnight, the dates above have all slid by a day.
  // The business row, not a booking: the seed backdates every booking's
  // createdAt, so the newest booking is always "before today".
  const seededToday = op ? op.createdAt >= new Date(`${today}T00:00:00Z`) : false;
  if (!seededToday) {
    console.log('WARN  seeded before today — re-run `npm run seed` before the demo');
  }

  console.log(failures === 0 ? '\nAll demo checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
