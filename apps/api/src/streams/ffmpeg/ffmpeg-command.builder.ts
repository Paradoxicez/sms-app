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

  const useCopy = profile.codec === 'copy' || (!needsTranscode && profile.codec === 'auto');

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

  const audioCodec = profile.audioCodec || 'aac';
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
