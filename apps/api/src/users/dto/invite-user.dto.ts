import { z } from 'zod';

export const InviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'operator', 'developer', 'viewer']).default('viewer'),
});

export type InviteUserDto = z.infer<typeof InviteUserSchema>;
