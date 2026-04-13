import { z } from 'zod';

export const startRecordingSchema = z.object({
  cameraId: z.string().uuid(),
});

export type StartRecordingDto = z.infer<typeof startRecordingSchema>;
