import ffmpeg from 'fluent-ffmpeg';

export interface StreamProfile {
  codec: string; // 'auto' | 'copy' | 'libx264'
  preset?: string; // 'ultrafast' | 'superfast' | 'veryfast' | etc.
  resolution?: string; // '1920x1080' | '1280x720' | null
  fps?: number;
  videoBitrate?: string; // '2000k'
  audioCodec: string; // 'aac'
  audioBitrate?: string; // '128k'
}

export function buildFfmpegCommand(
  inputUrl: string,
  outputUrl: string,
  profile: StreamProfile,
  needsTranscode: boolean,
): ffmpeg.FfmpegCommand {
  const cmd = ffmpeg(inputUrl)
    .inputOptions(['-rtsp_transport', 'tcp'])
    .output(outputUrl)
    .outputFormat('flv');

  if (profile.codec === 'copy' || (!needsTranscode && profile.codec === 'auto')) {
    cmd.videoCodec('copy');
  } else {
    cmd.videoCodec('libx264');
    cmd.addOutputOptions(['-preset', profile.preset || 'veryfast']);
    if (profile.videoBitrate) cmd.videoBitrate(profile.videoBitrate);
    if (profile.resolution) cmd.size(profile.resolution);
    if (profile.fps) cmd.fps(profile.fps);
  }

  cmd.audioCodec(profile.audioCodec || 'aac');
  if (profile.audioBitrate) cmd.audioBitrate(profile.audioBitrate);

  return cmd;
}
