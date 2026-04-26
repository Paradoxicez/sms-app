import { z } from 'zod';

export const auditQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.enum(['create', 'update', 'delete']).optional(),
  resource: z.string().optional(),
  // Scope query to a single resource instance — e.g. one camera's activity
  // tab. The interceptor writes resourceId from the response body or the
  // matched route param, so this is the canonical way to filter by the
  // entity that was acted upon. Free-text `search` is intentionally separate;
  // see audit.service.ts findAll for the merge order (resourceId narrows
  // first, then `search` ORs over multiple text columns).
  resourceId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(25),
});

export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
