import { z } from 'zod';

export const createScheduleSchema = z.object({
  cameraId: z.string().uuid(),
  scheduleType: z.enum(['daily', 'weekly', 'custom']),
  config: z.object({
    startTime: z.string().regex(/^\d{2}:\d{2}$/), // "08:00"
    endTime: z.string().regex(/^\d{2}:\d{2}$/),   // "18:00"
    days: z.array(z.number().min(0).max(6)).optional(), // 0=Sun, 6=Sat (for weekly)
  }),
  enabled: z.boolean().default(true),
});

export type CreateScheduleDto = z.infer<typeof createScheduleSchema>;
