import { createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * There is no user table. The admin account IS the ADMIN_USERNAME /
 * ADMIN_PASSWORD pair in the environment, and the session is a stateless signed
 * JWT in an httpOnly cookie. src/proxy.ts imports this too; Next 16 runs the
 * proxy on the Node.js runtime, so node:crypto is available there.
 */
export const ADMIN_COOKIE = 'admin_session';
const ISSUER = 'marine-booking';
const MAX_AGE_SECONDS = 60 * 60 * 12; // one working day
const MIN_SECRET_LENGTH = 32;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET is not set. See .env.example.');
  // HS256 is only as strong as its key. Refuse to sign or verify with a short one.
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return new TextEncoder().encode(value);
}

// ponytail: per-process logout denylist (jti -> exp, seconds). It lives on
// globalThis so the proxy and server actions share it within one process, but
// it is lost on restart and not shared across instances/serverless functions:
// a logged-out cookie replayed against another instance stays valid until its
// 12h exp. Upgrade path: a sessionVersion column on Operator, bumped on logout
// and checked in readAdminToken.
const store = globalThis as { __adminRevoked?: Map<string, number> };
const revoked = (store.__adminRevoked ??= new Map<string, number>());

export async function signAdminToken(username: string): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(username)
    .setIssuer(ISSUER)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

/** The verified payload, or null. Pinned alg, issuer and subject; exp and jti required. */
export async function readAdminToken(token: string | undefined): Promise<JWTPayload | null> {
  const expectedUser = process.env.ADMIN_USERNAME;
  if (!token || !expectedUser) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      subject: expectedUser,
      requiredClaims: ['exp', 'iat', 'jti', 'sub'],
    });
    if (payload.role !== 'admin' || revoked.has(payload.jti!)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  return (await readAdminToken(token)) !== null;
}

/** Logout: refuse this token's jti until it would have expired anyway. */
export async function revokeAdminToken(token: string | undefined): Promise<void> {
  const payload = await readAdminToken(token);
  if (!payload) return;
  const now = Date.now() / 1000;
  for (const [jti, exp] of revoked) if (exp < now) revoked.delete(jti);
  revoked.set(payload.jti!, payload.exp!);
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

/** Hash first so the buffers are always equal length, then compare in constant time. */
function sameSecret(a: string, b: string): boolean {
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

export function credentialsAreValid(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME ?? '';
  const expectedPass = process.env.ADMIN_PASSWORD ?? '';
  if (!expectedUser || !expectedPass) return false;
  // Both halves are always compared, so timing does not reveal which one failed.
  const userOk = sameSecret(username, expectedUser);
  const passOk = sameSecret(password, expectedPass);
  return userOk && passOk;
}
