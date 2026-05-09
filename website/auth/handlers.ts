// HTTP handlers for the auth endpoints. Wired into _worker.ts's
// handleApiRequest. Each handler returns a Response (with appropriate
// Set-Cookie headers when the session cookie changes).

import type { AuthEnv, CurrentUser } from './types.js';
import { generateCode, storeCode, verifyCode } from './otp.js';
import { checkSendRate, checkVerifyRate } from './rate-limit.js';
import {
  buildClearSessionCookie,
  buildSetSessionCookie,
  createSession,
  getSessionUserId,
  readSessionTokenFromRequest,
  revokeSession,
  SESSION_COOKIE_NAME,
} from './session.js';
import { sendOtpEmail } from './email.js';
import {
  createUserWithDerivedHandle,
  findUserByEmail,
  findUserById,
  findUserByHandle,
  markVerified,
  toCurrentUser,
} from './users.js';
import { claimAnonymousWorkspaces, countClaimableWorkspaces } from './claim.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_MIN = 1;
const DISPLAY_NAME_MAX = 60;

function jsonResponse(data: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function newUserId(): string {
  // 16 random bytes -> 32 hex chars. Distinct from the workspace nano-IDs
  // (which use the URL-safe 64-alphabet) so user/workspace ids are never confused.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generic200(): Response {
  // We don't leak whether the email already exists.
  return jsonResponse({ ok: true }, 200);
}

export async function handleAuthStart(request: Request, env: AuthEnv): Promise<Response> {
  let body: { email?: unknown; displayName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';

  if (!EMAIL_RE.test(email)) return errorResponse('Invalid email address', 400);
  // Display name is optional. The client hides the field for returning users
  // (they already have one) and sends an empty string. For first-time users,
  // /auth/verify falls back to the email local-part if displayName is empty.
  if (displayName.length > DISPLAY_NAME_MAX) {
    return errorResponse(`Display name must be ${DISPLAY_NAME_MAX} characters or fewer`, 400);
  }

  const ip = clientIp(request);
  const rate = await checkSendRate(env.WORKSPACES, email, ip);
  if (!rate.allowed) {
    return errorResponse('Too many sign-in attempts from your network. Try again in a few minutes.', 429);
  }

  const code = generateCode();
  await storeCode(env.WORKSPACES, email, code);

  // Stash the displayName the user typed so /verify can use it for first-time
  // signup. Short-lived (matches code TTL). If the user is returning, the
  // client sends an empty string and /verify ignores it.
  if (displayName) {
    await env.WORKSPACES.put(
      `otp:displayName:${email.toLowerCase()}`,
      displayName,
      { expirationTtl: 600 },
    );
  }

  const result = await sendOtpEmail(env, email, code, { ip, requestedAt: Date.now() });
  if (!result.delivered) {
    // Don't leak transport failures to the client UI as a 500 — keep them in logs
    // but still return ok:false so the UI can prompt the user. Tradeoff: in dev,
    // surfacing the reason helps debugging.
    console.error('[auth] OTP email send failed:', result.error, 'via', result.via);
    if (env.AUTH_DEV_LOG_OTP) {
      return errorResponse(`Email send failed (${result.via}): ${result.error}`, 500);
    }
    return errorResponse(
      "Email delivery is having trouble right now. If retrying doesn't work, drop a note to hello@pathogen.studio.",
      502,
    );
  }

  return generic200();
}

export async function handleAuthVerify(request: Request, env: AuthEnv): Promise<Response> {
  let body: { email?: unknown; code?: unknown; anonymousUserId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const anonymousUserId = typeof body.anonymousUserId === 'string' ? body.anonymousUserId.trim() : '';

  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
    return errorResponse('Invalid email or code', 400);
  }

  const ip = clientIp(request);
  const verifyRate = await checkVerifyRate(env.WORKSPACES, ip);
  if (!verifyRate.allowed) {
    return errorResponse('Too many code attempts. Wait a few minutes before trying again.', 429);
  }

  const outcome = await verifyCode(env.WORKSPACES, email, code);
  if (!outcome.ok) {
    const map: Record<string, string> = {
      no_code: 'No active code for this email. Use "different email" below to request a new one.',
      expired: 'That code expired. Use "different email" below to request a new one.',
      too_many_attempts: 'Too many incorrect attempts. Use "different email" below to request a new one.',
      invalid: 'That code is incorrect. Double-check the email, or use "different email" to start over.',
    };
    return errorResponse(map[outcome.reason], 400);
  }

  // Code is valid. Find or create the user.
  let user = await findUserByEmail(env.USERS_DB, email);
  let firstTime = false;
  if (!user) {
    const displayName =
      (await env.WORKSPACES.get(`otp:displayName:${email.toLowerCase()}`)) || email.split('@')[0];
    user = await createUserWithDerivedHandle(env.USERS_DB, {
      id: newUserId(),
      email,
      displayName,
    });
    firstTime = true;
  } else {
    await markVerified(env.USERS_DB, user.id);
  }

  // Clean up any stashed displayName.
  await env.WORKSPACES.delete(`otp:displayName:${email.toLowerCase()}`).catch(() => {});

  const token = await createSession(env.USERS_DB, user.id);

  let claimableWorkspaceCount = 0;
  if (anonymousUserId && anonymousUserId !== user.id) {
    claimableWorkspaceCount = await countClaimableWorkspaces(env.WORKSPACES, anonymousUserId);
  }

  return jsonResponse(
    {
      ok: true,
      firstTime,
      currentUser: toCurrentUser(user),
      claimableWorkspaceCount,
    },
    200,
    { 'Set-Cookie': buildSetSessionCookie(token, env) },
  );
}

export async function handleAuthLogout(request: Request, env: AuthEnv): Promise<Response> {
  const token = readSessionTokenFromRequest(request);
  if (token) {
    await revokeSession(env.USERS_DB, token);
  }
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': buildClearSessionCookie(env) });
}

export async function handleMe(request: Request, env: AuthEnv): Promise<Response> {
  const token = readSessionTokenFromRequest(request);
  if (!token) return jsonResponse({ currentUser: null }, 200);
  const userId = await getSessionUserId(env.USERS_DB, token);
  if (!userId) {
    return jsonResponse({ currentUser: null }, 200, {
      'Set-Cookie': buildClearSessionCookie(env),
    });
  }
  const user = await findUserById(env.USERS_DB, userId);
  if (!user) {
    return jsonResponse({ currentUser: null }, 200, {
      'Set-Cookie': buildClearSessionCookie(env),
    });
  }
  return jsonResponse({ currentUser: toCurrentUser(user) }, 200);
}

export async function handleAuthClaim(request: Request, env: AuthEnv): Promise<Response> {
  const userId = await requireSessionUserId(request, env);
  if (!userId) return errorResponse('Not signed in', 401);

  let body: { anonymousUserId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
  const anonymousUserId = typeof body.anonymousUserId === 'string' ? body.anonymousUserId.trim() : '';
  if (!anonymousUserId) return errorResponse('Missing anonymousUserId', 400);

  const result = await claimAnonymousWorkspaces(env.WORKSPACES, anonymousUserId, userId);
  return jsonResponse({ ok: true, ...result }, 200);
}

// PII-guarded public profile lookup. Never returns email, id, or timestamps.
export async function handlePublicProfile(_request: Request, env: AuthEnv, handle: string): Promise<Response> {
  const user = await findUserByHandle(env.USERS_DB, handle);
  if (!user) return errorResponse('Profile not found', 404);

  // Pull only public workspaces from the existing public:workspaces index.
  const raw = await env.WORKSPACES.get('public:workspaces');
  let entries: Array<{ id: string; slug: string; name: string; description: string; userId: string; updatedAt: string; thumbnailAt: string | null }> = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) entries = parsed;
    } catch {
      /* empty index */
    }
  }
  const workspaces = entries
    .filter((e) => e.userId === user.id)
    .map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      description: e.description,
      updatedAt: e.updatedAt,
      thumbnailAt: e.thumbnailAt,
    }));

  return jsonResponse(
    {
      handle: user.handle,
      displayName: user.display_name,
      workspaces,
    },
    200,
  );
}

// Helper used by other API handlers (e.g. the workspace endpoints) to enforce
// session auth on writes. Returns the authenticated user id or null.
export async function requireSessionUserId(request: Request, env: AuthEnv): Promise<string | null> {
  const token = readSessionTokenFromRequest(request);
  if (!token) return null;
  return getSessionUserId(env.USERS_DB, token);
}

export { SESSION_COOKIE_NAME };
