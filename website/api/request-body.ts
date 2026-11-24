// Request bodies read under a cap (phase 3a step 5, note 80). A Worker has
// 128 MB. A body is read only while it stays within its route's cap, so a
// body sent without a Content-Length (chunked) can't make the Worker hold
// more than the cap either.

/** A body over its route's cap. */
export const TOO_LARGE: unique symbol = Symbol('too large');

/**
 * Read a request's body with `read` (`(r) => r.json()`, `(r) => r.arrayBuffer()`)
 * while it is at most `maxBytes`. TOO_LARGE when a Content-Length says more,
 * or the body passes the cap as it arrives. Anything else `read` throws (a
 * malformed body) is thrown as `request.json()` would throw it.
 */
export async function readCapped<T>(
  request: Request,
  maxBytes: number,
  read: (body: Response) => Promise<T>,
): Promise<T | typeof TOO_LARGE> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) return TOO_LARGE;
  if (!request.body) return read(new Response(null));
  let seen = 0;
  let exceeded = false;
  const counted = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBytes) {
          exceeded = true;
          controller.error(new Error(`The body is over ${maxBytes} bytes.`));
        } else {
          controller.enqueue(chunk);
        }
      },
    }),
  );
  try {
    return await read(new Response(counted));
  } catch (err) {
    if (exceeded) return TOO_LARGE;
    throw err;
  }
}
