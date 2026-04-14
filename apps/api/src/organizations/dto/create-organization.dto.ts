import { z } from 'zod';

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(50),
  packageId: z.string().uuid().optional(),
});

export type CreateOrganizationDto = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationSchema>;
