#!/usr/bin/env node
// One-shot backfill for Phase 19.1 layer-7: probe every RecordingSegment
// archived before the hasKeyframe column existed and populate the flag.
// Safe to re-run — only touches rows where hasKeyframe IS NULL.
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';

const prisma = new PrismaClient();

function containsH264Keyframe(buffer) {
  const end = buffer.length - 4;
  let i = 0;
  while (i <= end) {
    if (buffer[i] === 0 && buffer[i+1] === 0 && buffer[i+2] === 0 && buffer[i+3] === 1) {
      if ((buffer[i+4] & 0x1f) === 5) return true;
      i += 4; continue;
    }
    if (buffer[i] === 0 && buffer[i+1] === 0 && buffer[i+2] === 1) {
      if ((buffer[i+3] & 0x1f) === 5) return true;
      i += 3; continue;
    }
    i += 1;
  }
  return false;
}

async function fetchFromMinio(orgId, objectPath) {
  return new Promise((resolve, reject) => {
    const bucket = `org-${orgId}`;
    const p = spawn('docker', ['compose', 'exec', '-T', 'minio', 'mc', 'cat', `local/${bucket}/${objectPath}`], {
      cwd: '/Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app',
    });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.on('close', (code) => {
      if (code !== 0) reject(new Error(`mc cat exit=${code}`));
      else resolve(Buffer.concat(chunks));
    });
    p.on('error', reject);
  });
}

async function main() {
  const recordingId = process.argv[2];
  if (!recordingId) {
    console.error('usage: backfill-keyframe.mjs <recordingId>');
    process.exit(2);
  }

  const segments = await prisma.recordingSegment.findMany({
    where: { recordingId, hasKeyframe: null },
    orderBy: { seqNo: 'asc' },
  });
  console.log(`Probing ${segments.length} segments for recording ${recordingId}`);

  let hits = 0, misses = 0;
  for (const seg of segments) {
    try {
      const buf = await fetchFromMinio(seg.orgId, seg.objectPath);
      const has = containsH264Keyframe(buf);
      await prisma.recordingSegment.update({
        where: { id: seg.id },
        data: { hasKeyframe: has },
      });
      if (has) hits++; else misses++;
      process.stdout.write(has ? '.' : 'x');
    } catch (err) {
      console.error(`\nFAILED seq=${seg.seqNo}: ${err.message}`);
    }
  }
  console.log(`\nDone. hasKeyframe=true: ${hits}, false: ${misses}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
