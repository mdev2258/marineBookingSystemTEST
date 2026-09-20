import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/auth';

/**
 * Next 16 renamed the `middleware.ts` file convention to `proxy.ts`
 * (`middleware.ts` still works but logs a deprecation warning at build time).
 * Verified against next@16.3.5: build/analysis/get-page-static-info.js expects
 * a default export or a named `proxy` export from this file.
 *
 * Runs on the Edge runtime -- hence `jose` rather than `jsonwebtoken`, and no
 * Prisma access here.
 */
export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The login page itself must stay reachable, or this is a redirect loop.
  if (pathname === '/admin/login') return NextResponse.next();

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (await verifyAdminToken(token)) return NextResponse.next();

  const loginUrl = new URL('/admin/login', request.url);
  if (pathname !== '/admin') loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
