import { z } from 'zod';

export const recordingQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(10),
  cameraId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().optional(),
  search: z.string().max(200).optional(),
});

export type RecordingQueryDto = z.infer<typeof recordingQuerySchema>;
