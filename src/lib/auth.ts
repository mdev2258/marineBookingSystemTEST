import { SignJWT, jwtVerify } from 'jose';

/**
 * There is no user table. The admin account IS the ADMIN_USERNAME /
 * ADMIN_PASSWORD pair in the environment, and the session is a stateless signed
 * JWT in an httpOnly cookie. `jose` rather than `jsonwebtoken` because
 * src/proxy.ts runs on the Edge runtime, where node:crypto is unavailable.
 */
export const ADMIN_COOKIE = 'admin_session';
const ISSUER = 'marine-booking';
const MAX_AGE_SECONDS = 60 * 60 * 12; // one working day

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET is not set. See .env.example.');
  return new TextEncoder().encode(value);
}

export async function signAdminToken(username: string): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(username)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    // Unconditional `secure: true` silently breaks login over http://localhost,
    // which is exactly where the demo is given.
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_SECONDS,
  };
}

export function credentialsAreValid(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME ?? '';
  const expectedPass = process.env.ADMIN_PASSWORD ?? '';
  if (!expectedUser || !expectedPass) return false;
  return username === expectedUser && password === expectedPass;
}
