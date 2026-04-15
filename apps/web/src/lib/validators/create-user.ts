import { z } from "zod";

/**
 * Mirrors apps/api/src/users/dto/create-user.dto.ts so client-valid input
 * never hits server-side rejection. Keep in sync with the API schema.
 */
export const CreateUserSchema = z.object({
  email: z.string().email("Invalid email"),
  name: z.string().min(1, "Name required").max(200),
  password: z.string().min(8, "Minimum 8 characters").max(128),
  role: z
    .enum(["admin", "operator", "developer", "viewer"])
    .default("viewer"),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
