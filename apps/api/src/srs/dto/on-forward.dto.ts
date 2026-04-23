// apps/api/src/srs/dto/on-forward.dto.ts
//
// Phase 19.1 D-18: SRS v6 forward backend callback body schema.
// SRS POSTs this shape to /api/srs/callbacks/on-forward; we reply with
// { code: 0, data: { urls: [...] } } to redirect the publish.
// See RESEARCH §"Pattern 1" for the full round-trip.

import { z } from 'zod';

export const OnForwardSchema = z.object({
  action: z.string(), // 'on_forward'
  client_id: z.string().optional(),
  ip: z.string().optional(),
  vhost: z.string().optional(),
  app: z.string(),
  tcUrl: z.string().optional(),
  stream: z.string(),
  param: z.string().optional(),
});

export type OnForwardDto = z.infer<typeof OnForwardSchema>;
