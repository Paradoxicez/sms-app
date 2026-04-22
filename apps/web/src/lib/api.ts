/**
 * Structured error thrown by `apiFetch` for non-2xx responses.
 *
 * Exposes HTTP status + parsed JSON body so callers can branch on
 * server error codes (e.g. `DUPLICATE_STREAM_URL` for the Add Camera dialog —
 * Phase 19 D-11). Previous versions threw a generic `Error` with no metadata;
 * Phase 19 P06 Rule 3 fix to enable inline duplicate-error messaging.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  readonly code: string | null;

  constructor(status: number, statusText: string, body: unknown) {
    const message = `API error: ${status} ${statusText}`;
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.code =
      typeof body === 'object' && body !== null && 'code' in body && typeof (body as { code: unknown }).code === 'string'
        ? (body as { code: string }).code
        : null;
  }
}

/**
 * Fetch helper that includes credentials and handles common error patterns.
 * Uses relative URLs so requests go through Next.js rewrites (same-origin cookies).
 *
 * On non-2xx responses, throws `ApiError` exposing `status`, `body`, and `code`
 * (when the response body is JSON with a string `code` field).
 */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      // Try JSON first; fall back to text for non-JSON error bodies.
      const text = await res.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
    } catch {
      // Ignore body read errors — still throw with status info.
    }
    throw new ApiError(res.status, res.statusText, body);
  }

  return res.json();
}
