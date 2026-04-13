import { z } from 'zod';

export const onHlsCallbackSchema = z.object({
  action: z.literal('on_hls'),
  client_id: z.string(),
  ip: z.string(),
  vhost: z.string(),
  app: z.string(),
  stream: z.string(),
  param: z.string().optional(),
  duration: z.number(),
  cwd: z.string(),
  file: z.string(),
  url: z.string(),
  m3u8: z.string(),
  m3u8_url: z.string(),
  seq_no: z.number(),
  server_id: z.string().optional(),
  stream_url: z.string().optional(),
  stream_id: z.string().optional(),
});

export type OnHlsCallbackDto = z.infer<typeof onHlsCallbackSchema>;
