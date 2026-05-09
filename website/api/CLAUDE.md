# Shared API logic

Modules in this directory are **shared between the Pages worker and the
API Worker**. Both projects import from here via relative paths so the
Worker bundle and the Pages bundle stay in sync.

```
website/api/
├── types.ts          KV / R2 / D1 / Env / Workspace / SsrUser
├── utils.ts          jsonResponse, errorResponse, generateNanoId, hashContent, slugify
├── public-index.ts   addToPublicIndex, removeFromPublicIndex, updatePublicIndex
└── router.ts         apiHandlers + handleApiRequest dispatcher
```

## Why shared, not duplicated

The full API moved to the Workers project at `api.pathogen.studio` (see
[`/api/CLAUDE.md`](../../api/CLAUDE.md)) — that project owns the API
surface. But the Pages worker still needs:
- `Env`, `Workspace`, `PublicIndexEntry`, `SsrUser` types — for SSR
- `addToPublicIndex` family — actually unused on Pages today (only the
  API Worker mutates the public index)
- nothing from `router.ts`

So in practice this directory is consumed almost entirely by the API
Worker. The Pages worker imports just `types.ts`. We keep the logic here
(rather than moving it under `/api/src/`) for two reasons:

1. The auth handlers in `website/auth/` reference `Env` from this
   `types.ts` — co-locating shared types next to shared auth keeps the
   import graph clean.
2. If we ever need to re-add lightweight API endpoints to the Pages
   worker (rate-limit edge counters, edge-cached read paths, etc.), the
   shared router is already there.

A future cleanup could move `website/api/` and `website/auth/` together
under a top-level `shared/` directory. Not urgent.

## Behavior contract

Every handler in `router.ts` returns a **CORS-naked** Response — no
`Access-Control-*` headers. Each Worker's entry point (`api/src/index.ts`
or any future Pages reuse) wraps the final response with its own CORS
policy. This avoids hardcoding wildcard CORS at the router level (which
would be incompatible with the API Worker's credentialed-fetch
allowlist).

## Don't put

- Routing / fetch handler / CORS — those are Worker-specific (`api/src/index.ts`).
- Marketing-page SSR (renderHomepage, etc.) — those stay in `website/_worker.ts`.
- SPA bundle code — that lives in `playground/`.
