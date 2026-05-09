// Pathogen Studio API Worker.
//
// Hosts every /api/* endpoint at https://api.pathogen.studio/. The route
// table and handler logic live in website/api/router.ts so the Pages
// worker (which still serves /pathogen/api/* during dual-running) stays
// behaviorally identical. This Worker layers on top:
//   - origin-allowlist CORS (with credentials)
//   - preflight handling
//
// Both projects bind to the same KV / R2 / D1 resources (see wrangler.toml
// in this directory and in /wrangler.toml). Auth-cookie sharing across
// pathogen.studio and api.pathogen.studio relies on Domain=.pathogen.studio
// being set when env.COOKIE_DOMAIN is populated (production only).

import { handleApiRequest } from '../../website/api/router.js';
import type { Env } from '../../website/api/types.js';
import { applyCors, preflightResponse } from './cors.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight is global — handle before routing.
    if (request.method === 'OPTIONS') {
      return preflightResponse(request);
    }

    // Health check (root path) — handy for uptime monitoring + DNS verification.
    if (path === '/' || path === '') {
      return applyCors(
        request,
        new Response(JSON.stringify({ ok: true, service: 'pathogen-api' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    // Dispatch into the shared router. apiPath strips the leading "/api"
    // prefix that the Pages worker uses; on this Worker the URL already
    // starts with the route segment (no /api prefix because the custom
    // domain is api.pathogen.studio).
    const response = await handleApiRequest(request, env, path);
    return applyCors(request, response);
  },
};
