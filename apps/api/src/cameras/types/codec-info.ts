// apps/api/src/cameras/types/codec-info.ts
//
// Phase 19 — shared CodecInfo tagged union (D-07)
//
// Single source of truth for Camera.codecInfo JSON shape. Wave 1 wires this
// type into the stream-probe processor and the web normalizer. Wave 0 only
// declares it.

export type CodecInfoStatus = 'pending' | 'failed' | 'success';
export type ProbeSource = 'ffprobe' | 'srs-api';

export interface CodecInfoVideo {
  codec: string; // e.g. "H.264", "H.265", "HEVC" — display form
  width: number;
  height: number;
  fps?: number;
  profile?: string; // e.g. "High" — populated from SRS /api/v1/streams
  level?: string; // e.g. "3.2" — populated from SRS
}

export interface CodecInfoAudio {
  codec: string;
  sampleRate?: number;
  channels?: number;
}

export interface CodecInfo {
  status: CodecInfoStatus;
  video?: CodecInfoVideo;
  audio?: CodecInfoAudio;
  error?: string; // normalized, short English
  probedAt: string; // ISO-8601
  source: ProbeSource;
}

export interface ProbeJobData {
  cameraId: string;
  streamUrl: string;
  orgId: string;
  source?: ProbeSource; // default 'ffprobe'
}
