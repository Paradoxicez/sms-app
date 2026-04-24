import { z } from 'zod';

/**
 * Phase 20 — POST /api/cameras/:id/maintenance request body.
 *
 * Reason is optional operational text (e.g. "Lens cleaning") capped at 200
 * chars. `.strict()` rejects unknown fields to prevent prototype-pollution-
 * by-body (T-20-01). The captured value flows to the audit trail via
 * AuditInterceptor's request.body snapshot (T-20-05) — no DB schema change
 * required.
 */
export const enterMaintenanceBodySchema = z
  .object({
    reason: z
      .string()
      .max(200, 'reason must be 200 characters or fewer')
      .optional(),
  })
  .strict();

export type EnterMaintenanceBody = z.infer<typeof enterMaintenanceBodySchema>;
