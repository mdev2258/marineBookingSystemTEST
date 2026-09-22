'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hasRoom } from '@/lib/availability';
import { generateBookingReference } from '@/lib/reference';
import { sendEnquiryReceivedEmail } from '@/lib/notifications';

const RequestSchema = z.object({
  name: z.string().trim().min(1, 'Please give us your name.').max(120),
  email: z.email('That email address does not look right.').max(200),
  phone: z.string().trim().min(6, 'We need a number in case we have to reach you.').max(40),
  vesselName: z.string().trim().min(1, "What's she called?").max(120),
  make: z.string().trim().max(120).optional(),
  lengthMetres: z.union([z.literal(''), z.coerce.number().min(1).max(100)]).optional(),
  keelType: z.string().trim().max(60).optional(),
  berth: z.string().trim().max(120).optional(),
  requestNotes: z.string().trim().max(2000).optional(),
});

export type RequestState = {
  error?: string;
  errors?: Partial<
    Record<
      'name' | 'email' | 'phone' | 'vesselName' | 'lengthMetres' | 'requestNotes' | 'serviceId',
      string
    >
  >;
};

function parse(formData: FormData) {
  return RequestSchema.safeParse({
    name: formData.get('name'),
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    phone: formData.get('phone'),
    vesselName: formData.get('vesselName'),
    make: formData.get('make'),
    lengthMetres: formData.get('lengthMetres'),
    keelType: formData.get('keelType'),
    berth: formData.get('berth'),
    requestNotes: formData.get('requestNotes'),
  });
}

function fieldErrors(error: z.ZodError): RequestState {
  const errors: RequestState['errors'] = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof NonNullable<RequestState['errors']>;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { errors };
}

/**
 * Find this owner's boat by name, or record a new one. There is no unique
 * constraint on (customer, vessel name): two boats called Kittiwake in one
 * ownership is daft but not impossible, and refusing the booking over it would
 * be worse than holding two rows.
 */
async function upsertVessel(
  operatorId: string,
  customerId: string,
  input: {
    vesselName: string;
    make?: string;
    lengthMetres?: number | '';
    keelType?: string;
    berth?: string;
  },
) {
  const lengthMetres = typeof input.lengthMetres === 'number' ? input.lengthMetres : null;

  const existing = await prisma.vessel.findFirst({
    where: { customerId, name: input.vesselName },
  });

  if (existing) {
    return prisma.vessel.update({
      where: { id: existing.id },
      data: {
        make: input.make || existing.make,
        lengthMetres: lengthMetres ?? existing.lengthMetres,
        keelType: input.keelType || existing.keelType,
      },
    });
  }

  return prisma.vessel.create({
    data: {
      operatorId,
      customerId,
      name: input.vesselName,
      make: input.make || null,
      lengthMetres,
      keelType: input.keelType || null,
      // Where the boat lives is a Place now, and a public form cannot be
      // trusted to create one. Keep what the owner typed verbatim; the trade
      // sorts it into a Place later. Capture first, organise later.
      notes: input.berth ? `Owner says: ${input.berth}` : null,
    },
  });
}

/**
 * Ask for a published slot.
 *
 * This does NOT create a payable booking, because there is no price yet: every
 * job here is quoted on the boat. It records an enquiry against the slot and
 * the yard comes back with a number. Nothing is held and nothing is owed until
 * the owner accepts that quote.
 */
export async function requestSlot(
  sessionId: string,
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const parsed = parse(formData);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { name, email, phone, requestNotes, ...vesselInput } = parsed.data;

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== 'scheduled') {
    return { error: 'That slot is no longer available.' };
  }
  if (session.startsAt <= new Date()) return { error: 'That slot has already passed.' };

  // An enquiry does not itself hold a place, but there is no sense taking a
  // request for a slot that is already full of paid work.
  if (!(await hasRoom(session))) {
    return { error: 'Sorry — that slot filled up. Please pick another.' };
  }

  // Email is stored lowercased and matched exactly. mode:'insensitive' works
  // now that this is Postgres, but exact-match on a lowercased column uses the
  // unique index and a case-insensitive match does not. Leave it.
  const customer = await prisma.customer.upsert({
    where: { operatorId_email: { operatorId: session.operatorId, email } },
    update: { name, phone },
    create: { operatorId: session.operatorId, name, email, phone },
  });

  const vessel = await upsertVessel(session.operatorId, customer.id, vesselInput);

  const booking = await prisma.booking.create({
    data: {
      reference: generateBookingReference(),
      operatorId: session.operatorId,
      sessionId: session.id,
      customerId: customer.id,
      vesselId: vessel.id,
      requestNotes: requestNotes || null,
      status: 'enquiry',
    },
  });

  await sendEnquiryReceivedEmail(booking.id);

  revalidatePath('/admin/sessions');
  revalidatePath('/admin/day');
  redirect(`/booking/${booking.reference}`);
}

/**
 * Ask for work with no slot attached -- a survey, a repair, anything the yard
 * has to look at before it can even say when. Lands in the same inbox as a
 * slot request, just with sessionId null.
 */
export async function requestWork(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const parsed = parse(formData);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { name, email, phone, requestNotes, ...vesselInput } = parsed.data;

  const serviceId = String(formData.get('serviceId') ?? '');
  if (!serviceId) return { errors: { serviceId: 'What do you need doing?' } };

  const service = await prisma.sessionType.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) return { errors: { serviceId: 'That service is no longer offered.' } };

  const customer = await prisma.customer.upsert({
    where: { operatorId_email: { operatorId: service.operatorId, email } },
    update: { name, phone },
    create: { operatorId: service.operatorId, name, email, phone },
  });

  const vessel = await upsertVessel(service.operatorId, customer.id, vesselInput);

  const booking = await prisma.booking.create({
    data: {
      reference: generateBookingReference(),
      operatorId: service.operatorId,
      // No slot: the yard schedules this once it knows what the job involves.
      sessionId: null,
      customerId: customer.id,
      vesselId: vessel.id,
      requestNotes: [service.name, requestNotes].filter(Boolean).join(' — ') || null,
      status: 'enquiry',
    },
  });

  await sendEnquiryReceivedEmail(booking.id);

  revalidatePath('/admin/enquiries');
  redirect(`/booking/${booking.reference}`);
}
