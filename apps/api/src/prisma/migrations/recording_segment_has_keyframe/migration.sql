-- Phase 19.1 / layer-7: add RecordingSegment.hasKeyframe for RTMP push
-- preview fix. Populated at archive time by the H.264 NAL scanner in
-- h264-utils.ts; used by manifest.service + download-playlist.util to
-- drop leading mid-GOP fragments that jam hls.js playback.
--
-- Idempotent: Prisma `db push` adds the column for us on fresh schemas;
-- this script is safe to run before OR after the push because it guards
-- on information_schema. Existing rows stay NULL ("not probed") which
-- the application treats as "trust it" to preserve prior RTSP behaviour.
--
-- NULL vs FALSE semantics are load-bearing here — do NOT default this
-- column to FALSE. That would retro-actively hide every legacy RTSP
-- recording until a backfill job ran.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RecordingSegment' AND column_name = 'hasKeyframe'
  ) THEN
    -- Column already exists (Prisma db push ran). No-op.
    RAISE NOTICE 'RecordingSegment.hasKeyframe already present — skipping';
  ELSE
    -- Column missing (partial/legacy environment). Add it nullable so we
    -- don't force a backfill for recordings that predate the fix.
    ALTER TABLE "RecordingSegment"
      ADD COLUMN "hasKeyframe" BOOLEAN;
    RAISE NOTICE 'Added RecordingSegment.hasKeyframe';
  END IF;
END $$;
