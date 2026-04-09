import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'operator', 'developer', 'viewer']).default('viewer'),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
