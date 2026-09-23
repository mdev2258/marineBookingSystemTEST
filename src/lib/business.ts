import { cache } from 'react';
import { prisma } from '@/lib/prisma';

/**
 * The business's name and contact details. One source -- the Operator row --
 * so the header, the thank-you pages, the 404 and the emails can never quote
 * two different phone numbers again.
 */
export const getBusiness = cache(() => prisma.operator.findFirst());
