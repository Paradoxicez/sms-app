import { describe, it, expect } from 'vitest';

describe('Phase 21 — D-03 + Q5 remove-then-add (latest save wins, NOT pure BullMQ dedup)', () => {
  it.todo("enqueue calls queue.getJob('camera:{id}:ffmpeg') to look for existing job before adding");
  it.todo('when existingJob is present, enqueue calls existingJob.remove() before queue.add');
  it.todo("two rapid-fire profile saves for the same camera produce: first remove (no-op, no job) → first add → second remove of first → second add — net 1 job in queue with second-save's data");
  it.todo("jobId is exactly the literal 'camera:' + cameraId + ':ffmpeg' (matches Phase 15 D-11 + streams.service.ts:101 + boot-recovery.service.ts + camera-health.service.ts)");
  it.todo("queue.add is called with options { jobId, attempts: 20, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: false } — matches startStream's options for downstream consistency");
});
