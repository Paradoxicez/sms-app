import { z } from 'zod';
import { CreatePackageSchema } from './create-package.dto';

export const UpdatePackageSchema = CreatePackageSchema.partial();

export type UpdatePackageDto = z.infer<typeof UpdatePackageSchema>;
