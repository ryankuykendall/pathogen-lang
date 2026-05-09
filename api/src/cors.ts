// Origin-allowlist CORS for the Pathogen Studio API Worker.
//
// Cross-origin requests come from the Pages site at pathogen.studio and
// from local development at http://localhost:3000. Wildcard CORS is
// incompatible with credentialed requests (the cookie-based session can
// only ride credentials: 'include'), so we mirror the request Origin only
// when allowlisted.

const ALLOWED_ORIGINS = new Set([
  'https://pathogen.studio',
  'https://www.pathogen.studio',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function corsHeadersFor(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  if (!ALLOWED_ORIGINS.has(origin)) {
    return { Vary: 'Origin' };
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function preflightResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

// Wrap a CORS-naked Response (returned by the shared router) with the
// allowlist headers for the requesting origin.
export function applyCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeadersFor(request))) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}
