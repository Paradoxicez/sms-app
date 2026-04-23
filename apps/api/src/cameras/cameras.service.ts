import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  forwardRef,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { StreamsService } from '../streams/streams.service';
import { SrsApiService } from '../srs/srs-api.service';
import { AuditService } from '../audit/audit.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { BulkImportDto } from './dto/bulk-import.dto';
import { ProbeJobData } from './types/codec-info';
import { DuplicateStreamUrlError } from './errors/duplicate-stream-url.error';
import { DuplicateStreamKeyError } from './errors/duplicate-stream-key.error';
import {
  generateStreamKey,
  buildPushUrl,
  streamKeyPrefix,
} from './stream-key.util';

@Injectable()
export class CamerasService {
  private readonly logger = new Logger(CamerasService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly tenancy: any,
    private readonly prisma: PrismaService,
    private readonly streamsService: StreamsService,
    // Optional: @InjectQueue can resolve to undefined in test environments
    // where BullModule isn't bootstrapped. bulkImport guards against that.
    @InjectQueue('stream-probe') private readonly probeQueue?: Queue,
    // Phase 19 (D-02): SRS on-publish callback has no CLS context, so
    // enqueueProbeFromSrs must use an RLS-bypass client to look up streamUrl.
    // Optional so existing test harnesses constructing CamerasService with
    // positional args remain compatible (bulk-import.test.ts, hierarchy.test.ts,
    // maintenance.test.ts, camera-crud.test.ts).
    private readonly systemPrisma?: SystemPrismaService,
    // Phase 19.1 (D-20, D-22): SRS kick helper for rotateStreamKey + delete.
    // forwardRef because SrsModule imports CamerasModule via forwardRef.
    // Optional so existing tests still construct with positional args.
    @Inject(forwardRef(() => SrsApiService))
    private readonly srsApi?: SrsApiService,
    // Phase 19.1 (D-21): push-specific audit events. Optional for harness
    // compatibility; real DI path wires the global AuditService.
    private readonly auditService?: AuditService,
  ) {}

  // ─── Projects ──────────────────────────────────

  async createProject(orgId: string, dto: CreateProjectDto) {
    return this.tenancy.project.create({
      data: {
        orgId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAllProjects() {
    return this.tenancy.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { sites: true } } },
    });
  }

  async findProjectById(id: string) {
    const project = await this.tenancy.project.findUnique({
      where: { id },
      include: { sites: { include: { _count: { select: { cameras: true } } } } },
    });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  async updateProject(id: string, dto: Partial<CreateProjectDto>) {
    await this.findProjectById(id);
    return this.tenancy.project.update({ where: { id }, data: dto });
  }

  async deleteProject(id: string) {
    await this.findProjectById(id);
    return this.tenancy.project.delete({ where: { id } });
  }

  // ─── Sites ──────────────────────────────────────

  async createSite(orgId: string, projectId: string, dto: CreateSiteDto) {
    // Verify project exists
    const project = await this.tenancy.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    return this.tenancy.site.create({
      data: {
        orgId,
        projectId,
        name: dto.name,
        description: dto.description,
        location: dto.location ?? undefined,
      },
    });
  }

  async findAllSites() {
    return this.tenancy.site.findMany({
      orderBy: { name: 'asc' },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async findSitesByProject(projectId: string) {
    return this.tenancy.site.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { cameras: true } } },
    });
  }

  async updateSite(id: string, dto: Partial<CreateSiteDto>) {
    const site = await this.tenancy.site.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }
    return this.tenancy.site.update({ where: { id }, data: dto });
  }

  async deleteSite(id: string) {
    const site = await this.tenancy.site.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }
    return this.tenancy.site.delete({ where: { id } });
  }

  // ─── Cameras ────────────────────────────────────

  async createCamera(orgId: string, siteId: string, dto: CreateCameraDto) {
    // Verify site exists
    const site = await this.tenancy.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }

    // Check maxCameras package limit
    await this.enforceMaxCamerasLimit(orgId);

    // Phase 19.1 D-01 + D-05: branch on ingestMode.
    // Push → generate key + URL server-side; Pull → use client-supplied URL.
    const isPush = dto.ingestMode === 'push';
    const streamKey = isPush ? generateStreamKey() : null;
    const pushHost = process.env.SRS_PUBLIC_HOST ?? 'localhost';
    const streamUrl = isPush
      ? buildPushUrl(pushHost, streamKey!)
      : (dto.streamUrl as string);

    let camera: any;
    try {
      camera = await this.tenancy.camera.create({
        data: {
          orgId,
          siteId,
          name: dto.name,
          streamUrl,
          ingestMode: dto.ingestMode ?? 'pull',
          streamKey,
          description: dto.description,
          location: dto.location ?? undefined,
          tags: dto.tags ?? [],
          thumbnail: dto.thumbnail,
          streamProfileId: dto.streamProfileId,
          status: 'offline',
          needsTranscode: false,
        },
      });
    } catch (error) {
      // Phase 19 (D-11) + Phase 19.1 (D-04): translate P2002 on either the
      // (orgId, streamUrl) unique constraint (pull path) or the global
      // @@unique([streamKey]) (push path). meta.target pinpoints which.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes('streamKey')) {
          throw new DuplicateStreamKeyError();
        }
        if (target.includes('streamUrl')) {
          throw new DuplicateStreamUrlError(streamUrl);
        }
      }
      throw error;
    }

    // Phase 19.1 (D-21): audit key generation for push cameras only.
    // Payload carries streamKeyPrefix (first 4 chars) — NEVER the full key.
    if (isPush && this.auditService) {
      try {
        await this.auditService.log({
          orgId,
          action: 'camera.push.key_generated',
          resource: 'camera',
          resourceId: camera.id,
          method: 'POST',
          path: `/api/sites/${siteId}/cameras`,
          details: { streamKeyPrefix: streamKeyPrefix(streamKey!) },
        });
      } catch (err) {
        this.logger.warn(
          `Audit key_generated failed for ${camera.id}: ${(err as Error).message}`,
        );
      }
    }

    // Phase 19 (D-01, D-04): fire-and-forget async probe after DB commit.
    // BullMQ `add` resolves as soon as the job is written to Redis, NOT when
    // it runs — so this does not block the HTTP response. The `jobId` uses
    // the probe:{cameraId} convention so a rapid retry from any other path
    // (on-publish refresh, UI retry click, bulk import) merges into the same
    // job (T-19-03 dedup mitigation). probeQueue may be undefined in unit
    // test harnesses (see bulk-import.test.ts ctor pattern) — skip silently.
    if (this.probeQueue) {
      try {
        await this.probeQueue.add(
          'probe-camera',
          {
            cameraId: camera.id,
            streamUrl: camera.streamUrl,
            orgId,
          } as ProbeJobData,
          { jobId: `probe-${camera.id}-ffprobe` },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to enqueue probe for camera ${camera.id}: ${(err as Error).message}`,
        );
      }
    }

    return camera;
  }

  async findAllCameras(siteId?: string) {
    return this.tenancy.camera.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        site: {
          include: { project: true },
        },
      },
    });
  }

  async findCameraById(id: string) {
    const camera = await this.tenancy.camera.findUnique({
      where: { id },
      include: {
        site: {
          include: { project: true },
        },
        streamProfile: true,
      },
    });
    if (!camera) {
      throw new NotFoundException(`Camera ${id} not found`);
    }
    return camera;
  }

  async updateCamera(id: string, dto: UpdateCameraDto) {
    await this.findCameraById(id);
    // Phase 19.1 D-01: belt-and-suspenders — UpdateCameraSchema.strict()
    // already rejects an `ingestMode` key at the DTO layer, but strip it
    // here too so any future callpath that bypasses zod can't mutate the
    // immutable mode.
    const safe: any = { ...dto };
    delete safe.ingestMode;
    return this.tenancy.camera.update({ where: { id }, data: safe });
  }

  async deleteCamera(id: string) {
    const camera = await this.findCameraById(id);
    // Phase 19.1 D-22: if a push camera is mid-broadcast, kick the
    // publisher first so SRS releases the RTMP session before the DB row
    // disappears. Best-effort — a dead SRS must not block admin deletion.
    if (camera.ingestMode === 'push' && camera.streamKey && this.srsApi) {
      try {
        const clientId = await this.srsApi.findPublisherClientId(
          `push/${camera.streamKey}`,
        );
        if (clientId) {
          await this.srsApi.kickPublisher(clientId);
        }
      } catch (err) {
        this.logger.warn(
          `Pre-delete kick failed for camera ${id}: ${(err as Error).message}`,
        );
      }
    }
    return this.tenancy.camera.delete({ where: { id } });
  }

  async updateCameraCodecInfo(
    id: string,
    data: { needsTranscode: boolean; codecInfo: Record<string, any> },
  ) {
    return this.tenancy.camera.update({
      where: { id },
      data: {
        needsTranscode: data.needsTranscode,
        codecInfo: data.codecInfo,
      },
    });
  }

  // ─── Push Stream-Key Helpers (Phase 19.1) ───────

  /**
   * D-03, D-15: resolve a camera by its push streamKey. Called from the SRS
   * on_publish callback which has no CLS context — we intentionally use
   * systemPrisma to bypass RLS. The 128-bit entropy of the key is the
   * derived tenancy primitive here: a correctly-guessed key IS the proof
   * of ownership (see threat_model T-19.1-TENANCY-BYPASS).
   */
  async findByStreamKey(streamKey: string): Promise<{
    id: string;
    orgId: string;
    maintenanceMode: boolean;
    firstPublishAt: Date | null;
  } | null> {
    const client: any = this.systemPrisma ?? this.prisma;
    return client.camera.findFirst({
      where: { streamKey },
      select: {
        id: true,
        orgId: true,
        maintenanceMode: true,
        firstPublishAt: true,
      },
    });
  }

  /**
   * D-21: flip firstPublishAt atomically. The `firstPublishAt: null` guard
   * in the WHERE clause means only the first successful on_publish wins —
   * every subsequent call updates 0 rows and returns false. Used by the
   * on_publish callback to emit the `camera.push.first_publish` audit once
   * per camera lifetime.
   */
  async markFirstPublishIfNeeded(
    cameraId: string,
    _orgId: string,
    _meta: { codec?: string; resolution?: string; clientIp?: string },
  ): Promise<boolean> {
    const client: any = this.systemPrisma ?? this.prisma;
    const result = await client.camera.updateMany({
      where: { id: cameraId, firstPublishAt: null },
      data: { firstPublishAt: new Date() },
    });
    return result.count === 1;
  }

  /**
   * D-18: resolve push → live forward routing target. SRS calls
   * POST /api/srs/callbacks/on-forward for every publish; we answer with
   * the re-mapped target url so the push/{key} session is re-streamed into
   * live/{orgId}/{cameraId} without an extra FFmpeg process.
   * Returns null when the key doesn't resolve (SRS then rejects the forward).
   */
  async resolveForwardTarget(
    streamKey: string,
  ): Promise<{ orgId: string; cameraId: string; needsTranscode: boolean } | null> {
    const client: any = this.systemPrisma ?? this.prisma;
    const camera = await client.camera.findFirst({
      where: { streamKey },
      select: { id: true, orgId: true, needsTranscode: true },
    });
    if (!camera) return null;
    return {
      orgId: camera.orgId,
      cameraId: camera.id,
      needsTranscode: camera.needsTranscode,
    };
  }

  /**
   * Phase 19.1 D-19 + D-20: rotate a push stream key.
   *
   * 1. Verify camera exists and is push mode.
   * 2. Resolve the old publisher's SRS client_id BEFORE the DB update so we
   *    still have the old key to match against.
   * 3. Generate new key + URL and update in a single tenancy call.
   * 4. Kick the old client (best-effort) — even if the kick fails the new
   *    key is authoritative in the DB; any continuing publish against the
   *    old key will be rejected by on_publish on its next cycle.
   * 5. Audit the rotation with old+new 4-char prefixes (never the full key).
   */
  async rotateStreamKey(
    cameraId: string,
    userId: string,
  ): Promise<{ streamUrl: string }> {
    const camera = await this.tenancy.camera.findUnique({
      where: { id: cameraId },
    });
    if (!camera) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }
    if (camera.ingestMode !== 'push') {
      throw new BadRequestException(
        'Only push cameras can rotate their stream key',
      );
    }

    const oldKey = camera.streamKey as string;

    // Step 2: resolve old client BEFORE rotating so we can still match on
    // push/<oldKey>. Best-effort — null when SRS is unreachable or no
    // publisher is currently connected.
    let oldClientId: string | null = null;
    if (this.srsApi) {
      try {
        oldClientId = await this.srsApi.findPublisherClientId(
          `push/${oldKey}`,
        );
      } catch (err) {
        this.logger.warn(
          `findPublisherClientId failed on rotate for ${cameraId}: ${(err as Error).message}`,
        );
      }
    }

    const newKey = generateStreamKey();
    const pushHost = process.env.SRS_PUBLIC_HOST ?? 'localhost';
    const newUrl = buildPushUrl(pushHost, newKey);

    let updated: any;
    try {
      updated = await this.tenancy.camera.update({
        where: { id: cameraId },
        data: { streamKey: newKey, streamUrl: newUrl },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes('streamKey')) throw new DuplicateStreamKeyError();
        if (target.includes('streamUrl'))
          throw new DuplicateStreamUrlError(newUrl);
      }
      throw error;
    }

    // Step 4: best-effort kick. Kick happens AFTER the DB commit so the new
    // key is already authoritative — kick failure does NOT undo the rotation.
    if (oldClientId && this.srsApi) {
      try {
        await this.srsApi.kickPublisher(oldClientId);
      } catch (err) {
        this.logger.warn(
          `Kick failed for client ${oldClientId} on rotate: ${(err as Error).message}`,
        );
      }
    }

    if (this.auditService) {
      try {
        await this.auditService.log({
          orgId: camera.orgId,
          userId,
          action: 'camera.push.key_rotated',
          resource: 'camera',
          resourceId: cameraId,
          method: 'POST',
          path: `/api/cameras/${cameraId}/rotate-key`,
          details: {
            oldKeyPrefix: streamKeyPrefix(oldKey),
            newKeyPrefix: streamKeyPrefix(newKey),
          },
        });
      } catch (err) {
        this.logger.warn(
          `Audit key_rotated failed for ${cameraId}: ${(err as Error).message}`,
        );
      }
    }

    return { streamUrl: updated.streamUrl };
  }

  // ─── Maintenance Mode ───────────────────────────

  /**
   * Put camera into maintenance mode.
   *
   * Order matters: flag is flipped FIRST so the subsequent stopStream
   * transition (status → offline) flows through the 15-01 maintenance gate
   * and gets notify/webhook-suppressed. Broadcast + DB update still happen
   * (per D-04/D-15) — only outbound notify/webhook is gated.
   *
   * Mitigates T-15-01 by using the tenancy client (RLS-scoped) for reads/writes.
   * Mitigates T-15-02 by ordering flag-flip BEFORE transition (tested).
   */
  async enterMaintenance(cameraId: string, userId: string): Promise<any> {
    // Tenancy client scopes to caller's org via RLS — cross-org lookup returns null.
    const camera = await this.tenancy.camera.findUnique({
      where: { id: cameraId },
    });
    if (!camera) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }
    if (camera.maintenanceMode) {
      this.logger.debug(
        `enterMaintenance: ${cameraId} already in maintenance — no-op`,
      );
      return camera;
    }

    // (1) Flip flag FIRST so any subsequent status transition (from stopStream)
    //     flows through the 15-01 maintenance gate and suppresses notify/webhook.
    const updated = await this.tenancy.camera.update({
      where: { id: cameraId },
      data: {
        maintenanceMode: true,
        maintenanceEnteredAt: new Date(),
        maintenanceEnteredBy: userId,
      },
    });

    // (2) Best-effort stop stream. If no stream is running, stopStream still
    //     transitions status → offline (harmless). If stream IS running, FFmpeg
    //     is SIGTERM'd and the offline transition is notify-suppressed (15-01).
    try {
      await this.streamsService.stopStream(cameraId);
    } catch (err) {
      this.logger.warn(
        `enterMaintenance: stopStream failed for ${cameraId} — continuing: ${(err as Error).message}`,
      );
    }

    // (3) Defensive: ensure status=offline even if stopStream no-op'd (e.g.,
    //     stream wasn't running, or stopStream threw before the StatusService
    //     transition could execute).
    const finalCamera = await this.tenancy.camera.update({
      where: { id: cameraId },
      data: { status: 'offline' },
    });

    this.logger.log(
      `Camera ${cameraId} entered maintenance (user=${userId})`,
    );
    return finalCamera;
  }

  /**
   * Exit maintenance mode.
   *
   * Per D-14:
   *   - Do NOT clear maintenanceEnteredAt/By — they are historical record.
   *   - Do NOT auto-restart the stream — operator must click Start Stream.
   */
  async exitMaintenance(cameraId: string): Promise<any> {
    const camera = await this.tenancy.camera.findUnique({
      where: { id: cameraId },
    });
    if (!camera) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }
    if (!camera.maintenanceMode) {
      this.logger.debug(
        `exitMaintenance: ${cameraId} not in maintenance — no-op`,
      );
      return camera;
    }

    const updated = await this.tenancy.camera.update({
      where: { id: cameraId },
      data: { maintenanceMode: false },
    });

    this.logger.log(`Camera ${cameraId} exited maintenance`);
    return updated;
  }

  // ─── Bulk Import ────────────────────────────────

  async bulkImport(
    orgId: string,
    dto: BulkImportDto,
  ): Promise<{
    imported: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
    cameras: Array<{
      id: string;
      name: string;
      ingestMode: string;
      streamUrl: string;
    }>;
  }> {
    // Verify site exists
    const site = await this.tenancy.site.findUnique({ where: { id: dto.siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${dto.siteId} not found`);
    }

    // Phase 19 (D-10b): server-side pre-check against existing cameras in
    // this org — single round-trip findMany over the submitted streamUrls.
    // Exact string match (D-09): no normalization, no lowercasing, no query-
    // param stripping. The DB layer's @@unique([orgId, streamUrl]) (D-10c)
    // enforces the same match shape so client + server + DB agree.
    //
    // NOTE: this pre-check is NOT atomic with the subsequent $transaction
    // (T-19-02 TOCTOU). The @@unique constraint catches any race and the
    // P2002 safety net below translates it to a DuplicateStreamUrlError.
    //
    // Phase 19.1 (D-12): push rows have no client-supplied streamUrl, so they
    // bypass URL-based dedup entirely. Every push row generates a fresh key
    // server-side (128-bit entropy — collision handled by P2002 safety net).
    const pullRows = dto.cameras.filter((c) => c.ingestMode !== 'push');
    const incomingUrls = pullRows
      .map((c) => c.streamUrl)
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    const existing = incomingUrls.length
      ? await this.tenancy.camera.findMany({
          where: { orgId, streamUrl: { in: incomingUrls } },
          select: { streamUrl: true },
        })
      : [];
    const existingUrls = new Set(existing.map((e: any) => e.streamUrl));

    // D-10a mirror: within-file dedup (server-side) — client (P07) also does
    // this so the UI can mark duplicate rows, but we must not trust the
    // client. Keep the first occurrence per streamUrl, skip later duplicates.
    // Push rows skip this step — their server-generated keys are unique by
    // construction.
    const seenInFile = new Set<string>();
    const toInsert: typeof dto.cameras = [];
    let skippedCount = 0;

    for (const cam of dto.cameras) {
      if (cam.ingestMode === 'push') {
        toInsert.push(cam);
        continue;
      }
      if (!cam.streamUrl) {
        // DTO.superRefine rejects this case, but guard anyway.
        continue;
      }
      if (existingUrls.has(cam.streamUrl)) {
        skippedCount++;
        continue;
      }
      if (seenInFile.has(cam.streamUrl)) {
        skippedCount++;
        continue;
      }
      seenInFile.add(cam.streamUrl);
      toInsert.push(cam);
    }

    // Enforce maxCameras only against rows we're actually going to insert.
    // A bulk request where most rows are skipped as duplicates should not be
    // rejected under the package limit just because the raw payload was big.
    await this.enforceMaxCamerasLimitBulk(orgId, toInsert.length);

    // Short-circuit: nothing to insert. Return early so the empty-array
    // $transaction doesn't spin up a useless tenancy session.
    if (toInsert.length === 0) {
      return { imported: 0, skipped: skippedCount, errors: [], cameras: [] };
    }

    // Create all cameras in a single tenancy-wrapped transaction. The
    // interactive form preserves all-or-nothing atomicity — if ANY create
    // throws, the transaction rolls back; rows 1..N-1 disappear with the
    // failure of row N.
    //
    // Why not `this.prisma.$transaction([...promises])`: that older form
    // mixed raw PrismaService's $transaction (app_user, FORCE RLS, no
    // set_config prologue) with tenancy-extended camera.create promises.
    // Either the writes happened in rawPrisma's session and failed RLS
    // WITH CHECK, or the outer wrapper silently downgraded to sequential
    // execution — see .planning/debug/org-admin-cannot-add-team-members.md
    // (audit S1) for the full failure-mode analysis.
    //
    // Phase 19.1 (D-12, D-14): per-row, pre-compute streamKey + streamUrl
    // for push rows BEFORE the create. The key is generated in Node
    // (nanoid 21) so the DB never sees a null streamKey on an ingestMode
    // ='push' row — only the @@unique([streamKey]) constraint can collide.
    const pushHost = process.env.SRS_PUBLIC_HOST ?? 'localhost';
    let cameras: any[];
    try {
      cameras = await this.tenancy.$transaction(async (tx: any) => {
        const created: any[] = [];
        for (const cam of toInsert) {
          const isPush = cam.ingestMode === 'push';
          const rowStreamKey = isPush ? generateStreamKey() : null;
          const rowStreamUrl = isPush
            ? buildPushUrl(pushHost, rowStreamKey!)
            : (cam.streamUrl as string);
          const c = await tx.camera.create({
            data: {
              orgId,
              siteId: dto.siteId,
              name: cam.name,
              streamUrl: rowStreamUrl,
              ingestMode: cam.ingestMode ?? 'pull',
              streamKey: rowStreamKey,
              description: cam.description,
              location:
                cam.lat != null && cam.lng != null
                  ? { lat: cam.lat, lng: cam.lng }
                  : undefined,
              tags: cam.tags ? cam.tags.split(',').map((t: string) => t.trim()) : [],
              status: 'offline',
              needsTranscode: false,
            },
          });
          created.push(c);
        }
        return created;
      });
    } catch (error) {
      // Phase 19 (D-11) + Phase 19.1 (D-04) race safety net: translate both
      // streamUrl and streamKey P2002 violations. A streamKey collision in
      // bulk is astronomically unlikely (128-bit entropy × batch size) but
      // surface it the same way — the client should retry the whole batch.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes('streamKey')) {
          throw new DuplicateStreamKeyError();
        }
        if (target.includes('streamUrl')) {
          throw new DuplicateStreamUrlError(
            'bulk-import race: a concurrent request inserted one of these stream URLs',
          );
        }
      }
      throw error;
    }

    // Enqueue ffprobe jobs (best-effort — skipped silently when probeQueue is
    // not bootstrapped, e.g. in unit tests). The StreamProbeProcessor in
    // StreamsModule consumes these and populates Camera.codecInfo.
    //
    // Phase 19 (D-04): use jobId: probe-{cameraId}-{source} so rapid
    // duplicate enqueues WITHIN the same source merge at the BullMQ layer
    // (T-19-03 mitigation), while cross-source enqueues (ffprobe vs srs-api)
    // run independently. The original D-04 spec used `probe:{id}` which
    // (a) was rejected by BullMQ because ":" requires exactly 3 segments
    // and (b) collapsed ffprobe and srs-api probes into one, preventing
    // D-02's on-publish refresh from ever running. Hyphen separator + source
    // suffix fixes both.
    if (this.probeQueue) {
      for (const camera of cameras) {
        try {
          await this.probeQueue.add(
            'probe-camera',
            {
              cameraId: camera.id,
              streamUrl: camera.streamUrl,
              orgId,
            } as ProbeJobData,
            { jobId: `probe-${camera.id}-ffprobe` },
          );
        } catch (err) {
          this.logger.warn(
            `Failed to enqueue probe for camera ${camera.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    return {
      imported: cameras.length,
      skipped: skippedCount,
      errors: [],
      cameras: cameras.map((c: any) => ({
        id: c.id,
        name: c.name,
        ingestMode: c.ingestMode,
        streamUrl: c.streamUrl,
      })),
    };
  }

  // ─── Probe Enqueue Helpers (Phase 19) ──────────

  /**
   * D-02: enqueue a probe that pulls ground-truth codecInfo from SRS
   * `/api/v1/streams`. Called by the SRS on-publish callback after
   * StatusService.transition(online). The optional delay gives SRS time to
   * populate its stream registry before the worker fetches (RESEARCH Pitfall 3).
   *
   * Uses jobId: probe-{cameraId}-srs-api for idempotency — if another
   * on-publish fires within the same window, BullMQ merges them. ffprobe
   * probes use a different jobId suffix so they don't collide with this
   * srs-api refresh (T-19-03 dedup mitigation scoped to same source).
   */
  async enqueueProbeFromSrs(
    cameraId: string,
    orgId: string,
    opts?: { delay?: number },
  ): Promise<void> {
    if (!this.probeQueue) return; // test-harness guard
    // Use RLS-bypass client: SRS on-publish callback runs without CLS
    // context, so `this.prisma` (app_user) would return zero rows. Fall
    // back to `this.prisma` only in harness mode where systemPrisma is
    // absent (unit tests against a pre-seeded DB).
    const dbClient = this.systemPrisma ?? this.prisma;
    const camera = await dbClient.camera.findUnique({
      where: { id: cameraId },
      select: { streamUrl: true },
    });
    if (!camera) {
      this.logger.debug(
        `enqueueProbeFromSrs: camera ${cameraId} not found, skipping`,
      );
      return;
    }
    try {
      // Remove any prior completed/failed/waiting job with this jobId. BullMQ
      // keeps completed jobs in history and silently drops add() calls that
      // reuse the jobId — this breaks re-probe after the encoder reconnects
      // (second on_publish → enqueue ignored → stale codecInfo forever).
      const existing = await this.probeQueue.getJob(
        `probe-${cameraId}-srs-api`,
      );
      if (existing) {
        await existing.remove().catch(() => {});
      }
      await this.probeQueue.add(
        'probe-camera',
        {
          cameraId,
          streamUrl: camera.streamUrl,
          orgId,
          source: 'srs-api',
        } as ProbeJobData,
        { jobId: `probe-${cameraId}-srs-api`, delay: opts?.delay ?? 0 },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue SRS refresh probe for camera ${cameraId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * D-06: retry path called by POST /api/cameras/:id/probe when the user
   * clicks the failed-probe retry icon in the UI. Enqueues the same
   * ffprobe-source job as createCamera; dedup via jobId covers rapid
   * double-clicks (T-19-03 mitigation).
   */
  async enqueueProbeRetry(
    cameraId: string,
    streamUrl: string,
    orgId: string,
  ): Promise<void> {
    if (!this.probeQueue) return; // test-harness guard
    try {
      await this.probeQueue.add(
        'probe-camera',
        { cameraId, streamUrl, orgId } as ProbeJobData, // source defaults to 'ffprobe'
        { jobId: `probe-${cameraId}-ffprobe` },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue retry probe for camera ${cameraId}: ${(err as Error).message}`,
      );
    }
  }

  // ─── Helpers ────────────────────────────────────

  private async enforceMaxCamerasLimitBulk(orgId: string, newCount: number) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { package: true },
    });

    if (!org?.package) return;

    const maxCameras = org.package.maxCameras;
    const currentCount = await this.tenancy.camera.count({ where: { orgId } });

    if (currentCount + newCount > maxCameras) {
      throw new ForbiddenException(
        `Camera limit reached. Your plan allows ${maxCameras} cameras. Current: ${currentCount}, importing: ${newCount}.`,
      );
    }
  }

  private async enforceMaxCamerasLimit(orgId: string) {
    // Query the organization's package to get maxCameras (use raw prisma, not tenancy)
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { package: true },
    });

    if (!org?.package) {
      // No package assigned — allow (no limit)
      return;
    }

    const maxCameras = org.package.maxCameras;
    const currentCount = await this.tenancy.camera.count({
      where: { orgId },
    });

    if (currentCount >= maxCameras) {
      throw new ForbiddenException(
        `Camera limit reached. Your plan allows ${maxCameras} cameras. Current: ${currentCount}.`,
      );
    }
  }
}
