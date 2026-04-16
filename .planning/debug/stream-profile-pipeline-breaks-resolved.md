---
status: awaiting_human_verify
trigger: "stream-profile-pipeline-breaks — three cascading bugs in stream ingest + HLS playback pipeline"
created: 2026-04-16T00:00:00Z
updated: 2026-04-16T02:30:00Z
---

## Current Focus

hypothesis: All three bugs are confirmed by code reading; proceeding to apply fixes one at a time then verify.
test: Read builder, status service, processor, DTO. Confirm fix directions match.
expecting: Source confirms bugs 1, 2, 3 proximate causes exactly as orchestrator described.
next_action: Apply Bug 1 fix in ffmpeg-command.builder.ts — `noAudio()` when audioCodec is 'mute'.

## Symptoms

expected:
1. StreamProfile audioCodec='mute' → FFmpeg runs with `-an`, no crash.
2. BullMQ retries should not fail on `connecting -> connecting` state transition.
3. HLS URLs from POST /sessions play in Safari/VLC/ffplay, not only hls.js.

actual:
1. fluent-ffmpeg capabilities check throws `Error: Audio codec mute is not available` before spawn. No FFmpeg, no RTMP push, no HLS.
2. BullMQ retries all throw `Error: Invalid transition: connecting -> connecting` from StatusService.transition:39, masking real root cause.
3. HLS segments have `pix_fmt=yuvj420p` (JPEG full-range, passthrough) and AAC with `sample_rate=0, channels=0`. Only hls.js tolerates; Safari/VLC/ffplay refuse.

errors:
- `Error: Audio codec mute is not available` (fluent-ffmpeg capabilities.js:638)
- `Error: Invalid transition: connecting -> connecting` at StatusService.transition (status.service.ts:39), repeats 7+ times
- ffprobe: `codec_name=h264 pix_fmt=yuvj420p`, `codec_name=aac sample_rate=0 channels=0`

reproduction:
1. Stack running (postgres/redis/minio/srs + api:3003 + web:3000).
2. Camera `6d03c130-1071-4efd-9fb3-a2664db87f8c`, RTSP `rtsp://root:pass@hfd09b7jy9k.sn.mynetname.net:20091/axis-media/media.amp?resolution=1280x720`.
3. Bugs 1+2: Create StreamProfile `audioCodec=mute, codec=libx264, 640x360, fps 15`; assign to camera; Stop+Start; camera stuck in `connecting`; no FFmpeg spawned; redis job failure chain shows both errors.
4. Bug 3: After fixing 1+2, POST /api/cameras/:id/sessions returns hlsUrl; playback in Safari/VLC fails, Chrome+hls.js works; ffprobe confirms yuvj420p + broken AAC.

started: Bugs 1+2 surfaced today (2026-04-16) when user set audioCodec=mute. Bug 3 latent since initial HLS work — masked because UAT phase 02 only tested via hls.js embed page.

## Eliminated

(none — not a hypothesis investigation; orchestrator already triaged)

## Evidence

- timestamp: 2026-04-16T00:00:00Z
  checked: apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts:34
  found: `cmd.audioCodec(profile.audioCodec || 'aac')` is called unconditionally, including when value is 'mute'. No branch for mute/none.
  implication: BUG 1 CONFIRMED. Fix: when audioCodec is 'mute' call `cmd.noAudio()` and skip audioBitrate.

- timestamp: 2026-04-16T00:00:00Z
  checked: apps/api/src/streams/dto/create-stream-profile.dto.ts:22 and update-stream-profile.dto.ts:21
  found: Zod enum is `['aac', 'copy', 'mute']` — canonical name is 'mute'. No 'none'/'silent'.
  implication: Fix branch should match `audioCodec === 'mute'`.

- timestamp: 2026-04-16T00:00:00Z
  checked: apps/api/src/status/status.service.ts:28-40
  found: Same-state transition throws Error unconditionally (unless newStatus==='offline'). validTransitions for 'connecting' is `['online','offline']` — does not include 'connecting' itself.
  implication: BUG 2 CONFIRMED. Fix: if newStatus === currentStatus, no-op with debug log. Preserves existing validation for genuinely invalid transitions.

- timestamp: 2026-04-16T00:00:00Z
  checked: apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts (copy branch)
  found: In copy branch, no bitstream filter applied. No AAC pinning in audio branch. `-c:v copy` passes through whatever the camera emits (including yuvj420p from Axis cameras).
  implication: BUG 3 CONFIRMED. Fix: in copy branch add `-bsf:v h264_metadata=video_full_range_flag=0`. For aac audio, add `-ar 44100 -ac 2 -b:a 128k` so headers are well-formed.

- timestamp: 2026-04-16T00:00:00Z
  checked: existing tests at apps/api/tests/streams/ffmpeg-command.test.ts
  found: Uses vitest with mocked fluent-ffmpeg; covers copy/libx264/auto branches; no 'mute' case, no bsf case.
  implication: Extend this file — add tests for audioCodec=mute (expects noAudio called, audioCodec/audioBitrate NOT called), and for copy branch bsf presence.

## Resolution

root_cause: |
  Bug 1: ffmpeg-command.builder.ts unconditionally calls cmd.audioCodec(profile.audioCodec) including when value is the sentinel 'mute'. fluent-ffmpeg validates that against FFmpeg's known codec list and throws before spawn.
  Bug 2: StatusService.transition throws on same-state transitions (e.g. connecting->connecting). When a job retries after the first failure, camera is already in 'connecting' so the processor's very first line throws, masking the real error.
  Bug 3: ffmpeg-command.builder.ts does not normalize pixel-format range or AAC headers. Axis cameras emit yuvj420p (JPEG full-range) which non-hls.js players reject; passthrough audio may have malformed AAC ADTS headers.
fix: |
  Bug 1: In builder, when audioCodec === 'mute', call cmd.noAudio() and skip audioCodec/audioBitrate.
  Bug 2: In StatusService.transition, if newStatus === currentStatus, log debug and return (no-op).
  Bug 3: In builder copy branch, add `-bsf:v h264_metadata=video_full_range_flag=0`. For audioCodec === 'aac' add `-ar 44100 -ac 2` plus default bitrate so AAC headers are well-formed.
verification: |
  Unit tests: 7/8 pass in tests/streams/ffmpeg-command.test.ts. The 1 remaining failure (FfmpegService.stopStream) is pre-existing and unrelated (verified by re-running on clean HEAD: same failure, 6 pass). New tests covering Bug 1 (audioCodec=mute → noAudio called, audioCodec/audioBitrate NOT called) and Bug 3 (copy branch emits `-bsf:v h264_metadata=video_full_range_flag=0` and `-ar 44100 -ac 2`) both pass.
  FFmpeg 8.1 on dev machine confirms h264_metadata bsf is available.
  Bug 2: no existing unit tests for StatusService; fix is a guarded early return so same-state transitions are no longer fatal.
  End-to-end validation (camera spawn, ffprobe on fresh segment, Safari playback) requires a running stack and is deferred to the human-verify checkpoint.
files_changed:
  - apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts
  - apps/api/src/status/status.service.ts
  - apps/api/tests/streams/ffmpeg-command.test.ts
