# Auth — Email-OTP Account Creation

> Internal design notes for the passwordless email-OTP flow added in May 2026.
> User-facing documentation is intentionally omitted — auth is not a Pathogen
> language feature, so it does not require a `docs/` page (per project CLAUDE.md).

## Why

The playground previously identified users by an anonymous nano-ID held in
`localStorage`. Workspaces persisted, but there was no way for one user to find
another user's public work because anonymous IDs are neither memorable nor
shareable. This change introduces real accounts so we can:

1. Give each user a stable identity and a URL-friendly handle (`/u/<handle>`).
2. Surface a per-user public profile that lists their public workspaces.
3. Lay groundwork for future per-user concerns (rate limits, abuse handling,
   featured-author moderation, etc.) without rewriting the persistence model.

The flow is **email + 6-digit OTP** (no passwords, no magic links). Self-built
on Cloudflare; no third-party auth provider.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Routing | Existing `apiHandlers` switch in `website/_worker.ts` | Hono was considered and rejected — the regression risk on a working 1.2k-line worker outweighed the ergonomic gain for ~10 new endpoints. |
| Sessions | Opaque tokens in **D1** + cookie | 32 hex chars, 30-day TTL, `pathogen_session` cookie. `HttpOnly; SameSite=Lax; Secure` set conditionally on `env.PRODUCTION` so localhost dev over HTTP works. |
| OTP storage | **KV** (`otp:<email_lower>`, TTL 600s) | SHA-256 hashed code, attempt counter capped at 3, single-use (deleted on success). |
| OTP delivery | **Cloudflare Email Sending** (public beta, April 2026) | `env.EMAIL.send()`. Requires verified sending domain in CF Email Service dashboard. Resend fallback wired via `AUTH_RESEND_API_KEY`. |
| Rate limit | KV bucket counters (10-min window) | 5 sends/email, 20 sends/IP, 50 verify-attempts/IP. KV is *not* well-suited to high-traffic counters — see Risks below. |
| User store | **D1** `users` table | `id`, `email`, `email_lower`, `handle` (unique), `display_name`, `created_at`, `verified_at`. Schema in `migrations/0001_users.sql`. |
| Handle | Auto-derived from `display_name` | `slugify` + collision suffix `-2`, `-3`, … (cap 9999). Renameable later in settings — not yet UI-exposed. |
| Anon-claim | Prompt user after first verify | `/api/auth/claim` re-keys `workspace:*`, `user:<anonId>:workspaces`, and `public:workspaces` entries to the new authenticated id. Idempotent. |

## API surface

All paths under `/pathogen/api/`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/start` | Generate + store + email a 6-digit code. Always returns `{ ok: true }` regardless of whether the email exists. |
| POST | `/auth/verify` | Validate code, find/create user, issue session, set cookie. Returns `{ ok, firstTime, currentUser, claimableWorkspaceCount }`. |
| POST | `/auth/logout` | Revoke session, clear cookie. |
| POST | `/auth/claim` | Re-key anonymous workspaces to authenticated user (requires session). Body: `{ anonymousUserId }`. |
| GET | `/me` | Returns `{ currentUser }` based on session cookie, or `{ currentUser: null }`. |
| GET | `/u/:handle` | Public profile JSON: `{ handle, displayName, workspaces[] }`. **PII-guarded** — no email, no internal user id, no timestamps. |

Additionally, `GET /pathogen/u/:handle` is server-rendered (HTML) for SEO,
mirroring `/pathogen/explore` and `/pathogen/featured`.

## Configuration

`wrangler.toml` additions:

```toml
[[d1_databases]]
binding = "USERS_DB"
database_name = "pathogen-lang-users"
database_id = "<from `wrangler d1 create`>"

[[send_email]]
# Cloudflare Email Sending public beta. Confirm exact syntax against
# https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/
# at the time of provisioning — the new (April 2026) Email Sending feature
# may use a different binding shape than the older send_email block.
name = "EMAIL"

[vars]
AUTH_FROM_EMAIL    = "noreply@pedestal.design"   # must match a verified sending domain
AUTH_PRODUCT_NAME  = "Pathogen"
PRODUCTION         = "1"                          # toggles cookie Secure flag

# Local-dev only — log OTP codes to console instead of sending real email.
# AUTH_DEV_LOG_OTP = "1"
```

## Security notes

- **Code generation**: 6 digits via `crypto.getRandomValues()` — never `Math.random()`.
- **At-rest**: only the SHA-256 hex digest is stored in KV; the plaintext code
  never touches storage.
- **Constant-time compare**: `constantTimeEqual()` in `auth/otp.ts`.
- **Replay**: codes are deleted from KV on first successful verify and after
  3 failed attempts.
- **Rate limit**: per-email 5/10min, per-IP 20/10min on `/auth/start`; per-IP
  50/10min on `/auth/verify`.
- **Cookie**: `HttpOnly; SameSite=Lax; Path=/`. `Secure` set only when
  `env.PRODUCTION` is truthy. We deliberately do NOT use the `__Host-` prefix
  because it requires `Secure` unconditionally and would break localhost dev.
- **Brute force**: 6-digit codes (10⁶ space) are bruteable in seconds without
  rate limits. The 3-attempt-per-code + per-IP verify rate limits are the
  defenses; they are not optional.
- **PII**: `/api/u/:handle` and `/api/me` are explicit about which fields they
  return. The PII-leak regression test is at
  `tests/auth/profile-pii.test.ts` — keep it green.

## Risks + Known follow-ups

These are *known* tech debt, accepted at merge time. Prioritized.

1. **KV for rate-limit counters has limits.** KV is eventually consistent and
   limits writes to 1/sec/key. For low-traffic indie use this is academic; an
   attacker doing >1 hit/sec to a single email or IP could underflow the
   counters by exploiting write coalescing. The upgrade path is a Durable
   Object that owns the counter — this is well-understood and easy to swap.

2. **Cloudflare Email Sending is in public beta.** If we hit deliverability
   or quota issues, set `AUTH_RESEND_API_KEY` and `AUTH_FROM_EMAIL` and the
   `email.ts` adapter falls back to Resend transparently. No other code
   changes required.

3. **No dedicated rename-handle UI.** The `users.handle` column is unique and
   updateable, but there's no settings page yet. Users who get auto-derived
   handles like `ryan-k-2` are stuck until we add it.

4. **No miniflare-backed integration tests.** The current auth tests use
   hand-rolled in-memory KV/D1 mocks (`tests/auth/helpers.ts`). Real KV TTL
   semantics and D1 prepared-statement quirks may diverge. The advised
   upgrade is `@cloudflare/vitest-pool-workers` — it gives real D1 + KV in
   tests and would catch bugs the mocks miss.

## Resolved in this PR

- **Workspace ownership now session-validated.** `getEffectiveUserId(request, env)`
  in `website/auth/effective-id.ts` is used by every workspace API handler.
  Session cookie wins; X-User-Id header is honored *only* if it doesn't map
  to a real user row. This closes the impersonation hole that would have
  appeared the moment account ids became enumerable via `/u/:handle` and
  `public:workspaces`. Regression test: `tests/auth/effective-id.test.ts`
  ("REJECTS a header id that matches a real user row when there is no session").

- **Storybook entries** for `account-menu`, `auth-modal`, and
  `claim-workspaces-prompt` — added to `playground/utils/storybook-registry.ts`
  under the new "Auth" category.

- **Claim-decline UX** — when a user declines the claim prompt, the dialog
  now reminds them they can sign out later to access those workspaces again.

## File map

```
migrations/
  0001_users.sql                      # users + sessions schema

website/auth/
  types.ts                            # KV / D1 / EmailBinding type shims + AuthEnv
  otp.ts                              # generateCode, hashCode, storeCode, verifyCode
  rate-limit.ts                       # send/verify rate limit checks
  session.ts                          # token issue/lookup/revoke + cookie helpers
  handle.ts                           # slugifyHandle, findAvailableHandle
  email.ts                            # sendOtpEmail (CF Email -> Resend fallback)
  users.ts                            # D1 CRUD on users
  claim.ts                            # claimAnonymousWorkspaces (KV re-key)
  handlers.ts                         # HTTP handlers wired into _worker.ts

website/_worker.ts                    # extended Env, new API cases, /pathogen/u/:handle SSR

playground/services/auth.ts           # client API + bootstrap + sign-out
playground/services/user-id.ts        # extended: prefers authenticated id when set
playground/state/store.ts             # currentUser, authModalOpen, pendingClaim* slices

playground/components/shared/
  account-menu.ts                     # header chip
  auth-modal.ts                       # email + 6-digit code dialog
  claim-workspaces-prompt.ts          # post-verify claim dialog

playground/components/app-shell.ts    # bootstraps currentUser, mounts auth modals
playground/components/app-header.ts   # places <account-menu> next to theme-toggle

scripts/build-website.ts              # esbuild now bundles the worker (was bundle:false)

tests/auth/
  helpers.ts                          # in-memory KV + D1 mocks
  otp.test.ts
  handle.test.ts
  rate-limit.test.ts
  claim.test.ts
  profile-pii.test.ts
```

## Provisioning runbook

One-time setup:

```bash
# 1. Authenticate wrangler
npx wrangler login

# 2. Create the D1 database
npx wrangler d1 create pathogen-lang-users
#    Append the returned [[d1_databases]] block to wrangler.toml

# 3. Apply schema locally and remotely
npx wrangler d1 migrations apply USERS_DB --local
npx wrangler d1 migrations apply USERS_DB --remote

# 4. Configure Cloudflare Email Sending
#    - In the Cloudflare dashboard, Email Service → Email Sending → add and
#      verify the sending domain (e.g. pedestal.design).
#    - Wait for SPF/DKIM/DMARC propagation.
#    - Add the [[send_email]] / EMAIL binding to wrangler.toml per the latest
#      Cloudflare docs (the binding syntax for the new public-beta feature is
#      not in the legacy /email-routing/ docs page — check the Email Service
#      dashboard for the exact wrangler config snippet).
#    - Set AUTH_FROM_EMAIL in [vars] to a verified sender on that domain.

# 5. Smoke-test email delivery
#    Deploy a temporary route that calls env.EMAIL.send() with your own
#    address; confirm a real inbox delivery before users hit the real flow.
#    If delivery fails or the binding doesn't exist yet, set
#    AUTH_RESEND_API_KEY in [vars] and the email.ts adapter will fall back.
```

For local dev without configuring email at all, set
`AUTH_DEV_LOG_OTP=1` in `[vars]` and OTP codes are logged to the worker
console instead of mailed.
