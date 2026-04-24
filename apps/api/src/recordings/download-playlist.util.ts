/**
 * Pure helpers for building the temporary HLS playlist + FFmpeg arg vector
 * used by the download + bulk-download flows. Extracted for regression
 * testing of the RTMP push recording fix (2026-04-24):
 *
 *   Bug: Hard-coded `#EXT-X-TARGETDURATION:3` breaks manifests for RTMP push
 *        cameras, whose GOP-aligned segments run 4s+ (HLS spec: target must
 *        be >= every segment duration). FFmpeg also needs `-bsf:a aac_adtstoasc`
 *        to mux RTMP's ADTS AAC into an MP4 container — otherwise it aborts
 *        with "Malformed AAC bitstream detected" and emits a ~1KB empty file.
 *
 * RTSP recordings go through an FFmpeg pull-pipeline that already normalises
 * both dimensions, which is why the bug appeared RTMP-only in the field.
 */

export interface PlaylistSegment {
  duration: number;
  /** Signed/presigned/proxy URL that FFmpeg can fetch. */
  url: string;
}

/**
 * A source-of-truth view of a DB RecordingSegment row projected down to the
 * fields this module cares about. Keeps the helper decoupled from the Prisma
 * model so the unit tests don't need a full Prisma mock.
 */
export interface SourceSegment {
  duration: number;
  url: string;
  /**
   * `true` if we've verified this TS contains at least one H.264 IDR NAL.
   * `false` if we've verified it does NOT. `null | undefined` for legacy
   * rows that were archived before the column existed — we trust them so
   * RTSP-pull recordings that predate the probe continue to play.
   */
  hasKeyframe?: boolean | null;
}

/**
 * Drop leading segments whose `hasKeyframe === false`. Stops at the first
 * row where `hasKeyframe !== false` (true or null/undefined) and returns
 * everything from there onward.
 *
 * Rationale (Phase 19.1 layer-7): RTMP push recordings often start mid-GOP
 * and the first 1-2 TS files then contain only non-IDR slices with no
 * SPS/PPS. FFmpeg (download path) silently skips these to the first IDR,
 * but hls.js (playback path) hard-faults on them. Since both paths share
 * this helper we trim both — the download artefact stays byte-for-byte
 * equivalent to what FFmpeg would have produced, the hls.js manifest
 * starts on a decodable fragment, and legacy RTSP rows are untouched.
 */
export function skipLeadingNonKeyframeSegments<T extends SourceSegment>(
  segments: T[],
): T[] {
  const firstPlayable = segments.findIndex((s) => s.hasKeyframe !== false);
  return firstPlayable < 0 ? [] : segments.slice(firstPlayable);
}

/**
 * Compute the `#EXT-X-TARGETDURATION` integer for a playlist.
 * HLS requires target >= every `#EXTINF`. We round up; minimum of 1 guards
 * empty/degenerate inputs so the manifest stays spec-valid.
 */
export function computeTargetDuration(segments: PlaylistSegment[]): number {
  if (segments.length === 0) return 1;
  const max = Math.max(...segments.map((s) => s.duration || 0));
  return Math.max(1, Math.ceil(max));
}

/**
 * Build a VOD HLS v3 MPEG-TS playlist. Deliberately omits EXT-X-MAP — SRS v6
 * produces MPEG-TS, never fMP4, so any EXT-X-MAP reference would break both
 * FFmpeg transmux and hls.js playback.
 */
export function buildDownloadPlaylist(segments: PlaylistSegment[]): string {
  const targetDuration = computeTargetDuration(segments);
  let m3u8 = '#EXTM3U\n#EXT-X-VERSION:3\n';
  m3u8 += `#EXT-X-TARGETDURATION:${targetDuration}\n`;
  m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
  m3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n';
  for (const seg of segments) {
    const dur = (seg.duration ?? 0).toFixed(6);
    m3u8 += `#EXTINF:${dur},\n`;
    m3u8 += `${seg.url}\n`;
  }
  m3u8 += '#EXT-X-ENDLIST\n';
  return m3u8;
}

/**
 * Build the FFmpeg argv for HLS -> fragmented MP4 remux.
 *
 * `-bsf:a aac_adtstoasc` is mandatory for RTMP push inputs (AAC arrives in
 * ADTS framing; MP4 stores raw AAC). The filter is a safe no-op when the
 * input AAC is already raw, so we apply it unconditionally to cover both
 * ingest paths with one code path.
 *
 * `-protocol_whitelist file,http,https,tcp,tls,crypto` lets FFmpeg read both
 * the on-disk playlist and the MinIO presigned URLs referenced inside it.
 */
export function buildRemuxArgs(inputPlaylistPath: string, outputTarget: string): string[] {
  return [
    '-y',
    '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
    '-i', inputPlaylistPath,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4',
    outputTarget,
  ];
}
