import { ApiError } from './api';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  streamUrl: 'Stream URL',
  description: 'Description',
  location: 'Location',
  'location.lat': 'Latitude',
  'location.lng': 'Longitude',
  tags: 'Tags',
  thumbnail: 'Thumbnail',
  streamProfileId: 'Stream Profile',
  ingestMode: 'Ingest mode',
  siteId: 'Site',
  projectId: 'Project',
};

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

interface ZodFlatten {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

function flattenLooksLikeZod(v: unknown): v is ZodFlatten {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return 'fieldErrors' in o || 'formErrors' in o;
}

/**
 * Extract a user-readable error message from an API failure.
 *
 * Handles the NestJS + Zod pattern used across this codebase:
 *   - Controller calls `result.error.flatten()` and passes it to
 *     `BadRequestException`, so the response body is shaped like
 *     `{ statusCode: 400, message: { fieldErrors, formErrors }, error: 'Bad Request' }`.
 *   - Other exceptions (NotFound, plain BadRequest with string) shape it as
 *     `{ statusCode, message: '...', error }`.
 *
 * Strategy:
 *   - 400 with Zod flatten → join field/form errors into one human sentence.
 *   - 4xx with string message → return that message.
 *   - Anything else → return the supplied fallback (callers usually pass a
 *     short generic copy so 5xx stays opaque to end users).
 */
export function extractApiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;

  const body = err.body;
  if (typeof body !== 'object' || body === null) {
    return typeof body === 'string' && body ? body : fallback;
  }

  const message = (body as { message?: unknown }).message;

  if (err.status === 400 && flattenLooksLikeZod(message)) {
    const parts: string[] = [];
    const fieldErrors = message.fieldErrors ?? {};
    for (const [field, errs] of Object.entries(fieldErrors)) {
      if (!errs || errs.length === 0) continue;
      for (const e of errs) {
        parts.push(`${labelFor(field)}: ${e}`);
      }
    }
    for (const e of message.formErrors ?? []) {
      parts.push(e);
    }
    if (parts.length > 0) return parts.join('. ');
  }

  if (err.status >= 400 && err.status < 500 && typeof message === 'string' && message) {
    return message;
  }

  return fallback;
}
