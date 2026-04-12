import { z } from 'zod';

export const auditQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.enum(['create', 'update', 'delete']).optional(),
  resource: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  cursor: z.string().uuid().optional(),
  take: z.coerce.number().min(1).max(100).default(50),
});

export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
