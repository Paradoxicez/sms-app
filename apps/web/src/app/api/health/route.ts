import { NextResponse } from 'next/server';

/**
 * Public liveness probe for the web container.
 *
 * - Used by apps/web/Dockerfile HEALTHCHECK: `curl -fsS http://localhost:3000/api/health`.
 * - Answers in-process — does NOT proxy to api. The Dockerfile HEALTHCHECK runs
 *   inside the web container; `localhost:3000` is the Next.js server, not the
 *   browser-side rewrite target. A standalone `docker run` of the web image
 *   must be healthy without any api sibling.
 * - Local route handlers take precedence over next.config.ts rewrites, so
 *   `/api/health` answers here while `/api/cameras` / `/api/policies` / etc.
 *   continue to proxy to ${API_URL} per the existing rewrite rule.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}
