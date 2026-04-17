import { z } from 'zod';

export const auditQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.enum(['create', 'update', 'delete']).optional(),
  resource: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(25),
});

export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
