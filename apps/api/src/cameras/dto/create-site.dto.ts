import { z } from 'zod';

export const CreateSiteSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

export type CreateSiteDto = z.infer<typeof CreateSiteSchema>;
