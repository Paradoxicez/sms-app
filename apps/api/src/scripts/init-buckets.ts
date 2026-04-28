/**
 * apps/api/src/scripts/init-buckets.ts
 *
 * First-run MinIO bucket bootstrap, executed by the sms-migrate init container
 * (Phase 26 DEPLOY-15). Run order in compose:
 *   1. prisma migrate deploy   (DEPLOY-14)
 *   2. node dist/scripts/init-buckets.js   ← this script
 *   3. node dist/scripts/seed-stream-profile.js   (DEPLOY-16)
 *
 * Idempotent: every operation is gated on Client.bucketExists() before
 * makeBucket(), so re-running the init container produces no errors,
 * no duplicate buckets, no duplicate policy writes.
 *
 * Buckets:
 *   - avatars     (public-read via setBucketPolicy s3:GetObject)   per D-11
 *   - recordings  (default private — no policy set)               per D-10
 */

import { Client } from 'minio';

const PUBLIC_READ_POLICY = (bucket: string): string =>
  JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });

async function ensureBucket(
  client: Client,
  bucket: string,
  publicRead: boolean,
): Promise<void> {
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
    console.log(`[init-buckets] Created bucket: ${bucket}`);
  } else {
    console.log(`[init-buckets] Bucket already exists: ${bucket}`);
  }
  if (publicRead) {
    // setBucketPolicy is idempotent — re-applying the same JSON is a no-op.
    await client.setBucketPolicy(bucket, PUBLIC_READ_POLICY(bucket));
    console.log(`[init-buckets] Applied public-read policy: ${bucket}`);
  }
}

async function main(): Promise<void> {
  const endPoint = process.env.MINIO_ENDPOINT ?? 'minio';
  const port = parseInt(process.env.MINIO_PORT ?? '9000', 10);
  const useSSL = (process.env.MINIO_USE_SSL ?? 'false') === 'true';
  const accessKey =
    process.env.MINIO_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? 'minioadmin';
  const secretKey =
    process.env.MINIO_SECRET_KEY ??
    process.env.MINIO_ROOT_PASSWORD ??
    'minioadmin';

  console.log(
    `[init-buckets] Connecting to MinIO at ${endPoint}:${port} (ssl=${useSSL})`,
  );

  const client = new Client({ endPoint, port, useSSL, accessKey, secretKey });

  // D-11 avatars = public-read; D-10 recordings = private (no policy).
  await ensureBucket(client, 'avatars', true);
  await ensureBucket(client, 'recordings', false);

  console.log('[init-buckets] Done.');
}

main().catch((err) => {
  console.error('[init-buckets] FAILED:', err);
  process.exit(1);
});
