import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { spawn } from 'child_process';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { MinioService } from '../recordings/minio.service';
import { PlaybackService } from '../playback/playback.service';

/**
 * SnapshotService — populates camera-card thumbnails.
 *
 * Source: tokenized SRS HLS URL minted via PlaybackService.createSession —
 * required because srs.conf has hls_ctx on, which forces on_play auth on
 * every playlist GET. Without a valid `?token=` the playlist returns 403
 * and FFmpeg sees "End of file" → snapshot fails silently.
 *
 * The session also handles the edge-cluster case (PlaybackService selects the
 * least-loaded edge node when one exists) — single source of truth for the
 * URL shape that on_play will validate. One-frame extract via ffmpeg → MinIO
 * `snapshots` bucket → Camera.thumbnail update.
 *
 * Snapshots are a regenerable CACHE — best-effort, no transactions, no retries
 * beyond the natural retrigger on next online transition. Failures are logged
 * but never thrown upstream from the fire-and-forget path so the on_publish
 * callback path remains unaffected.
 *
 * Per-camera in-process dedup: refreshOne() short-circuits if a refresh is
 * already in flight for that cameraId. Prevents the bulk refresh-all + an
 * on_hls hook from spawning two concurrent FFmpegs for one camera.
 */
@Injectable()
export class SnapshotService implements OnModuleInit {
  private readonly logger = new Logger(SnapshotService.name);
  private readonly inFlight = new Set<string>();
  private lastBulkRefreshAt = 0;
  private readonly bulkDebounceMs = 5_000; // page-mount spam protection

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly minio: MinioService,
    // Quick task 260426-06n: lazy DI mirrors cameras.controller.ts pattern.
    // CamerasModule does NOT import PlaybackModule (would form a cycle:
    // Cameras → Playback → Cluster → Srs → Cameras). ModuleRef walks the
    // global scope at call time so PlaybackService is resolved without any
    // module-graph change.
    private readonly moduleRef: ModuleRef,
  ) {}

  private playbackRef: PlaybackService | null = null;
  private getPlaybackService(): PlaybackService {
    if (!this.playbackRef) {
      this.playbackRef = this.moduleRef.get(PlaybackService, { strict: false });
    }
    return this.playbackRef;
  }

  /**
   * Cheap existence check used by the on_hls callback to decide whether a
   * mid-stream catch-up snapshot is needed. Single indexed lookup; acceptable
   * to call on every segment (every ~2s per camera) — no caching layer
   * needed, the DB load is negligible for the camera fleet sizes we target
   * (single-host SaaS).
   */
  async hasSnapshot(cameraId: string): Promise<boolean> {
    const row = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      select: { thumbnail: true },
    });
    return Boolean(row?.thumbnail);
  }

  async onModuleInit(): Promise<void> {
    await this.minio.ensureSnapshotsBucket();
  }

  /**
   * Grab one frame, upload, update DB. Returns the new URL.
   * Throws on hard failure (used by the per-camera HTTP endpoint).
   */
  async refreshOne(cameraId: string): Promise<string> {
    if (this.inFlight.has(cameraId)) {
      this.logger.debug(
        `Snapshot refresh already in flight for ${cameraId} — skipping`,
      );
      const existing = await this.prisma.camera.findUnique({
        where: { id: cameraId },
        select: { thumbnail: true },
      });
      if (existing?.thumbnail) return existing.thumbnail;
      throw new Error(
        'Snapshot refresh in flight; no prior thumbnail to return',
      );
    }
    this.inFlight.add(cameraId);
    try {
      const camera = await this.prisma.camera.findUnique({
        where: { id: cameraId },
        select: { id: true, orgId: true },
      });
      if (!camera) throw new NotFoundException(`Camera ${cameraId} not found`);

      // Quick task 260426-06n: hls_ctx is enabled in srs.conf, so SRS calls
      // on_play to authorize ANY HTTP GET of the playlist — including
      // FFmpeg's. Mint a real playback session and reuse the JWT-signed
      // hlsUrl it returns; that is the only shape on_play will accept.
      // Reuse session.hlsUrl byte-for-byte — DO NOT rebuild the URL by
      // hand, that guarantees the URL we pass to FFmpeg is byte-identical
      // to the URL on_play will validate against. Also auto-handles the
      // edge-cluster case (PlaybackService selects the least-loaded edge
      // node when one exists).
      const session = await this.getPlaybackService().createSession(
        camera.id,
        camera.orgId,
      );

      const buffer = await this.grabFrame(session.hlsUrl);
      const url = await this.minio.uploadSnapshot(cameraId, buffer);
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: { thumbnail: url },
      });
      this.logger.log(`Snapshot refreshed for camera ${cameraId}`);
      return url;
    } finally {
      this.inFlight.delete(cameraId);
    }
  }

  /**
   * Fire-and-forget variant for the SRS on_publish lifecycle hook.
   * Swallows ALL errors — the lifecycle path must not be polluted by snapshot
   * failures (cameras going online MUST NOT be blocked by FFmpeg / MinIO).
   */
  refreshOneFireAndForget(cameraId: string): void {
    this.refreshOne(cameraId).catch((err) => {
      this.logger.warn(
        `Fire-and-forget snapshot refresh failed for ${cameraId}: ${(err as Error).message}`,
      );
    });
  }

  /**
   * Bulk refresh — used by the page-mount endpoint. Iterates online cameras
   * for the given org with chunked concurrency to bound FFmpeg fan-out.
   * Returns immediately (caller awaits the entry, not the work).
   *
   * Debounced: rapid page reloads collapse to one refresh per ~5s.
   */
  async refreshAllForOrg(
    orgId: string,
  ): Promise<{ accepted: true; queued: number }> {
    const now = Date.now();
    if (now - this.lastBulkRefreshAt < this.bulkDebounceMs) {
      this.logger.debug(`Bulk refresh debounced for org ${orgId}`);
      return { accepted: true, queued: 0 };
    }
    this.lastBulkRefreshAt = now;

    const cameras = await this.prisma.camera.findMany({
      where: { orgId, status: 'online' },
      select: { id: true },
    });

    // Concurrency 3 — keeps FFmpeg load bounded on a single Docker host.
    const ids = cameras.map((c) => c.id);
    const concurrency = 3;
    void (async () => {
      for (let i = 0; i < ids.length; i += concurrency) {
        const chunk = ids.slice(i, i + concurrency);
        await Promise.allSettled(
          chunk.map((id) =>
            this.refreshOne(id).catch((err) => {
              // Swallow per-camera failures inside the bulk fan-out so a
              // single broken stream cannot fail-fast the whole batch.
              this.logger.debug(
                `Bulk snapshot refresh skipped ${id}: ${(err as Error).message}`,
              );
            }),
          ),
        );
      }
    })();

    return { accepted: true, queued: ids.length };
  }

  /**
   * Spawn `ffmpeg -i <source> -frames:v 1 -q:v 5 -f image2 -` and collect the
   * JPEG bytes from stdout. Timeout 10s — if SRS hasn't produced a playable
   * segment yet, fail fast and let the next on_publish retry.
   */
  private grabFrame(source: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const args = [
        '-loglevel',
        'error',
        '-rw_timeout',
        '5000000', // 5s I/O timeout (microseconds)
        '-i',
        source,
        '-frames:v',
        '1',
        '-q:v',
        '5',
        '-f',
        'image2',
        '-', // stdout
      ];
      const proc = spawn('ffmpeg', args);
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      proc.stdout.on('data', (c: Buffer) => chunks.push(c));
      proc.stderr.on('data', (c: Buffer) => errChunks.push(c));

      const killTimer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('FFmpeg snapshot timed out after 10s'));
      }, 10_000);

      proc.on('error', (err) => {
        clearTimeout(killTimer);
        reject(err);
      });
      proc.on('close', (code) => {
        clearTimeout(killTimer);
        if (code === 0 && chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          const stderr = Buffer.concat(errChunks).toString('utf8').slice(0, 500);
          reject(
            new Error(`FFmpeg exited code=${code}; stderr=${stderr}`),
          );
        }
      });
    });
  }
}
