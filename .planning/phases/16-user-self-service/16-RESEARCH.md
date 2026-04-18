# Phase 16: User Self-Service - Research

**Researched:** 2026-04-18
**Domain:** Account settings UI + avatar upload pipeline + plan-usage aggregation (full-stack)
**Confidence:** HIGH (stack + patterns all verified against repo); MEDIUM on Better Auth error envelope details (verified via github issue, not official docs)

## Summary

Phase 16 adds `/app/account` (tenant) and `/admin/account` (super admin) pages that let a signed-in user (1) edit display name, (2) upload/remove avatar, (3) change password with `revokeOtherSessions`, and — on tenant only — (4) view plan + usage read-only. Everything is additive: no schema change (`User.image` already exists), no new auth routes on the NestJS side (Better Auth auto-mounts `/api/auth/update-user`, `/api/auth/change-password`, `/api/auth/revoke-other-sessions` via the catch-all `AuthController`), and storage quota logic already exists in `RecordingsService.checkStorageQuota` [VERIFIED: code inspection].

Three **new** pieces of backend work: (a) avatar controller (`POST/DELETE /api/users/me/avatar`) with `FileInterceptor` + `ParseFilePipe` guarding size/MIME, `sharp` transcoding to WebP 256×256, and a new `avatars` MinIO bucket with an anonymous-read policy so `user.image` can be a stable public URL; (b) new `PlanUsageService` that composes existing aggregators (`Package` row, `RecordingSegment._sum.size`, `StatusService.getViewerCount`, SRS kbps for bandwidth, `ApiKeyUsage` MTD sum + Redis today-delta) behind `GET /api/organizations/:orgId/plan-usage`; (c) `zxcvbn-ts` consumed lazily from the Security section only. On the frontend: three composite components under `components/account/`, sidebar dropdown extended with "Account settings", and react-hook-form + zod (pattern already used in `create-org-dialog.tsx`).

**Primary recommendation:** Build on the existing `MinioService` (add `ensureAvatarsBucket` / `uploadAvatar` / `removeAvatar`), reuse `RecordingsService.checkStorageQuota` and `DashboardService.getStats` logic verbatim via a thin composition layer — do NOT re-implement aggregation queries. Use stable public URLs with a cache-busting version suffix (`?v={timestamp}`) stored in `User.image` to sidestep CDN/browser cache when the user replaces their avatar.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Account Page Structure & Portal Scope**
- **D-01:** Account page exists in **BOTH portals** — `/app/account` (tenant) และ `/admin/account` (super admin). Super admin ต้องจัดการ display name/password/avatar ของตัวเอง.
- **D-02:** Plan & Usage section **แสดงเฉพาะใน `/app/account`** (tenant). Super admin ไม่เห็น section นี้.
- **D-03:** Navigation entry = **sidebar footer dropdown** (ต่อยอดจาก `sidebar-footer.tsx`). เพิ่ม "Account settings" เหนือ "Sign out".
- **D-04:** Layout = **single page + sections** (Profile, Security, Plan & Usage).
- **D-05:** Email change **DEFER ออก** — out of scope Phase 16.

**Profile — Name & Avatar**
- **D-06:** Display name ใช้ `authClient.updateUser({ name })`.
- **D-07:** Avatar storage = MinIO bucket ใหม่ชื่อ `avatars` (shared, ไม่ใช่ per-org). Key pattern: `{userId}.webp`. เก็บ URL ลง `user.image` ผ่าน `authClient.updateUser({ image })`. ไม่มี schema change.
- **D-08:** Upload constraints ≤ 2MB, format JPEG/PNG/WebP. Server-side transcode → WebP 256×256 center-crop ด้วย `sharp`.
- **D-09:** ไม่มี client-side crop UI.
- **D-10:** ปุ่ม "Remove avatar" → ลบจาก MinIO + set `user.image = null`.

**Security — Password Change**
- **D-11:** บังคับกรอก current password. ใช้ `authClient.changePassword({ currentPassword, newPassword })`.
- **D-12:** Policy ≥ 8 ตัวอักษร (Better Auth default).
- **D-13:** Strength bar 3 ระดับ (weak/medium/strong) ด้วย `zxcvbn`.
- **D-14:** หลัง change สำเร็จ → `authClient.revokeOtherSessions()` คง current session.

**Plan & Usage (tenant-only)**
- **D-15:** แสดง cameras, concurrent viewers, bandwidth, storage, API calls (count only, no max), feature flags.
- **D-16:** Snapshot (cameras/viewers/storage) vs MTD (API calls, bandwidth).
- **D-17:** On-demand query. Single endpoint `GET /api/organizations/:orgId/plan-usage`.
- **D-18:** Upgrade UI = static info text ไม่มีปุ่ม.
- **D-19:** Plan page read-only 100%.

### Claude's Discretion

- Exact toast/notification wording (UI-SPEC already specified — follow it)
- Avatar upload component styling (dropzone vs button — UI-SPEC says button)
- Progress bar color thresholds (UI-SPEC already specified 80/95)
- Exact form layout/spacing within sections (UI-SPEC already specified)
- Error state designs (UI-SPEC specified toasts + inline per case)

### Deferred Ideas (OUT OF SCOPE)

- **Email change** — defer; separate phase when SMTP ready (USER-04)
- **Self-serve upgrade / Stripe checkout** — marked out of scope in PROJECT.md
- **Support ticket system** — separate phase
- **Active sessions list / revoke individual sessions** — Better Auth supports but not requested
- **2FA / passkey** — not in requirements
- **Client-side avatar crop UI** — only if feedback says center-crop isn't enough
- **`maxApiCallsPerMonth` field on Package** — Plan viewer shows API-call count without a cap per D-15

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| USER-01 | User เปลี่ยนชื่อและ password ได้เองในหน้า Account | §3 (display name pipeline) + §6 (password change + zxcvbn) |
| USER-02 | User upload avatar ได้ | §1 (sharp pipeline) + §2 (MinIO shared bucket) + §4 (avatar URL lifecycle) + §7 (upload endpoint) |
| USER-03 | User ดู plan, usage/limits ได้ใน Plan page (view-only) | §5 (plan-usage aggregation) + §9 (API calls MTD) + §10 (bandwidth MTD) + §11 (storage used) |

---

## 1. `sharp` Pipeline (Avatar Transcoding)

**Recommendation:** Use `sharp@^0.34.5` with strict input limits, cover-fit center-crop at 256×256, and WebP output at quality 82. Decode only AFTER the multer size guard has already rejected > 2 MB uploads.

**Exact pipeline** (runs inside the new `AvatarService.transcode(buffer)`):

```typescript
// Source: sharp API docs https://sharp.pixelplumbing.com/api-resize + api-constructor
import sharp from 'sharp';

async function transcodeAvatar(input: Buffer): Promise<Buffer> {
  return sharp(input, {
    // Defense against pixel-bombs. Default is 268_402_689 (16384²);
    // tighten to 25 MP — any legit avatar upload is well under this.
    limitInputPixels: 25_000_000,
    // Abort on malformed/truncated pixel data, not just metadata.
    // Default is 'warning'; bump to 'error' because we don't want partial decodes.
    failOn: 'error',
  })
    .rotate() // honour EXIF orientation (selfies from phones)
    .resize(256, 256, {
      fit: 'cover',          // crop to exactly 256×256 preserving aspect
      position: 'centre',    // D-08: center-crop
      kernel: 'lanczos3',    // sharp default; explicit for clarity
      withoutEnlargement: false,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}
```

**Why these options:**
- `limitInputPixels: 25_000_000` [CITED: sharp constructor docs] — constructor guard rejects pixel bombs (e.g., a 2 MB PNG can decode to 1 GB RAM if dimensions are adversarial)
- `failOn: 'error'` [CITED: sharp api-constructor] — safer than default `'warning'` for untrusted input
- `.rotate()` with no argument applies EXIF orientation then strips EXIF — critical because phone cameras often store the rotation in metadata
- `fit: 'cover', position: 'centre'` matches D-08 center-crop exactly [CITED: sharp api-resize]
- `webp quality 82` produces ~12-25 KB output at 256×256 — well under MinIO per-object overhead

**NestJS worker/memory considerations:**
- `sharp` is native (libvips) and is NOT thread-blocking because libvips itself runs image ops on its own thread pool
- Default libvips concurrency = one thread per core. For an avatar-only use case (bursts of 1-2 MB, not 4K video frames), leave at default
- If we observe OOM under load: set `SHARP_CONCURRENCY=1` env var OR call `sharp.concurrency(1)` in `AvatarService.onModuleInit`
- Sharp is sync-friendly via `.toBuffer()` Promise — no need for worker_threads

**Install:**
```bash
npm --workspace @sms-platform/api install sharp@^0.34.5
```

**Source:** [sharp API resize](https://sharp.pixelplumbing.com/api-resize) [VERIFIED: WebFetch 2026-04-18], [sharp constructor options](https://sharp.pixelplumbing.com/api-constructor) [VERIFIED: WebFetch 2026-04-18], `npm view sharp version` → 0.34.5 [VERIFIED: npm registry 2026-04-18].

---

## 2. MinIO Shared `avatars` Bucket

**Recommendation:** Extend existing `MinioService` (apps/api/src/recordings/minio.service.ts) with three new methods alongside the per-org recording bucket methods. Bucket name = `avatars`. Apply an anonymous read-only bucket policy so any browser can load `https://minio.example.com/avatars/{userId}.webp` without a presigned URL.

**Why public-read (not signed URLs):**
- Avatars are shown in sidebar dropdown on EVERY request — signing a new URL per page load would require server-side session call + MinIO round-trip
- Signed URLs expire; embedding them in `user.image` means they become stale
- Avatars are NOT sensitive (user chose to upload it as their identity); access-control is already via knowing the user ID
- Trade-off: user IDs become enumerable from avatar URLs — acceptable for B2B internal tool; if ever sensitive, switch to signed URLs with `on_load` refresh

**New methods on `MinioService`:**

```typescript
// Source: minio-js setBucketPolicy API + existing MinioService pattern
async ensureAvatarsBucket(): Promise<void> {
  const bucket = 'avatars';
  const exists = await this.client.bucketExists(bucket);
  if (!exists) {
    await this.client.makeBucket(bucket);
  }
  // Idempotent — always apply policy (covers case where bucket existed but policy
  // was cleared). Policy grants anonymous s3:GetObject on avatars/* only.
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };
  await this.client.setBucketPolicy(bucket, JSON.stringify(policy));
  this.logger.log(`Avatars bucket ready (public-read)`);
}

async uploadAvatar(userId: string, buffer: Buffer): Promise<string> {
  const bucket = 'avatars';
  const objectName = `${userId}.webp`;
  // Cache-Control: browsers + CDNs cache aggressively; D-10 "Remove" means
  // we'll use a version suffix (?v=TIMESTAMP) in the user.image URL to bust.
  await this.client.putObject(bucket, objectName, buffer, buffer.length, {
    'Content-Type': 'image/webp',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  return this.getAvatarUrl(userId);
}

async removeAvatar(userId: string): Promise<void> {
  await this.client.removeObject('avatars', `${userId}.webp`);
}

getAvatarUrl(userId: string, version?: number): string {
  const endpoint = this.configService.get<string>('MINIO_PUBLIC_ENDPOINT')
    ?? this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
  const port = this.configService.get<string>('MINIO_PUBLIC_PORT')
    ?? this.configService.get<string>('MINIO_PORT', '9000');
  const scheme = this.configService.get<string>('MINIO_USE_SSL') === 'true'
    ? 'https' : 'http';
  const v = version ?? Date.now();
  return `${scheme}://${endpoint}:${port}/avatars/${userId}.webp?v=${v}`;
}
```

**Bootstrap:** Call `ensureAvatarsBucket()` in `AvatarService.onModuleInit()` (or `UsersModule.onModuleInit`) — matches the pattern `RecordingsService` uses for per-org buckets.

**CORS:** MinIO bucket-level CORS is NOT needed because browsers download avatars via plain `<img src>` (no XHR, no preflight). If we ever add client-side crop (deferred D-09), revisit.

**Sources:** existing [minio.service.ts pattern](apps/api/src/recordings/minio.service.ts) [VERIFIED: code], [MinIO `mc anonymous set`](https://docs.min.io/enterprise/aistor-object-store/reference/cli/mc-anonymous/mc-anonymous-set/) [CITED: MinIO docs], [minio-js setBucketPolicy](https://github.com/minio/minio-js) — Node.js client version `^8.0.7` already in use.

---

## 3. Better Auth `authClient.updateUser` — Display Name & Image

**Recommendation:** `updateUser` covers BOTH D-06 (name) and the follow-up write after avatar upload (D-07 writing `image` URL). It is auto-mounted at `POST /api/auth/update-user` by `AuthController` (catch-all `@All('*path')` handler in `apps/api/src/auth/auth.controller.ts`). No new NestJS route is required for name/image updates.

**Usage pattern (client):**

```typescript
// Source: https://www.better-auth.com/docs/concepts/users-accounts [VERIFIED: WebFetch]
import { authClient } from '@/lib/auth-client';
import { toast } from 'sonner';

// D-06 display name
const { data, error } = await authClient.updateUser({ name: form.name });
if (error) {
  toast.error('Failed to save changes. Please try again.');
  return;
}
toast.success('Display name updated');

// D-07 avatar URL (called after successful avatar upload returns the URL)
await authClient.updateUser({ image: avatarUrl });

// D-10 remove avatar
await authClient.updateUser({ image: null });
```

**Session refresh:** After `updateUser`, call `authClient.getSession()` or use `useSession()` hook's refetch so the sidebar footer avatar re-renders. The session cookie itself doesn't change; only the cached user record does.

**Verified fields:** `name`, `image` are documented. Email/password require separate endpoints (see §6).

**Source:** [Better Auth users-accounts docs](https://www.better-auth.com/docs/concepts/users-accounts) [VERIFIED: WebFetch 2026-04-18].

---

## 4. Avatar URL Lifecycle — Cache Busting

**Problem:** `User.image` is shown in sidebar + Account page. When user replaces avatar, the URL (`https://minio/avatars/{userId}.webp`) is byte-identical, but the content changed. Browsers + CDNs will serve stale cached versions.

**Options considered:**

| Strategy | Pros | Cons |
|----------|------|------|
| Unique key per upload (`{userId}-{uuid}.webp`) | No cache bust needed | Orphan old files; 1 delete + 1 upload per change; hard to garbage-collect |
| Stable key + `?v={timestamp}` querystring in `image` column | Single file per user, simple delete-on-remove, cache hits survive page refreshes | URL in `image` changes each upload (acceptable) |
| Stable key + signed URLs with short TTL | Forces fresh fetch | Re-sign cost per page load; URL expiry breaks stored references |

**Recommendation:** Stable key `{userId}.webp` + timestamp version in URL. The MinIO `putObject` overwrites, and `authClient.updateUser({ image: url })` writes the full URL including `?v=1713456789000` into `User.image`. Browsers treat `?v=X` as a different cache key, so new uploads bypass any stale cache.

```
user.image = "https://minio.example.com:9000/avatars/abc-123.webp?v=1713456789000"
```

On remove (D-10): `removeAvatar()` deletes MinIO object, then `updateUser({ image: null })` clears the column. Avatar component falls back to initials.

**Cache-Control header:** `public, max-age=31536000, immutable` is safe because we change the URL on each replacement. The `immutable` directive prevents revalidation round-trips.

**Source:** This is the canonical pattern used by GitHub, Google, etc. for avatar CDN serving. [ASSUMED: industry-standard pattern; no direct citation — verified approach by reasoning about cache semantics.]

---

## 5. Plan-Usage Aggregation — Single Endpoint Composition

**Recommendation:** Create `apps/api/src/plan-usage/plan-usage.service.ts` + `plan-usage.controller.ts`. The service COMPOSES four existing data sources — does NOT re-implement their queries. Controller path `GET /api/organizations/:orgId/plan-usage`, guarded by `AuthGuard` (every org member may read their own plan).

**Endpoint response shape:**

```typescript
type PlanUsageResponse = {
  package: {
    id: string;
    name: string;
    description: string | null;
    maxCameras: number;
    maxViewers: number;
    maxBandwidthMbps: number;
    maxStorageGb: number;
    features: Record<string, boolean>;
  } | null; // null when org has no package assigned (edge case per UI-SPEC)
  usage: {
    cameras: number;                // snapshot
    viewers: number;                // snapshot (SRS concurrent)
    bandwidthMtdBytes: string;      // MTD, BigInt → string via global JSON.toJSON
    storageUsedBytes: string;       // snapshot (sum of RecordingSegment.size)
    apiCallsMtd: number;            // MTD, int
  };
};
```

**Service composition** (pseudo-code; full impl in planner):

```typescript
@Injectable()
export class PlanUsageService {
  constructor(
    @Inject(TENANCY_CLIENT) private readonly tenancy: any,
    private readonly rawPrisma: PrismaService,        // for cross-org safe queries
    private readonly statusService: StatusService,     // viewer counts (in-memory)
    private readonly srsApiService: SrsApiService,     // live bandwidth (kbps)
    @Inject(REDIS_CLIENT) private readonly redis: Redis, // today's API usage
  ) {}

  async getPlanUsage(orgId: string): Promise<PlanUsageResponse> {
    // 1. Package + cameras snapshot — one query
    const [org, cameras] = await Promise.all([
      this.rawPrisma.organization.findUnique({
        where: { id: orgId },
        include: { package: true },
      }),
      this.rawPrisma.camera.findMany({
        where: { orgId },
        select: { id: true },
      }),
    ]);

    // 2. Concurrent viewers — in-memory sum from StatusService (zero DB cost)
    const viewers = cameras.reduce(
      (sum, c) => sum + this.statusService.getViewerCount(c.id),
      0,
    );

    // 3. Storage — reuse RecordingsService.checkStorageQuota pattern
    //    (don't call it directly because we only need usageBytes, not limit math)
    const storage = await this.rawPrisma.recordingSegment.aggregate({
      where: { orgId },
      _sum: { size: true },
    });
    const storageUsedBytes = storage._sum.size ?? 0n;

    // 4. Bandwidth MTD — ApiKeyUsage aggregate + Redis today-delta
    //    (mirrors DashboardService.getUsageTimeSeries pattern)
    const firstOfMonth = new Date();
    firstOfMonth.setUTCDate(1);
    firstOfMonth.setUTCHours(0, 0, 0, 0);
    const { bandwidthMtd, apiCallsMtd } = await this.aggregateApiUsage(
      orgId, firstOfMonth,
    );

    return {
      package: org?.package ? serializePackage(org.package) : null,
      usage: {
        cameras: cameras.length,
        viewers,
        bandwidthMtdBytes: bandwidthMtd.toString(),
        storageUsedBytes: storageUsedBytes.toString(),
        apiCallsMtd,
      },
    };
  }
}
```

**Critical notes:**
- Use `PrismaService` (raw, no RLS) with manual `where: { orgId }` — matches the pattern in `RecordingsService.checkStorageQuota` that uses `rawPrisma.recordingSegment.aggregate` [VERIFIED: recordings.service.ts:284]. Tenancy-extended prisma may not scope aggregations correctly because RLS policies apply at row level but aggregate uses view-level queries. The AuthGuard writes `ORG_ID` to CLS — we use that as the `where` filter input (the URL param `:orgId` must match the authenticated user's active org, guarded explicitly).
- **Authorization check:** The endpoint is `GET /api/organizations/:orgId/plan-usage` but we must verify the caller is a member of `:orgId`. Reuse `MembersController.getMyMembership` logic or inline: fail 403 if `session.user.id` is not a `Member` of `:orgId`.
- **Zero-query for viewers:** `StatusService.getViewerCount` reads an in-memory Map. At realistic scale (hundreds of cameras per org) the reduce is microseconds. No DB hit.
- **Bandwidth source choice:** Use `ApiKeyUsage.bandwidth` MTD sum + today's Redis delta. Do NOT use SRS live kbps for "MTD bandwidth" because that's a point-in-time instantaneous number, not a cumulative month. SRS kbps is used by the Dashboard for "current bandwidth" but the Plan page asks for MTD (D-16).

**Sources:** existing [dashboard.service.ts `getUsageTimeSeries`](apps/api/src/dashboard/dashboard.service.ts) [VERIFIED: code] pattern for ApiKeyUsage + Redis; [recordings.service.ts `checkStorageQuota`](apps/api/src/recordings/recordings.service.ts) [VERIFIED: code] for storage aggregation.

---

## 6. Better Auth `changePassword` — Edge Cases

**Recommendation:** Call `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` — Better Auth has a built-in `revokeOtherSessions` option on `changePassword`, so we do NOT need a separate `revokeOtherSessions()` call. This is one round-trip and atomic [VERIFIED: Better Auth users-accounts docs via WebFetch].

```typescript
// Client — Security section submit
const { data, error } = await authClient.changePassword({
  currentPassword: form.currentPassword,
  newPassword: form.newPassword,
  revokeOtherSessions: true,  // D-14 — atomic in one call
});

if (error) {
  // Wrong current password → INVALID_PASSWORD code, HTTP 400
  if (error.code === 'INVALID_PASSWORD') {
    form.setError('currentPassword', { message: 'Current password is incorrect.' });
    return;
  }
  toast.error('Failed to change password. Please try again.');
  return;
}

// Success: session cookie stays (current session preserved); other sessions invalidated
toast.success('Password changed. Signed out from other devices.');
form.reset();
```

**Error envelope:**
- Wrong current password → HTTP 400 with body `{ error: { code: 'INVALID_PASSWORD', message: '...' } }` [CITED: better-auth issue discussion [#2400](https://github.com/better-auth/better-auth/issues/2400) describing customizable error codes; actual `INVALID_PASSWORD` code confirmed as the standard code for this endpoint per community + search result attribution]
- Password too short → HTTP 400 — server enforces `minPasswordLength: 8` from `auth.config.ts` [VERIFIED: auth.config.ts:24]
- No session → HTTP 401 UNAUTHORIZED
- Note: sign-in endpoint uses HTTP 401 UNAUTHORIZED with a less-specific code per [#4379](https://github.com/better-auth/better-auth/issues/4379); changePassword uses HTTP 400 INVALID_PASSWORD which is distinct

**Auto-mounted route:** `POST /api/auth/change-password`. Catch-all `AuthController` forwards everything under `/api/auth/*` to Better Auth's Node handler [VERIFIED: auth.controller.ts:18 `@All('*path')`]. No explicit NestJS route needed.

**Source:** [Better Auth email-password docs](https://www.better-auth.com/docs/authentication/email-password), [Better Auth users-accounts docs](https://www.better-auth.com/docs/concepts/users-accounts) [VERIFIED: WebFetch 2026-04-18], [better-auth #4379](https://github.com/better-auth/better-auth/issues/4379) [MEDIUM confidence — issue confirms UNAUTHORIZED for signIn, INVALID_PASSWORD is standard for password-specific errors per #2400 custom error discussion].

---

## 7. Avatar Upload Endpoint — NestJS Multipart

**Recommendation:** New `AvatarController` inside `UsersModule` (or a new `AccountModule`). Use `FileInterceptor('file')` with a `limits.fileSize` option at the multer level (rejects BEFORE loading into RAM) + `ParseFilePipeBuilder` for MIME sniffing after buffer is materialized.

```typescript
// Source: NestJS file-upload docs + community examples [VERIFIED: WebSearch]
import {
  Controller, Post, Delete, UseGuards, UseInterceptors,
  UploadedFile, Req, HttpStatus,
  ParseFilePipeBuilder, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AvatarService } from './avatar.service';

@ApiExcludeController()
@UseGuards(AuthGuard)
@Controller('api/users/me/avatar')
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      // Multer rejects AT STREAM LEVEL once 2 MB is exceeded — DoS protection
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Req() req: any,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 2 * 1024 * 1024 })
        .addFileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ })
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    const userId = req.user.id;
    const url = await this.avatarService.uploadForUser(userId, file.buffer);
    return { url };
  }

  @Delete()
  async remove(@Req() req: any) {
    await this.avatarService.removeForUser(req.user.id);
    return { removed: true };
  }
}
```

**Dual-layer defense explained:**
1. **`limits.fileSize: 2_097_152`** on `FileInterceptor` — multer aborts the upload stream when this threshold is hit. The buffer never materializes beyond 2 MB + a few bytes. This is the REAL DoS guard; do NOT skip it.
2. **`addFileTypeValidator`** — runs after buffer is materialized; checks `mimetype`. **Caveat:** NestJS 11's `FileTypeValidator` checks magic bytes (via `file-type` internally) in newer versions, but regex string match is also supported. Both acceptable because the `sharp` transcode step (§1) will fail on non-image input, making MIME a belt-and-suspenders check. The sharp `failOn: 'error'` option will throw for bogus input and the controller returns 500 → convert to 400 via try/catch in the service.

**Why NOT trust `Content-Type` header alone:** An attacker can send `Content-Type: image/jpeg` with a `.exe` payload. The `ParseFilePipeBuilder` + `sharp` decode combination defeats this because `sharp` will throw on non-image data.

**Client-side upload (reference):**
```typescript
const formData = new FormData();
formData.append('file', file);
const res = await fetch('/api/users/me/avatar', {
  method: 'POST',
  credentials: 'include',
  body: formData,  // NO Content-Type header — browser sets multipart boundary
});
```

**Source:** [NestJS file-upload docs](https://docs.nestjs.com/techniques/file-upload) [MEDIUM confidence — WebFetch returned empty; verified via WebSearch with consistent community examples], [`@nestjs/platform-express` 11.1.19](https://www.npmjs.com/package/@nestjs/platform-express) [VERIFIED: npm view]. Multer is bundled with `@nestjs/platform-express`.

---

## 8. `zxcvbn-ts` — Bundle Size & Lazy Loading

**Recommendation:** Use `@zxcvbn-ts/core` (v3.0.4) — the modern TypeScript fork — NOT legacy `zxcvbn` (v4.4.2, Dropbox original). Load it with `next/dynamic` or a client-side `import()` only inside `PasswordStrengthBar.tsx` so it ships in a separate chunk.

**Why `@zxcvbn-ts/core` over `zxcvbn`:**
| Property | `zxcvbn-ts/core` v3 | `zxcvbn` v4.4.2 |
|----------|---------------------|-----------------|
| Dictionaries | Separate packages (`common-packages`, `language-{en,th,...}`) — tree-shake-friendly | Bundled monolithic ~400 KB gzipped |
| TypeScript types | First-class | Community types only |
| Bundle (core only, no dict) | ~40 KB gzipped | N/A (core not separable) |
| Maintained | Active (2024-2025) | Maintenance mode |
| API compatibility | `zxcvbn(password)` → `{ score, feedback, ... }` (compatible) | Same |

**Install:**
```bash
npm --workspace @sms-platform/web install @zxcvbn-ts/core @zxcvbn-ts/language-common @zxcvbn-ts/language-en
```

**Usage (client-only, lazy):**

```typescript
// components/account/password-strength-bar.tsx
'use client';

import { useEffect, useState } from 'react';

type Zxcvbn = (password: string) => { score: 0 | 1 | 2 | 3 | 4 };

export function PasswordStrengthBar({ password }: { password: string }) {
  const [score, setScore] = useState<0 | 1 | 2 | 3 | 4 | null>(null);
  const [zxcvbn, setZxcvbn] = useState<Zxcvbn | null>(null);

  // Lazy-load zxcvbn-ts only when Security section mounts
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ zxcvbn, zxcvbnOptions }, common, en] = await Promise.all([
        import('@zxcvbn-ts/core'),
        import('@zxcvbn-ts/language-common'),
        import('@zxcvbn-ts/language-en'),
      ]);
      zxcvbnOptions.setOptions({
        dictionary: { ...common.dictionary, ...en.dictionary },
        graphs: common.adjacencyGraphs,
        translations: en.translations,
      });
      if (alive) setZxcvbn(() => zxcvbn as Zxcvbn);
    })();
    return () => { alive = false; };
  }, []);

  // Debounce per UI-SPEC (150ms)
  useEffect(() => {
    if (!zxcvbn || !password) { setScore(null); return; }
    const t = setTimeout(() => setScore(zxcvbn(password).score), 150);
    return () => clearTimeout(t);
  }, [password, zxcvbn]);

  // D-13: compress 0-4 → 3 levels
  const level = score === null ? 'empty'
              : score <= 1 ? 'weak'
              : score <= 3 ? 'medium' : 'strong';
  // Render 3 segments...
}
```

**Bundle impact:** Only the Security section pays the ~80-120 KB gzipped cost (core + en + common). Tenant users who never open Account Settings don't pay. Initial `/app/account` page load remains small because the Security section is rendered but `import()` returns asynchronously.

**Sources:** `npm view @zxcvbn-ts/core version` → 3.0.4 [VERIFIED: npm registry 2026-04-18], [zxcvbn-ts GitHub](https://github.com/zxcvbn-ts/zxcvbn) [CITED: official docs].

---

## 9. API Calls MTD — Query Strategy

**Current infrastructure** (verified in `apps/api/src/api-keys/api-keys.service.ts` and `api-key-usage.processor.ts`):
- Hot path: each API request calls `recordUsage(keyId, bytes)` → Redis `INCR` on key `apikey:usage:{keyId}:{YYYY-MM-DD}:requests` + `INCRBY ...bandwidth`. Redis keys expire after 72 h as a safety net.
- Cold path: BullMQ repeatable job at `0 5 * * * UTC` calls `aggregateDaily()` → flushes Redis → upserts into `ApiKeyUsage` table (unique `(apiKeyId, date)`).

**So "MTD API calls" means:** SUM of `ApiKeyUsage.requests` for all API keys of the org where `date >= first-of-UTC-month` AND `date < today` PLUS today's Redis `requests` counter.

**Recommendation:** Exactly mirror `DashboardService.getUsageTimeSeries` logic — it already does this hybrid sum for arbitrary ranges. Extract a private helper:

```typescript
// Inside PlanUsageService
private async aggregateApiUsage(
  orgId: string,
  since: Date,
): Promise<{ apiCallsMtd: number; bandwidthMtd: bigint }> {
  // 1. Persisted rows (yesterday and earlier)
  const persisted = await this.rawPrisma.apiKeyUsage.aggregate({
    where: {
      date: { gte: since },
      apiKey: { orgId },
    },
    _sum: { requests: true, bandwidth: true },
  });

  // 2. Today's in-flight counters from Redis
  const orgKeys = await this.rawPrisma.apiKey.findMany({
    where: { orgId },
    select: { id: true },
  });
  const orgKeyIds = new Set(orgKeys.map((k) => k.id));
  const today = new Date().toISOString().slice(0, 10);

  let todayRequests = 0;
  let todayBandwidth = 0n;
  const requestKeys = await this.redis.keys(`apikey:usage:*:${today}:requests`);
  for (const rKey of requestKeys) {
    const keyId = rKey.split(':')[2];
    if (!orgKeyIds.has(keyId)) continue;
    const [reqStr, bwStr] = await Promise.all([
      this.redis.get(rKey),
      this.redis.get(rKey.replace(':requests', ':bandwidth')),
    ]);
    todayRequests += parseInt(reqStr ?? '0', 10);
    todayBandwidth += BigInt(bwStr ?? '0');
  }

  return {
    apiCallsMtd: (persisted._sum.requests ?? 0) + todayRequests,
    bandwidthMtd: (persisted._sum.bandwidth ?? 0n) + todayBandwidth,
  };
}
```

**Cost at realistic volumes:**
- `apiKeyUsage` is indexed on `apiKeyId` and `date` (schema lines 375-376). A MTD query over 30 days × N keys is < 100 rows for typical orgs; aggregate is milliseconds.
- `redis.keys(pattern)` is O(N) in the keyspace — acceptable because the TTL caps active keys to ~2-3 days of usage × all api keys platform-wide, not per-org. At < 10,000 keys total this is still sub-10ms. If we ever scale past that, switch to `SCAN` + per-org indexed key pattern.
- D-17 says "on-demand" — no caching needed. A /plan-usage request takes < 100 ms in the common case.

**Source:** existing [api-keys.service.ts `aggregateDaily`](apps/api/src/api-keys/api-keys.service.ts) + [dashboard.service.ts `getUsageTimeSeries`](apps/api/src/dashboard/dashboard.service.ts) [VERIFIED: code inspection].

---

## 10. Bandwidth MTD

**Same answer as §9.** Bandwidth is stored in `ApiKeyUsage.bandwidth` (BigInt) alongside `requests`. The `aggregateApiUsage` helper above returns `bandwidthMtd: bigint` in bytes. The UI converts to Mbps for the progress bar:

```typescript
// UI-side conversion for progress bar per UI-SPEC "Bandwidth (MTD)"
//   bar value: bandwidthMtdBytes / (max_mbps × bytes_per_mbit × days_elapsed_in_month × 1_seconds)
// But UI-SPEC shows "45 / 100 Mbps" which implies AVERAGE, not cumulative.
// Simpler: show cumulative GB consumed this month with progress bar vs
// the monthly budget derived from maxBandwidthMbps × seconds_in_month / 8.
```

**⚠ Ambiguity — needs planner clarification:** UI-SPEC shows `45 / 100 Mbps` suggesting instantaneous rate, but D-16 says bandwidth is MTD (cumulative). Two possible reconciliations:

1. **Cumulative-as-rate:** Show `avgMbps = bandwidthMtdBytes × 8 / (seconds_elapsed_in_month × 1e6)`. Progress vs `maxBandwidthMbps`. Physically meaningful but confusing UX because early-month value is zero.
2. **Cumulative bytes vs monthly budget (GB):** `bandwidthMtdGB / maxBandwidthGB` where `maxBandwidthGB = maxBandwidthMbps × (30 × 86400) / 8 / 1024`. Clearer to users, breaks the `Mbps` label in UI-SPEC.

**Recommendation:** Planner should propose option 1 (rename UI label to "Avg bandwidth" or keep Mbps) as it matches the existing `maxBandwidthMbps` semantic on Package. Flag in PLAN for user confirm.

**Source:** `ApiKeyUsage.bandwidth` schema [VERIFIED: schema.prisma:371], existing `DashboardService` treats bandwidth as cumulative bytes [VERIFIED: code]. Bar-vs-Mbps mapping is NEW to this phase.

---

## 11. Storage "Used GB"

**Cheapest accurate source:** `SELECT SUM(size) FROM RecordingSegment WHERE orgId = ?` — already implemented in `RecordingsService.checkStorageQuota` [VERIFIED: recordings.service.ts:284-287].

**Why not other sources:**
- **`Recording.totalSize`** — summed per-recording, but `totalSize` is incremented on segment write. Aggregating at segment level is the canonical truth; if a segment is deleted by retention but `totalSize` wasn't decremented (bug-risk), we'd drift. Segment-level sum is self-correcting.
- **MinIO stats API (`/minio/v2/metrics/cluster`)** — requires enabling the Prometheus exporter and querying metrics; adds new dependency. Also double-counts buckets across orgs.
- **Filesystem scan** — not containerized, not portable.

**Recommendation:** Copy the `aggregate` call verbatim from `checkStorageQuota` into `PlanUsageService.getPlanUsage`. Don't call `checkStorageQuota` directly because it also computes quota/allowed flags that we don't need.

Indexed on `(orgId, cameraId, timestamp)` [VERIFIED: schema.prisma:555] — aggregate is a single index-range scan. Fast even at 10M segment rows.

**Source:** [recordings.service.ts:258-300](apps/api/src/recordings/recordings.service.ts) [VERIFIED: code].

---

## 12. Form Patterns — Confirm Stack

**Verified stack already in use** for modern dialogs (react-hook-form + zod + shadcn Form/Input/Button, with Sonner toasts):
- `apps/web/src/app/admin/organizations/components/create-org-dialog.tsx` [VERIFIED: code]
- `apps/web/src/app/admin/organizations/components/edit-org-dialog.tsx`
- `apps/web/src/app/admin/packages/components/create-package-dialog.tsx`
- `apps/web/src/app/admin/packages/components/edit-package-dialog.tsx`
- `apps/web/src/app/admin/users/components/create-platform-user-dialog.tsx`
- `apps/web/src/app/app/team/components/add-team-member-dialog.tsx`
- `apps/web/src/app/(auth)/sign-in/page.tsx`

**Inconsistency to note:** `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` uses `useState` (not react-hook-form). UI-SPEC says react-hook-form for Phase 16 — follow the modern dialog pattern, NOT camera-form-dialog.

**Canonical pattern (from create-org-dialog.tsx) to mirror in `AccountProfileSection` and `AccountSecuritySection`:**

```typescript
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(100),
});

function ProfileForm({ defaultName }: { defaultName: string }) {
  const {
    register, handleSubmit, formState: { errors, isSubmitting, isDirty },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: defaultName },
    mode: 'onBlur',          // UI-SPEC §Interaction Patterns
    reValidateMode: 'onChange',
  });

  async function onSubmit(data: z.infer<typeof schema>) {
    const { error } = await authClient.updateUser({ name: data.name });
    if (error) { toast.error('Failed to save changes. Please try again.'); return; }
    toast.success('Display name updated');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Label htmlFor="name" className="font-semibold">Display name</Label>
      <Input id="name" placeholder="Your name" {...register('name')} />
      {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
      <Button type="submit" disabled={!isDirty || isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save changes'}
      </Button>
    </form>
  );
}
```

**Deps already installed:** `react-hook-form ^7.72.1`, `@hookform/resolvers ^5.2.2`, `zod ^4.3.6`, `sonner ^2.0.7` [VERIFIED: web/package.json].

**Note on zod version:** web uses Zod 4 (`^4.3.6`), API uses Zod 3 (`^3.25.76`). Zod 4 has breaking changes from 3 (e.g., `z.string().min()` messages, error types). This is already the case pre-Phase 16 — follow whatever the web-side peers use in existing dialogs. No action needed.

---

## 13. Sidebar Footer Extension

**Recommendation:** Add an `accountHref?: string` prop to `SidebarFooterContent` (default `/app/account`) and a single new `DropdownMenuItem` above the existing separator + `Sign out`. The two layout callers pass the right href:

```typescript
// apps/web/src/components/nav/sidebar-footer.tsx — diff sketch
interface SidebarFooterContentProps {
  userName?: string;
  userEmail?: string;
  orgName?: string;
  accountHref?: string;   // NEW — default "/app/account"
}

// Inside DropdownMenuContent, BEFORE the existing Separator + Sign out:
<DropdownMenuSeparator />
<DropdownMenuItem asChild>
  <Link href={accountHref ?? "/app/account"} className="flex items-center">
    <UserCog className="mr-2 h-4 w-4" />
    Account settings
  </Link>
</DropdownMenuItem>
<DropdownMenuSeparator />   {/* separates from destructive sign-out */}
<DropdownMenuItem onClick={handleSignOut} className="text-destructive">
  <LogOut className="mr-2 h-4 w-4" />
  Sign out
</DropdownMenuItem>
```

**Layout wiring:**

```typescript
// apps/web/src/app/app/layout.tsx — pass accountHref="/app/account"
<AppSidebar ... userEmail={user?.email} accountHref="/app/account" />

// apps/web/src/app/admin/layout.tsx — pass accountHref="/admin/account"
<AppSidebar ... accountHref="/admin/account" />
```

`AppSidebar` forwards the prop to `SidebarFooterContent`. One new prop through the tree; no new runtime detection. Matches UI-SPEC §Navigation Entry recommendation.

**Avatar on footer trigger:** Phase-16 bonus — the trigger currently shows initials only. Enhance to show `user.image` when present, falling back to initials (matches existing `components/ui/avatar.tsx`). Optional for v1 but trivial to add since `user.image` flows through the already-fetched session.

**Source:** [sidebar-footer.tsx](apps/web/src/components/nav/sidebar-footer.tsx) [VERIFIED: code], [app-sidebar.tsx](apps/web/src/components/nav/app-sidebar.tsx) [VERIFIED: code].

---

## Standard Stack

### Core (already in project — reuse)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | ^1.6.1 | Account mgmt (updateUser, changePassword, revokeOtherSessions) | Auto-mounted routes; D-06/11/14 uses client directly |
| `@prisma/client` | ^6.19.3 | DB access for plan/usage aggregation | Existing pattern; aggregate helpers |
| `minio` | ^8.0.7 | Object store for avatars | MinioService already exists for recordings |
| `ioredis` | ^5.10.1 | Today's API-usage delta | DashboardService pattern |
| `react-hook-form` | ^7.72.1 | Form state | Pattern in create-org-dialog etc. |
| `@hookform/resolvers` | ^5.2.2 | Zod bridge | Paired with RHF |
| `zod` | ^4.3.6 (web) / ^3.25.76 (api) | Schema validation | Already standard |
| `sonner` | ^2.0.7 | Toasts | UI-SPEC specifies |

### New Dependencies (install)
| Library | Version | Scope | Purpose |
|---------|---------|-------|---------|
| `sharp` | ^0.34.5 | api | Avatar transcoding (WebP, center-crop) |
| `@zxcvbn-ts/core` | ^3.0.4 | web | Password strength score |
| `@zxcvbn-ts/language-common` | latest | web | Base dictionaries (tree-shakable) |
| `@zxcvbn-ts/language-en` | latest | web | English dictionary |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sharp` | `jimp` (pure JS) | Jimp is 10× slower and has no libvips pixel-bomb guard; use only if native compilation is blocked (not the case here — Node 22 + sharp binary wheels work on Docker) |
| `@zxcvbn-ts/core` | `zxcvbn` (Dropbox v4.4.2) | Legacy monolithic bundle, no TS types, maintenance mode |
| Public-read bucket | Signed URLs per request | Per-request signing cost + URL expiry complexity for no security gain at this scope |

**Installation:**
```bash
# API
npm --workspace @sms-platform/api install sharp@^0.34.5

# Web
npm --workspace @sms-platform/web install @zxcvbn-ts/core @zxcvbn-ts/language-common @zxcvbn-ts/language-en
```

**Version verification (performed 2026-04-18 via `npm view`):**
- `sharp` latest = 0.34.5 (published 2025; RC 0.35 available)
- `@zxcvbn-ts/core` latest = 3.0.4
- `better-auth` latest = 1.6.5 (we're on 1.6.1, minor updates available, no action needed for Phase 16)
- `@nestjs/platform-express` latest = 11.1.19 (we're on 11.0.0+, includes multer)

---

## Architecture Patterns

### Recommended Module Structure

```
apps/api/src/
├── account/                    # NEW — groups avatar + plan-usage together
│   ├── avatar/
│   │   ├── avatar.controller.ts   # POST/DELETE /api/users/me/avatar
│   │   └── avatar.service.ts      # sharp transcode + minio write
│   ├── plan-usage/
│   │   ├── plan-usage.controller.ts  # GET /api/organizations/:orgId/plan-usage
│   │   └── plan-usage.service.ts     # composes dashboard/recordings/api-keys aggregations
│   └── account.module.ts          # ties it together
├── recordings/
│   └── minio.service.ts           # EXTENDED — new methods for avatars bucket
└── auth/                          # unchanged — auth routes auto-mounted

apps/web/src/
├── app/
│   ├── app/account/page.tsx       # tenant — all 3 sections
│   └── admin/account/page.tsx     # super admin — Profile + Security only
└── components/account/            # NEW — shared composites
    ├── account-profile-section.tsx
    ├── account-security-section.tsx
    ├── account-plan-section.tsx   # tenant only
    ├── password-strength-bar.tsx  # lazy-loads zxcvbn
    ├── usage-progress-row.tsx
    └── feature-flag-row.tsx
```

**Rationale:** Grouping avatar + plan-usage under `account/` signals "self-service settings module" and keeps MinioService extension under `recordings/` (its existing home) to avoid circular deps. The controller paths stay flat (`/api/users/me/avatar`, `/api/organizations/:orgId/plan-usage`) regardless.

### Pattern 1: Auth-guarded self-route

```typescript
// Source: existing UsersController + members.controller.ts [VERIFIED]
@UseGuards(AuthGuard)        // attaches req.user from Better Auth session
@Controller('api/users/me/avatar')
export class AvatarController {
  @Post()
  async upload(@Req() req: any, @UploadedFile(pipe) file: Express.Multer.File) {
    const userId = req.user.id;           // from AuthGuard
    // ...
  }
}
```

### Pattern 2: Cross-org-safe aggregation with explicit orgId

```typescript
// Source: RecordingsService.checkStorageQuota [VERIFIED: recordings.service.ts]
// Use rawPrisma + explicit where:{orgId} when aggregating.
// Don't rely on RLS for aggregations — it applies to rows, not aggregate queries.
const storage = await this.rawPrisma.recordingSegment.aggregate({
  where: { orgId },
  _sum: { size: true },
});
```

### Anti-Patterns to Avoid

- **Hand-rolling image resize with Canvas / `image-js`** — loses libvips pixel-bomb guards, 10× slower, larger memory footprint. Use `sharp`.
- **Calling `authClient.revokeOtherSessions()` as a second round-trip after `changePassword`** — D-14 looks like two steps but Better Auth's `changePassword` supports `{ revokeOtherSessions: true }` natively. One call.
- **Presigned URLs for avatars** — they expire and break cached references in browser tabs. Use public-read bucket + version-querystring cache bust.
- **Storing full avatar URL including `?v=TS` in DB** — actually this IS the recommendation (§4). What to avoid: storing ONLY the object key without the querystring, forcing server-side URL reconstruction on every read.
- **Trusting `file.mimetype` alone for security** — always pair with `sharp` decode (it throws on non-image input).
- **Using tenant-extended `TENANCY_CLIENT` for aggregate** — use raw `PrismaService` with explicit `where: { orgId }`. RLS + aggregate has edge cases per existing `DashboardService` comment (`// ApiKeyUsage may not be accessible via tenancy client`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image resize / crop | Canvas/`image-js`/`jimp` | `sharp` | Pixel-bomb protection, EXIF rotation, WebP codec, libvips speed |
| Multipart file parsing | `busboy`/`formidable` raw | `FileInterceptor` (multer) | Already bundled with `@nestjs/platform-express`; limits.fileSize is the DoS guard |
| Password strength | Regex / bespoke scoring | `@zxcvbn-ts/core` | Dictionary-driven; industry-standard algorithm from Dropbox research |
| Password change flow | Custom endpoint | `authClient.changePassword({ revokeOtherSessions: true })` | Atomic, session-aware, handles hash compatibility |
| MinIO bucket policy | Imperative calls | `setBucketPolicy(bucket, JSON.stringify(IAM_POLICY))` | Standard AWS IAM JSON; one call applies the whole policy |
| API usage aggregation | New SQL or cron | `aggregateApiUsage` helper mirroring `getUsageTimeSeries` | Existing Redis + Postgres pattern already proven |
| Storage byte count | FS walk / MinIO stats | `prisma.recordingSegment.aggregate({ _sum: { size: true } })` | Indexed, self-correcting, existing |

**Key insight:** Phase 16's novelty is UI and one MinIO bucket + one sharp pipeline. Every other concern (auth, forms, aggregation, multipart) has a working pattern elsewhere in the repo. Resist the urge to rewrite.

---

## Common Pitfalls

### Pitfall 1: Sharp binary missing on alpine/arm
**What goes wrong:** `sharp` pulls a platform-specific libvips binary via `install` script. On Dockerfile alpine + arm64 (common on M1 devs and some CI), pre-built binaries may not exist → falls back to building from source → fails if libvips headers missing.
**Why it happens:** Docker multi-arch targeting; Alpine's musl libc differs from glibc.
**How to avoid:**
- Keep Dockerfile base image on Debian slim (`node:22-bookworm-slim`), NOT alpine
- Or install system deps: `RUN apt-get update && apt-get install -y libvips-dev`
- Test Docker build on both amd64 and arm64 before merge
**Warning signs:** `npm install sharp` takes > 30 s OR shows `node-gyp` output.

### Pitfall 2: `revokeOtherSessions` kills the current session
**What goes wrong:** After password change, user is signed out of the page they're on.
**Why it happens:** If `revokeOtherSessions` is called as a separate endpoint (not via `changePassword`), it may not know which session is "current" relative to the cookie.
**How to avoid:** Use `authClient.changePassword({ revokeOtherSessions: true })` — the single call atomic guarantees the current session is preserved. Verified in Better Auth docs.
**Warning signs:** User lands on sign-in page immediately after clicking Change password.

### Pitfall 3: Avatar cache persists after remove
**What goes wrong:** User clicks Remove; backend deletes MinIO object + sets `user.image = null`. Sidebar still shows old avatar for minutes.
**Why it happens:** Browser cached the previous `https://.../avatars/userId.webp?v=OLD_TIMESTAMP` for a year (Cache-Control immutable). `user.image` is null but some stale component prop didn't update.
**How to avoid:**
- Session refresh after remove: `await authClient.getSession()` with `fetchPolicy: 'network-only'`
- Parent `useSession()` hook propagates the new null to all `<Avatar>` instances
- `<Avatar>` with `src={null}` renders `<AvatarFallback>` — no image request at all
**Warning signs:** Hard refresh fixes it → frontend cache; incognito shows old → CDN cache (unlikely since MinIO is direct).

### Pitfall 4: sharp decoding hangs on a valid-looking malicious SVG
**What goes wrong:** SVG + sharp is a known vector (XXE, huge recursive defs). We blacklisted SVG (D-08 only JPEG/PNG/WebP) but the `FileTypeValidator` uses regex matching; if a user renames `.svg` to `.png` and sends `Content-Type: image/png`, the multer layer accepts it.
**Why it happens:** Content-type is user-controlled; magic-byte sniffing isn't enforced by default regex.
**How to avoid:**
- Sharp's `failOn: 'error'` + decoding step will throw on non-raster input
- Defense in depth: add `file-type` npm package and sniff magic bytes in the service before invoking sharp
**Warning signs:** Odd error messages from sharp like "unsupported SVG" → means the input layer let it through.

### Pitfall 5: Plan-usage returns stale cameras after delete
**What goes wrong:** User deleted 3 cameras yesterday; plan page still shows old count.
**Why it happens:** On-demand query is correct — this is NOT a pitfall IF we actually run the aggregate fresh every call. Risk is if someone adds a response cache "for performance."
**How to avoid:** D-17 says on-demand. No server-side cache. If latency becomes an issue, revisit with a short (30-60s) Redis cache — but NOT in Phase 16 scope.
**Warning signs:** Tests assert stale values; code shows `@CacheTTL()` decorator.

### Pitfall 6: Super admin hits `/admin/account` and sees 404 on plan-usage call
**What goes wrong:** Super admin has no active org (they browse all orgs); if the Account page unconditionally calls `/api/organizations/:orgId/plan-usage`, it 404s or 500s.
**Why it happens:** `orgId` comes from session.activeOrganizationId which is null/different for super admins.
**How to avoid:** Per D-02, the admin Account page does NOT render `AccountPlanSection` at all. Guard in the page: `{portal === 'tenant' && <AccountPlanSection orgId={activeOrgId!} />}`.
**Warning signs:** 404 or 403 in network tab on admin account page.

### Pitfall 7: Zod v4 vs v3 cross-pollution
**What goes wrong:** Writing DTO on the server with zod v3 syntax but web side is v4 — shared types break.
**Why it happens:** `apps/web` has `zod ^4.3.6`, `apps/api` has `zod ^3.25.76`.
**How to avoid:** Each side uses its own zod. DON'T share zod schemas across api↔web. Wire contracts via TypeScript `type` / `interface` in a shared file or duplicate schemas on each side.
**Warning signs:** TypeScript error on `z.infer<typeof Schema>` because inference differs between v3/v4 majors.

---

## Runtime State Inventory

**Not applicable** — Phase 16 is greenfield additive (new routes, new components, new MinIO bucket, no rename/refactor of existing entities). No runtime state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — new feature; reads existing tables | None |
| Live service config | None — no SRS config change; adds new MinIO bucket at boot via `ensureAvatarsBucket()` (idempotent) | None |
| OS-registered state | None | None |
| Secrets/env vars | May need `MINIO_PUBLIC_ENDPOINT`/`MINIO_PUBLIC_PORT` if MinIO is behind a reverse proxy in production (internal endpoint ≠ public) | Planner adds to `.env.example` and documents |
| Build artifacts | None | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MinIO | Avatar storage | ✓ (assumed — used for recordings already) | 8.0.7 client | — |
| Redis | Today's API usage delta | ✓ | 5.10.1 client | — |
| PostgreSQL | All persistent data | ✓ | 16 | — |
| `sharp` native binary | Avatar transcoding | ✗ | — | Must install (`npm install sharp`) + ensure Debian base image. See Pitfall 1 |
| `@zxcvbn-ts/core` | Password strength bar | ✗ | — | Must install |
| Better Auth | Account operations | ✓ | 1.6.1 | — |
| `@nestjs/platform-express` (multer) | Multipart upload | ✓ | 11.x | — |

**Missing dependencies with no fallback:** `sharp`, `@zxcvbn-ts/core` — these are hard requirements for the phase. Planner's Task 1 should be "install deps + verify Docker build succeeds."

**Missing dependencies with fallback:** None.

---

## Code Examples

### Avatar Upload End-to-End

```typescript
// apps/api/src/account/avatar/avatar.service.ts
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import sharp from 'sharp';
import { MinioService } from '../../recordings/minio.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AvatarService implements OnModuleInit {
  constructor(
    private readonly minio: MinioService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.minio.ensureAvatarsBucket();
  }

  async uploadForUser(userId: string, input: Buffer): Promise<string> {
    let webp: Buffer;
    try {
      webp = await sharp(input, { limitInputPixels: 25_000_000, failOn: 'error' })
        .rotate()
        .resize(256, 256, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (err) {
      throw new BadRequestException('Invalid or corrupt image.');
    }
    const url = await this.minio.uploadAvatar(userId, webp);
    // Better Auth session carries user.image; client calls
    // authClient.updateUser({ image: url }) AFTER this returns.
    return url;
  }

  async removeForUser(userId: string): Promise<void> {
    try { await this.minio.removeAvatar(userId); } catch { /* idempotent */ }
    // Client calls authClient.updateUser({ image: null }) after this returns.
  }
}
```

### Plan Usage Endpoint

```typescript
// apps/api/src/account/plan-usage/plan-usage.controller.ts
import { Controller, Get, Param, UseGuards, ForbiddenException, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService } from './plan-usage.service';

@ApiExcludeController()
@UseGuards(AuthGuard)
@Controller('api/organizations/:orgId/plan-usage')
export class PlanUsageController {
  constructor(
    private readonly svc: PlanUsageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async get(@Param('orgId') orgId: string, @Req() req: any) {
    // Verify caller is a member of this org (mirrors MembersController.getMyMembership)
    const membership = await this.prisma.member.findFirst({
      where: { organizationId: orgId, userId: req.user.id },
      select: { userId: true },
    });
    if (!membership) throw new ForbiddenException('Not a member of this organization');
    return this.svc.getPlanUsage(orgId);
  }
}
```

### Security Section Form

```typescript
// apps/web/src/components/account/account-security-section.tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { PasswordStrengthBar } from './password-strength-bar';

const schema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string().min(1),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
}).refine(d => d.currentPassword !== d.newPassword, {
  message: 'New password must be different from your current password.',
  path: ['newPassword'],
});

export function AccountSecuritySection() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });
  const newPassword = form.watch('newPassword');

  async function onSubmit(data: z.infer<typeof schema>) {
    const { error } = await authClient.changePassword({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
      revokeOtherSessions: true,  // D-14 — atomic
    });
    if (error) {
      if ((error as any).code === 'INVALID_PASSWORD') {
        form.setError('currentPassword', { message: 'Current password is incorrect.' });
        return;
      }
      toast.error('Failed to change password. Please try again.');
      return;
    }
    toast.success('Password changed. Signed out from other devices.');
    form.reset();
  }

  // ...render labels, inputs, PasswordStrengthBar, submit button
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zxcvbn (Dropbox monolith ~400 KB) | `@zxcvbn-ts/core` + per-language packages | ~2022 | Tree-shakable, 4× smaller, typed |
| Imagemagick for resize | `sharp` (libvips) | Since 2015, default now | 10× faster, safer against pixel bombs |
| Passport.js sessions | Better Auth | Phase 1 | Built-in orgs, self-serve flows |
| MPEG-TS HLS | fMP4 HLS | v1.0 | Better codec support (H.265) |
| Separate `revokeOtherSessions` call after `changePassword` | `changePassword({ revokeOtherSessions: true })` option | Better Auth 1.x | Atomic in one round-trip |

**Deprecated/outdated:**
- **Dropbox `zxcvbn` (v4.4.2)** — maintenance mode; use `@zxcvbn-ts/core`
- **`jimp` for production resize** — CPU-only JS, pixel-bomb risk; use `sharp`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MinIO public-read is acceptable for avatars (no auth walls) | §2, §4 | If sensitive, switch to signed URLs — adds per-load cost |
| A2 | `user.image` column accepts long URLs including `?v=TS` | §4 | Prisma says `String?` — unlimited text; safe [VERIFIED but marked for planner] |
| A3 | `MINIO_PUBLIC_ENDPOINT`/`PORT` env vars will be configured in deployment | §2 | If only internal endpoint is exposed, browser can't load avatars — resolved by reverse-proxy or signed URLs |
| A4 | Bandwidth MTD cumulative-vs-rate semantics | §10 | UI label says "Mbps" but MTD is bytes — planner must pick + confirm with user |
| A5 | `limitInputPixels: 25_000_000` (25 MP) is sufficient for typical phone photos (≤12 MP) | §1 | Higher-res DSLR photos (>25 MP) would be rejected — planner can bump to 50 MP if needed |
| A6 | Better Auth returns `code: 'INVALID_PASSWORD'` on wrong current password | §6 | If code is different string, `error.code === 'INVALID_PASSWORD'` check misses — fallback message is still shown to user |
| A7 | Docker base image is Debian-slim (not Alpine) | §7 Pitfall 1 | If project uses Alpine, sharp install may fail — verify Dockerfile before install |
| A8 | `redis.keys()` pattern scan acceptable at current scale | §9 | If keyspace > 10K keys, switch to SCAN cursor — mirrors DashboardService pattern so unlikely to be a problem before Dashboard is |

---

## Open Questions

1. **Bandwidth MTD display semantic (§10)** — Progress bar vs `maxBandwidthMbps`: show avg Mbps this month (progresses from 0 upward) or cumulative GB vs monthly budget? UI-SPEC label says "Mbps" but D-16 says MTD.
   - What we know: `ApiKeyUsage.bandwidth` stores cumulative bytes
   - What's unclear: the intended UX — does the user want to see "how much of my monthly cap am I using" or "what's my typical throughput"?
   - Recommendation: Planner proposes Option 1 (avgMbps = bytes × 8 / seconds_elapsed / 1e6) and flag to user in plan discussion. Simple math, preserves UI-SPEC label.

2. **MinIO public endpoint vs internal endpoint in Docker Compose** — `MINIO_ENDPOINT=minio:9000` works in-container, but browsers need `localhost:9000` (dev) or `storage.example.com` (prod).
   - What we know: existing MinioService uses `MINIO_ENDPOINT` for both server-side client and URL generation
   - What's unclear: does the reverse proxy (Next.js rewrites? nginx?) already forward `/minio/*`?
   - Recommendation: Add `MINIO_PUBLIC_ENDPOINT` + `MINIO_PUBLIC_PORT` env vars. Default to `MINIO_ENDPOINT`/`MINIO_PORT` if unset. Planner to document.

3. **Avatar fallback on sidebar trigger** — UI-SPEC §Component Inventory shows Avatar in the Profile section only, but the sidebar-footer currently shows initials-only. Should Phase 16 also update the sidebar trigger to show `user.image`?
   - What we know: `AvatarImage` + `AvatarFallback` primitive is already in place
   - What's unclear: in-scope or deferred polish?
   - Recommendation: IN scope — the avatar field now exists, showing it in the dropdown trigger is a zero-cost win. Flag as bonus task in PLAN.

---

## Project Constraints (from CLAUDE.md)

- **GSD Workflow Enforcement:** Start work through a GSD command; do not make direct repo edits outside a workflow. Phase 16 is executed via `/gsd-execute-phase`.
- **Tech stack:** NestJS 11 + Next.js 15 + PostgreSQL 16 + Prisma 6 + Redis 7 + SRS v6 + FFmpeg 7 + MinIO + Better Auth. No substitutions.
- **Design System:** shadcn base-nova preset; green theme preserved; Lucide icons only.
- **Deployment constraint:** Docker Compose single server. Sharp native binary must work in the chosen base image — implies Debian-based Node image (not Alpine).
- **Security model:** session-based auth for Account; no API key auth for these routes (Better Auth session cookie only).
- **Multi-tenancy:** Shared schema with `org_id` + RLS. Plan-usage endpoint must scope strictly by `orgId` from URL, verified against caller's membership.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2 (api) / Vitest 3 (web) |
| Config file | `apps/api/vitest.config.ts` / `apps/web/vitest.config.ts` |
| Quick run command | `npm --workspace @sms-platform/api test -- --run path/to/test` / `npm --workspace @sms-platform/web test -- --run path/to/test` |
| Full suite command | `npm --workspace @sms-platform/api test && npm --workspace @sms-platform/web test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| USER-01 (name) | `updateUser({ name })` integration through `/api/auth/update-user` | integration | `npm --workspace @sms-platform/api test -- --run tests/account/display-name.int.test.ts` | ❌ Wave 0 |
| USER-01 (password) | `changePassword({ revokeOtherSessions: true })` flow — wrong current returns INVALID_PASSWORD; correct current revokes other sessions | integration | `npm --workspace @sms-platform/api test -- --run tests/account/change-password.int.test.ts` | ❌ Wave 0 |
| USER-02 (upload happy path) | POST multipart 500 KB JPEG → 200 + URL; sharp outputs 256×256 WebP | integration | `npm --workspace @sms-platform/api test -- --run tests/account/avatar-upload.int.test.ts` | ❌ Wave 0 |
| USER-02 (size limit) | POST 3 MB file → 413/422; no MinIO write | integration | same file, additional case | ❌ Wave 0 |
| USER-02 (MIME reject) | POST .gif or .svg → 422; sharp not invoked | integration | same file, additional case | ❌ Wave 0 |
| USER-02 (remove) | DELETE /api/users/me/avatar → 200; subsequent GET returns null image | integration | same file, additional case | ❌ Wave 0 |
| USER-02 (transcode) | sharp transcodes 512×384 JPEG → 256×256 WebP (unit test for AvatarService) | unit | `npm --workspace @sms-platform/api test -- --run tests/account/avatar-service.unit.test.ts` | ❌ Wave 0 |
| USER-03 (package shape) | GET /api/organizations/:orgId/plan-usage returns package + usage fields | integration | `npm --workspace @sms-platform/api test -- --run tests/account/plan-usage.int.test.ts` | ❌ Wave 0 |
| USER-03 (cross-org) | GET with orgId user is NOT a member of → 403 | integration | same file | ❌ Wave 0 |
| USER-03 (no package) | Org with packageId=null returns package: null | integration | same file | ❌ Wave 0 |
| USER-03 (storage count) | Sum matches RecordingSegment.size for orgId (seed 3 segments, verify sum) | integration | same file | ❌ Wave 0 |
| UI — strength bar | Password "password123" yields weak; "Tr0ub4dor&3!@zxcvbn" yields strong | unit | `npm --workspace @sms-platform/web test -- --run src/components/account/password-strength-bar.test.tsx` | ❌ Wave 0 |
| UI — sidebar entry | Rendering SidebarFooterContent with accountHref renders "Account settings" link | unit | `npm --workspace @sms-platform/web test -- --run src/components/nav/sidebar-footer.test.tsx` | ❌ Wave 0 |
| UI — progress threshold | UsageProgressRow at 85% renders amber; at 96% destructive | unit | `npm --workspace @sms-platform/web test -- --run src/components/account/usage-progress-row.test.tsx` | ❌ Wave 0 |
| Smoke — E2E account flow | Upload avatar → change name → change password → verify session still valid | manual-only | documented in `.planning/phases/16-user-self-service/16-HUMAN-UAT.md` (future file) | — |

### Sampling Rate
- **Per task commit:** `npm --workspace @sms-platform/api test -- --run tests/account/` (runs in < 15s once seeded)
- **Per wave merge:** Both workspaces' full test suites
- **Phase gate:** Full suite green + manual UAT sign-off before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/api/tests/account/avatar-service.unit.test.ts` — covers USER-02 transcode happy path + sharp errors
- [ ] `apps/api/tests/account/avatar-upload.int.test.ts` — covers USER-02 size/MIME/remove cases
- [ ] `apps/api/tests/account/display-name.int.test.ts` — covers USER-01 name update (can reuse Better Auth session helpers from existing tests)
- [ ] `apps/api/tests/account/change-password.int.test.ts` — covers USER-01 password + revokeOtherSessions
- [ ] `apps/api/tests/account/plan-usage.int.test.ts` — covers USER-03 endpoint + edge cases
- [ ] `apps/api/tests/account/conftest-like-fixtures.ts` — seed helpers for Package, Member, ApiKeyUsage rows
- [ ] `apps/web/src/components/account/password-strength-bar.test.tsx`
- [ ] `apps/web/src/components/account/usage-progress-row.test.tsx`
- [ ] `apps/web/src/components/nav/sidebar-footer.test.tsx` — new test for the `accountHref` prop

**Framework install:** Vitest already present in both workspaces; no new test framework needed. If needed, add `@nestjs/testing` helpers (already in api devDeps).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | YES | Better Auth session cookie; `changePassword` requires `currentPassword` (D-11). `revokeOtherSessions: true` on password change kills hijacked sessions elsewhere. |
| V3 Session Management | YES | Better Auth — httpOnly secure cookies; 30-day expiry with daily refresh (V3 session lifecycle). `revokeOtherSessions` covers session fixation post-credential-change. |
| V4 Access Control | YES | `AuthGuard` gates all Phase 16 routes. `/api/organizations/:orgId/plan-usage` verifies caller's `Member` row for `orgId` before returning data — explicit check beyond URL parameter. |
| V5 Input Validation | YES | Multer `limits.fileSize: 2MB` (stream-level DoS guard); `ParseFilePipeBuilder.addFileTypeValidator`; sharp `failOn: 'error'` + `limitInputPixels: 25M`; zod schema on name/password fields. |
| V6 Cryptography | PARTIAL | No new crypto — Better Auth handles password hashing (scrypt). Don't re-implement. |
| V8 Data Protection | YES | Avatar URLs are intentionally public (user-chosen identity); password hashes never exposed in any response. `user.image` stored as URL in DB, not blob. |
| V10 Malicious Code | YES | `sharp` decode validates image is not a pixel bomb; untrusted buffer never passed to anything except `sharp` + MinIO write (no `exec`, no template rendering with user content). |
| V11 Business Logic | YES | Plan-usage is read-only (D-19); no upgrade action → no price/plan-manipulation attack surface. |
| V13 API & Web Services | YES | `ApiExcludeController` keeps internal endpoints out of the developer Swagger. CORS origins unchanged (existing tenant UI origins only). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Avatar pixel-bomb (1 MB PNG → 1 GB decoded) | Denial of Service | `sharp({ limitInputPixels: 25M, failOn: 'error' })` + multer `limits.fileSize: 2 MB` before buffer |
| SVG with embedded script / XXE disguised as PNG | Tampering / Info disclosure | Sharp rejects non-raster input with `failOn: 'error'`; defense-in-depth via MIME regex on Content-Type |
| IDOR on avatar delete — user A deletes user B's avatar | Elevation of Privilege | Object key is `{callerUserId}.webp` derived from session, NOT request body; impossible to target another user |
| IDOR on plan-usage — user in org A queries org B's usage | Information Disclosure | Controller verifies `Member` row for `{orgId, session.user.id}` before returning data (403 otherwise) |
| Session hijack persists after password change | Elevation of Privilege | D-14 `revokeOtherSessions: true` — atomic with changePassword via Better Auth |
| Enumeration via `user.image` URL `{userId}.webp` 404 vs 200 | Info Disclosure | User IDs are UUIDs (opaque); knowing a UUID grants no additional capability because avatars are public-by-design anyway |
| Cache poisoning via mutable avatar URL | Tampering | `Cache-Control: public, max-age=31536000, immutable` + querystring version (§4); URL changes on each upload → no poisoning vector |
| Multipart payload exceeding 2 MB exhausting memory | DoS | `FileInterceptor` `limits.fileSize` aborts at stream layer, BEFORE buffer materialization |
| MinIO bucket policy too permissive (write anonymous) | Tampering | Policy grants ONLY `s3:GetObject` for bucket/*; `PutObject` requires server-side credentials |

---

## Sources

### Primary (HIGH confidence)
- `apps/api/src/auth/auth.config.ts` — Better Auth config verified (minPasswordLength: 8, plugins, session)
- `apps/api/src/auth/auth.controller.ts` — Catch-all `@All('*path')` mounts Better Auth routes at `/api/auth/*`
- `apps/api/src/recordings/minio.service.ts` — Existing MinioService pattern for bucket creation + putObject
- `apps/api/src/recordings/recordings.service.ts` — `checkStorageQuota` storage aggregate pattern (lines 258-301)
- `apps/api/src/dashboard/dashboard.service.ts` — `getUsageTimeSeries` Postgres+Redis hybrid aggregation
- `apps/api/src/api-keys/api-keys.service.ts` — `recordUsage` Redis keys + `aggregateDaily`
- `apps/api/src/api-keys/api-key-usage.processor.ts` — BullMQ cron at 00:05 UTC
- `apps/api/src/status/status.service.ts` — In-memory `viewerCounts` Map
- `apps/api/src/users/members.controller.ts` — Per-member auth pattern for `/members/me`
- `apps/api/src/prisma/schema.prisma` — `User.image String?`, `Package`, `Organization`, `ApiKeyUsage`, `RecordingSegment`
- `apps/web/src/components/nav/sidebar-footer.tsx` — Dropdown extension point
- `apps/web/src/app/admin/organizations/components/create-org-dialog.tsx` — Canonical react-hook-form + zod + Sonner pattern
- `apps/web/src/lib/api.ts` — `apiFetch` helper
- [sharp API resize](https://sharp.pixelplumbing.com/api-resize) — cover fit + centre position
- [sharp constructor](https://sharp.pixelplumbing.com/api-constructor) — `limitInputPixels`, `failOn`
- [Better Auth users-accounts](https://www.better-auth.com/docs/concepts/users-accounts) — `updateUser`, `changePassword` with `revokeOtherSessions`
- [Better Auth session management](https://www.better-auth.com/docs/concepts/session-management) — `revokeSession`, `revokeOtherSessions`

### Secondary (MEDIUM confidence)
- [NestJS file upload](https://docs.nestjs.com/techniques/file-upload) — `FileInterceptor`, `ParseFilePipeBuilder` (WebFetch returned stub; confirmed via WebSearch community examples)
- [Better Auth email-password](https://www.better-auth.com/docs/authentication/email-password) — error envelope inference
- [better-auth #2400 Custom error messages](https://github.com/better-auth/better-auth/issues/2400) — error codes are customizable per endpoint
- [better-auth #4379 Incorrect error thrown wrong password](https://github.com/better-auth/better-auth/issues/4379) — confirms INVALID_PASSWORD pattern at the API level
- [MinIO bucket policies guide](https://docs.min.io/enterprise/aistor-object-store/administration/iam/access/)
- `npm view sharp version` = 0.34.5 (2025)
- `npm view @zxcvbn-ts/core version` = 3.0.4
- `npm view better-auth version` = 1.6.5 (we're on 1.6.1)

### Tertiary (LOW confidence)
- Avatar URL cache-busting pattern — industry-standard but no single authoritative citation; reasoned from cache-semantics first principles (§4)

---

## Topic → CONTEXT Decision Mapping

| Research Topic | CONTEXT Decisions Supported |
|----------------|----------------------------|
| §1 Sharp pipeline | D-08 (WebP 256×256 center-crop), D-09 (no client crop — backend does it all) |
| §2 MinIO `avatars` bucket | D-07 (shared bucket, `{userId}.webp` key) |
| §3 Better Auth `updateUser` | D-06 (display name), D-07 (image URL write), D-10 (image = null on remove) |
| §4 Avatar URL lifecycle | D-07 (URL in user.image), D-10 (remove flow with cache bust) |
| §5 Plan-usage aggregation | D-15 (all metrics), D-16 (snapshot vs MTD), D-17 (single on-demand endpoint) |
| §6 Password change edge cases | D-11 (currentPassword required), D-12 (≥8 chars default), D-14 (revokeOtherSessions) |
| §7 Avatar upload endpoint | D-08 (2MB, JPEG/PNG/WebP server-validated) |
| §8 zxcvbn-ts bundle | D-13 (3-level strength bar) |
| §9 API calls MTD | D-15 (API calls count), D-16 (MTD window) |
| §10 Bandwidth MTD | D-15 (bandwidth), D-16 (MTD window) |
| §11 Storage | D-15 (storage used/max), D-16 (snapshot) |
| §12 Form patterns | UI-SPEC §Interaction Patterns (react-hook-form + zod) — supports all D- decisions |
| §13 Sidebar footer | D-03 (sidebar footer entry), D-01/D-02 (portal-specific href) |

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all major deps verified via npm registry and existing code
- Architecture: **HIGH** — patterns verified by code inspection in the very services we'll compose
- Pitfalls: **HIGH** — drawn directly from repo conventions (e.g., BigInt.toJSON patch, RLS-aggregate quirk) and documented sharp/Better Auth behavior
- Better Auth error codes: **MEDIUM** — `INVALID_PASSWORD` is the canonical code but not explicitly shown in current official docs; inferred from community issues + hook examples
- Bandwidth MTD display semantic: **LOW** — ambiguity in UI-SPEC; flagged as Open Question 1 for planner

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days — stack is stable; Better Auth 1.6 is current)
