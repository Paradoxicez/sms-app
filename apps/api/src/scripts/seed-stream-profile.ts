/**
 * apps/api/src/scripts/seed-stream-profile.ts
 *
 * Seed a default StreamProfile for every Organization that has zero profiles.
 * Phase 26 DEPLOY-16. Idempotent (re-running on a populated DB inserts nothing).
 *
 * Run order in sms-migrate:
 *   1. prisma migrate deploy
 *   2. node dist/scripts/init-buckets.js
 *   3. node dist/scripts/seed-stream-profile.js   ← this script
 *
 * Field values: 1080p H.264 / 2500kbps video / AAC 128k audio / 25fps.
 * These were the v1.2 production defaults validated by Phase 21 hot-reload.
 *
 * Schema reality check: StreamProfile.orgId is REQUIRED. On a fresh VM with
 * zero Organizations (pre-create-admin), there is no org to attach to —
 * the script logs and exits 0. Phase 29 create-admin creates the system org;
 * subsequent compose `up -d` re-runs this seed which fills the gap.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL,
});

async function main(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true, slug: true } });

  if (orgs.length === 0) {
    console.log(
      '[seed-stream-profile] No organizations exist yet — skipping. ' +
        'This is expected on a fresh deploy before bin/sms create-admin runs. ' +
        'The seed will run again on the next docker compose up.',
    );
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const org of orgs) {
    const existing = await prisma.streamProfile.count({ where: { orgId: org.id } });
    if (existing > 0) {
      skipped += 1;
      continue;
    }

    await prisma.streamProfile.create({
      data: {
        orgId: org.id,
        name: 'default',
        codec: 'h264',
        preset: 'veryfast',
        resolution: '1920x1080',
        fps: 25,
        videoBitrate: '2500k',
        audioCodec: 'aac',
        audioBitrate: '128k',
        isDefault: true,
      },
    });
    created += 1;
    console.log(`[seed-stream-profile] Created default profile for org ${org.slug ?? org.id}`);
  }

  console.log(
    `[seed-stream-profile] Done. created=${created} skipped=${skipped} totalOrgs=${orgs.length}`,
  );
}

main()
  .catch((err) => {
    console.error('[seed-stream-profile] FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
