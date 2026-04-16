---
phase: quick
plan: 260416-fnm
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts
  - apps/api/tests/streams/ffmpeg-command.test.ts
  - apps/web/src/app/admin/cameras/components/hls-player.tsx
  - apps/web/src/app/embed/[session]/page.tsx
autonomous: true
must_haves:
  truths:
    - "FFmpeg transcode commands include keyframe interval aligned to 2s HLS fragments"
    - "FFmpeg transcode commands include zerolatency tune for reduced encoder buffering"
    - "hls.js preview player starts closer to live edge with reduced buffer requirements"
    - "hls.js embed player starts closer to live edge with reduced buffer requirements"
  artifacts:
    - path: "apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts"
      provides: "Keyframe-aligned, low-latency FFmpeg transcode commands"
      contains: "-g"
    - path: "apps/api/tests/streams/ffmpeg-command.test.ts"
      provides: "Test assertions for -g and -tune zerolatency"
      contains: "zerolatency"
    - path: "apps/web/src/app/admin/cameras/components/hls-player.tsx"
      provides: "Tuned hls.js config for faster startup"
      contains: "liveSyncDurationCount"
    - path: "apps/web/src/app/embed/[session]/page.tsx"
      provides: "Tuned hls.js config for faster startup"
      contains: "liveSyncDurationCount"
  key_links:
    - from: "ffmpeg-command.builder.ts"
      to: "SRS hls_fragment 2s"
      via: "-g = fps * 2 aligns keyframes to 2s segments"
---

<objective>
Optimize HLS stream startup time through two complementary changes: (1) align FFmpeg keyframe
intervals to SRS's 2-second HLS fragment duration so each segment starts with an IDR frame,
and (2) tune hls.js player configuration to buffer fewer segments before starting playback.

Purpose: Reduce time-to-first-frame for live camera streams from ~6-10s to ~4-6s.
Output: Updated FFmpeg command builder, updated test assertions, tuned hls.js configs in both players.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts
@apps/api/tests/streams/ffmpeg-command.test.ts
@apps/web/src/app/admin/cameras/components/hls-player.tsx
@apps/web/src/app/embed/[session]/page.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: FFmpeg keyframe alignment + zerolatency tune</name>
  <files>apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts, apps/api/tests/streams/ffmpeg-command.test.ts</files>
  <behavior>
    - Transcode test (codec=libx264, fps=30): addOutputOptions called with ['-g', '60']
    - Transcode test (codec=libx264, fps=30): addOutputOptions called with ['-tune', 'zerolatency']
    - Transcode test (codec=libx264, fps=15): addOutputOptions called with ['-g', '30']
    - Default fps case (no fps in profile): addOutputOptions called with ['-g', '30'] (fallback 15*2)
    - Copy branch: addOutputOptions NOT called with -g or -tune (unchanged)
  </behavior>
  <action>
In `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts`, in the `else` branch (libx264 transcode path, starting at line 32):

After `cmd.videoCodec('libx264');` and the preset line, add two new output options:
```typescript
const gopSize = (profile.fps || 15) * 2;
cmd.addOutputOptions(['-g', String(gopSize)]);
cmd.addOutputOptions(['-tune', 'zerolatency']);
```

This sets the GOP (Group of Pictures) size to exactly 2 seconds worth of frames, matching SRS's `hls_fragment: 2s` config. The zerolatency tune disables B-frames and reduces encoder look-ahead buffering.

Do NOT touch the copy branch (lines 26-31) or the audio section (lines 43+).

In `apps/api/tests/streams/ffmpeg-command.test.ts`:

1. In the existing "should build transcode command with -c:v libx264" test (line 88), add after the existing assertions:
   ```typescript
   expect(cmd.addOutputOptions).toHaveBeenCalledWith(['-g', '60']);
   expect(cmd.addOutputOptions).toHaveBeenCalledWith(['-tune', 'zerolatency']);
   ```

2. Add a new test case for default fps fallback:
   ```typescript
   it('should use default fps=15 for GOP size when fps not specified', () => {
     const profile: StreamProfile = {
       codec: 'libx264',
       audioCodec: 'aac',
     };
     const cmd = buildFfmpegCommand(
       'rtsp://192.168.1.100/stream',
       'rtmp://srs:1935/live/org-1/cam-1',
       profile,
       true,
     );
     expect(cmd.addOutputOptions).toHaveBeenCalledWith(['-g', '30']);
     expect(cmd.addOutputOptions).toHaveBeenCalledWith(['-tune', 'zerolatency']);
   });
   ```
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx vitest run apps/api/tests/streams/ffmpeg-command.test.ts</automated>
  </verify>
  <done>
    - libx264 branch emits `-g <fps*2>` and `-tune zerolatency` output options
    - Copy branch unchanged (no -g, no -tune)
    - All existing tests pass, two new assertions added to transcode test, one new default-fps test added
  </done>
</task>

<task type="auto">
  <name>Task 2: hls.js player tuning for faster startup</name>
  <files>apps/web/src/app/admin/cameras/components/hls-player.tsx, apps/web/src/app/embed/[session]/page.tsx</files>
  <action>
In `apps/web/src/app/admin/cameras/components/hls-player.tsx` (preview player), update the `new Hls({...})` config at line 31 to add four properties after `lowLatencyMode: true`:
```typescript
const hls = new Hls({
  enableWorker: true,
  lowLatencyMode: true,
  liveSyncDurationCount: 2,
  liveMaxLatencyDurationCount: 5,
  maxBufferLength: 10,
  backBufferLength: 0,
  xhrSetup: (xhr) => {
    xhr.withCredentials = true;
  },
});
```

In `apps/web/src/app/embed/[session]/page.tsx` (embed player), update the `new Hls({...})` config at line 67 to add the same four properties after `lowLatencyMode: true`:
```typescript
const hls = new Hls({
  enableWorker: true,
  lowLatencyMode: true,
  liveSyncDurationCount: 2,
  liveMaxLatencyDurationCount: 5,
  maxBufferLength: 10,
  backBufferLength: 0,
});
```

These settings reduce the default liveSyncDurationCount from 3 to 2 (start 2 segments behind live edge instead of 3), cap max latency at 5 segments, limit forward buffer to 10s, and disable back-buffer to free memory.
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
    - Both hls-player.tsx and embed page.tsx include liveSyncDurationCount, liveMaxLatencyDurationCount, maxBufferLength, and backBufferLength in Hls config
    - TypeScript compiles without errors
    - No other changes to player logic (retry, error handling, etc.)
  </done>
</task>

</tasks>

<verification>
1. `npx vitest run apps/api/tests/streams/ffmpeg-command.test.ts` -- all tests pass including new -g and -tune assertions
2. `npx tsc --noEmit --project apps/web/tsconfig.json` -- frontend compiles cleanly
3. Grep confirmation: `grep -n '\-g\|zerolatency' apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts` shows both options in transcode branch
4. Grep confirmation: `grep -n 'liveSyncDurationCount' apps/web/src/app/admin/cameras/components/hls-player.tsx apps/web/src/app/embed/\[session\]/page.tsx` shows config in both players
</verification>

<success_criteria>
- FFmpeg transcode commands include `-g <fps*2>` for keyframe alignment with SRS 2s HLS fragments
- FFmpeg transcode commands include `-tune zerolatency` for reduced encoder buffering
- Both hls.js players configured with liveSyncDurationCount=2, liveMaxLatencyDurationCount=5, maxBufferLength=10, backBufferLength=0
- All existing tests pass, new test assertions cover the keyframe/tune options
- No changes to copy branch or audio handling
</success_criteria>

<output>
After completion, create `.planning/quick/260416-fnm-optimize-hls-stream-startup-time-ffmpeg-/260416-fnm-SUMMARY.md`
</output>
