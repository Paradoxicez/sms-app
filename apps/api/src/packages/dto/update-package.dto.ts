import { z } from 'zod';
import { CreatePackageSchema } from './create-package.dto';

export const UpdatePackageSchema = CreatePackageSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdatePackageDto = z.infer<typeof UpdatePackageSchema>;
