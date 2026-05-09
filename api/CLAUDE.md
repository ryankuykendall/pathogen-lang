# API Worker

Cloudflare Workers project — every `/api/*` endpoint for Pathogen Studio.

Hosts: `https://api.pathogen.studio/`

## Why a separate project

Cloudflare Pages does **not** accept `[[send_email]]` in `wrangler.toml`,
and we want every binding in version control. Workers' `wrangler.toml`
natively supports `[[send_email]]` alongside KV / R2 / D1, so the API
moved here. The Pages project at `pathogen.studio` keeps SSR HTML + SPA +
static assets and reads the same KV / D1 read-only.

## Endpoints

All API endpoints live at `https://api.pathogen.studio/...`. The router
in `website/api/router.ts` (shared with the Pages worker for type imports)
dispatches them:

| Path | Method | Purpose |
|---|---|---|
| `/auth/start` | POST | Send OTP |
| `/auth/verify` | POST | Verify OTP, set session cookie |
| `/auth/logout` | POST | Clear session |
| `/auth/claim` | POST | Claim anonymous workspaces for new account |
| `/me` | GET | Current user |
| `/u/:handle` | GET | Public profile |
| `/workspaces` | GET | List user's workspaces |
| `/workspace` | POST | Create |
| `/workspace/:id` | GET / PUT / DELETE | Read / update / delete |
| `/workspace/:id/copy` | POST | Duplicate |
| `/workspace/:id/thumbnail` | PUT / DELETE | Upload / clear thumbnails |
| `/thumbnail/:id/:size` | GET | Public thumbnail read (R2) |
| `/preferences` | GET / PUT | User preferences |
| `/admin/featured` | GET / POST / PUT / DELETE | Admin-curated showcase (token-gated) |
| `/admin/workspaces-without-thumbnails` | GET | Admin backfill query |

## Local dev

```bash
cd api && npm run dev          # wrangler dev on :8787
# or from repo root:
npm run dev:stack              # both wranglers — Pages :3000, API :8787
```

For local dev to talk to this Worker instead of production:

```bash
PATHOGEN_API_BASE=http://localhost:8787 npm run dev:website
```

`api/.dev.vars` (gitignored) sets `AUTH_DEV_LOG_OTP=1` so OTP codes log
to the wrangler console instead of going to email. Empty `PRODUCTION` and
empty `COOKIE_DOMAIN` keep cookies working between localhost ports.

## Deploy

Auto-deploys on `git push` to main when files in `api/`, `website/api/`,
or `website/auth/` change — see `.github/workflows/deploy-api.yml`.

Manual deploy:

```bash
cd api && wrangler deploy
```

The `routes = [{ pattern = "api.pathogen.studio", custom_domain = true }]`
in `api/wrangler.toml` causes the deploy to attach the custom domain
automatically (the `pathogen.studio` zone must be active in the same CF
account, which it is).

## Bindings (all version-controlled)

`api/wrangler.toml`:
- `WORKSPACES` — KV (workspaces, public index, rate-limit counters)
- `THUMBNAILS` — R2 (workspace thumbnails)
- `USERS_DB` — D1 (users + sessions)
- `EMAIL` — `[[send_email]]` (Cloudflare Email Sending)
- vars: `AUTH_FROM_EMAIL=hello@pathogen.studio`, `AUTH_PRODUCT_NAME`,
  `PRODUCTION=1`, `COOKIE_DOMAIN=.pathogen.studio`

Secrets (set via `wrangler secret put`, not committed):
- `ADMIN_TOKEN` — required for `/admin/*` routes
- `AUTH_RESEND_API_KEY` — optional fallback transport

## CORS

`api/src/cors.ts` mirrors the request `Origin` only when allowlisted
(`https://pathogen.studio`, `https://www.pathogen.studio`,
`http://localhost:3000`). Wildcard `*` is incompatible with credentialed
fetches, which the SPA needs for the session cookie.

## Cookie domain sharing

The session cookie is set with `Domain=.pathogen.studio`. The Pages
worker at `pathogen.studio` reads the same cookie (via
`getSsrUser()` → `readSessionTokenFromRequest()`) so first-paint SSR
sees the signed-in user without a client-side fetch.

## Source layout

```
api/
├── wrangler.toml          Workers config + bindings
├── package.json
├── tsconfig.json
├── .dev.vars              Local-dev overrides (gitignored)
└── src/
    ├── index.ts           Worker entry — CORS + dispatcher
    ├── cors.ts            Origin allowlist + preflight
    └── (handlers + auth imported from ../../website/{api,auth})
```

The bulk of the code lives in `website/api/` and `website/auth/` — see
those directories for the actual route handlers.
