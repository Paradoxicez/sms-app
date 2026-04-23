import ffmpeg from 'fluent-ffmpeg';

export interface StreamProfile {
  codec: string; // 'auto' | 'copy' | 'libx264'
  preset?: string; // 'ultrafast' | 'superfast' | 'veryfast' | etc.
  resolution?: string; // '1920x1080' | '1280x720' | null
  fps?: number;
  videoBitrate?: string; // '2000k'
  audioCodec: string; // 'aac' | 'copy' | 'mute'
  audioBitrate?: string; // '128k'
}

/**
 * D-13: -rtsp_transport is an RTSP-only demuxer flag. Emit it only for
 * rtsp:// URLs. For rtmp/rtmps/srt/http(s) ffmpeg either ignores it with a
 * warning (today) or rejects it (stricter future versions).
 */
export function shouldAddRtspTransport(inputUrl: string): boolean {
  return inputUrl.startsWith('rtsp://');
}

export function buildFfmpegCommand(
  inputUrl: string,
  outputUrl: string,
  profile: StreamProfile,
  needsTranscode: boolean,
): ffmpeg.FfmpegCommand {
  const cmd = ffmpeg(inputUrl).output(outputUrl).outputFormat('flv');

  if (shouldAddRtspTransport(inputUrl)) {
    cmd.inputOptions(['-rtsp_transport', 'tcp']);
  }

  // Phase 19.1 D-16/D-17: needsTranscode forces transcoding even when the
  // user-selected profile says passthrough ("copy"). The codec-mismatch
  // banner's "Enable auto-transcode" flips needsTranscode=true on a
  // Passthrough profile so we MUST override here — otherwise FFmpeg tries
  // to copy the non-H.264 source into the H.264 output pipeline and exits
  // with code 234 ("Error opening output file").
  const useCopy =
    !needsTranscode && (profile.codec === 'copy' || profile.codec === 'auto');

  if (useCopy) {
    cmd.videoCodec('copy');
    cmd.addOutputOptions(['-bsf:v', 'h264_metadata=video_full_range_flag=0']);
  } else {
    cmd.videoCodec('libx264');
    cmd.addOutputOptions(['-pix_fmt', 'yuv420p']);
    cmd.addOutputOptions(['-preset', profile.preset || 'veryfast']);
    const gopSize = (profile.fps || 15) * 2;
    cmd.addOutputOptions(['-g', String(gopSize)]);
    cmd.addOutputOptions(['-tune', 'zerolatency']);
    if (profile.videoBitrate) cmd.videoBitrate(profile.videoBitrate);
    if (profile.resolution) cmd.size(profile.resolution);
    if (profile.fps) cmd.fps(profile.fps);
  }

  // When forcing transcode on a Passthrough profile (audioCodec='copy'),
  // the source audio may not be AAC — we need to transcode it to AAC for
  // HLS/browser compatibility. Override 'copy' → 'aac' when transcoding.
  let audioCodec = profile.audioCodec || 'aac';
  if (needsTranscode && audioCodec === 'copy') {
    audioCodec = 'aac';
  }
  if (audioCodec === 'mute') {
    cmd.noAudio();
  } else {
    cmd.audioCodec(audioCodec);
    if (audioCodec === 'aac') {
      cmd.addOutputOptions(['-ar', '44100', '-ac', '2']);
      cmd.audioBitrate(profile.audioBitrate || '128k');
    } else if (profile.audioBitrate) {
      cmd.audioBitrate(profile.audioBitrate);
    }
  }

  return cmd;
}
