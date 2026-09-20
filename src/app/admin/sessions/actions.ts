'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/app/admin/actions';
import { poundsToPence } from '@/lib/money';
import { londonDateTimeToUtc } from '@/lib/time';
import { seatsTaken } from '@/lib/availability';

export type SessionFormState = {
  error?: string;
  errors?: Partial<Record<'sessionTypeId' | 'date' | 'time' | 'capacity' | 'price', string>>;
};

type Parsed = {
  sessionTypeId: string;
  date: string;
  time: string;
  capacity: number;
  pricePerPersonPence: number;
};

function parse(formData: FormData): { ok: true; value: Parsed } | { ok: false; state: SessionFormState } {
  const errors: SessionFormState['errors'] = {};

  const sessionTypeId = String(formData.get('sessionTypeId') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  const capacityRaw = String(formData.get('capacity') ?? '').trim();
  const priceRaw = String(formData.get('price') ?? '').trim();

  if (!sessionTypeId) errors.sessionTypeId = 'Pick an activity.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = 'Pick a date.';
  if (!/^\d{2}:\d{2}$/.test(time)) errors.time = 'Pick a start time.';

  const capacity = Number(capacityRaw);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) {
    errors.capacity = 'Capacity must be a whole number of seats.';
  }

  const pricePerPersonPence = poundsToPence(priceRaw);
  if (pricePerPersonPence === null) errors.price = 'Price should look like 95 or 95.50.';

  if (Object.keys(errors).length > 0) return { ok: false, state: { errors } };

  return {
    ok: true,
    value: { sessionTypeId, date, time, capacity, pricePerPersonPence: pricePerPersonPence! },
  };
}

export async function createSession(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  await requireAdmin();

  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;
  const { sessionTypeId, date, time, capacity, pricePerPersonPence } = parsed.value;

  const type = await prisma.sessionType.findUnique({ where: { id: sessionTypeId } });
  if (!type) return { errors: { sessionTypeId: 'That activity no longer exists.' } };

  const startsAt = londonDateTimeToUtc(date, time);
  const endsAt = new Date(startsAt.getTime() + type.durationMinutes * 60_000);

  const session = await prisma.session.create({
    data: {
      operatorId: type.operatorId,
      sessionTypeId: type.id,
      startsAt,
      endsAt,
      // Snapshotted, not read through the relation later: changing the activity's
      // default price must never silently reprice a session people have booked.
      capacity,
      pricePerPersonPence,
    },
  });

  revalidatePath('/admin/sessions');
  revalidatePath('/admin/day');
  redirect(`/admin/sessions/${session.id}`);
}

export async function updateSession(
  sessionId: string,
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  await requireAdmin();

  const parsed = parse(formData);
  if (!parsed.ok) return parsed.state;
  const { sessionTypeId, date, time, capacity, pricePerPersonPence } = parsed.value;

  const [existing, type] = await Promise.all([
    prisma.session.findUnique({ where: { id: sessionId } }),
    prisma.sessionType.findUnique({ where: { id: sessionTypeId } }),
  ]);
  if (!existing) return { error: 'That session no longer exists.' };
  if (!type) return { errors: { sessionTypeId: 'That activity no longer exists.' } };

  // Capacity below the seats already sold would make spacesLeft negative and
  // show a full session as bookable. Refuse rather than silently clamp.
  const taken = await seatsTaken(sessionId);
  if (capacity < taken) {
    return {
      errors: { capacity: `${taken} seat${taken === 1 ? ' is' : 's are'} already booked.` },
    };
  }

  const startsAt = londonDateTimeToUtc(date, time);

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      sessionTypeId: type.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + type.durationMinutes * 60_000),
      capacity,
      pricePerPersonPence,
    },
  });

  revalidatePath('/admin/sessions');
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath('/admin/day');
  return {};
}
