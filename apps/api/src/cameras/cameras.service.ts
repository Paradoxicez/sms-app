import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { StreamsService } from '../streams/streams.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { BulkImportDto } from './dto/bulk-import.dto';
import { ProbeJobData } from './types/codec-info';
import { DuplicateStreamUrlError } from './errors/duplicate-stream-url.error';

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

    let camera: any;
    try {
      camera = await this.tenancy.camera.create({
        data: {
          orgId,
          siteId,
          name: dto.name,
          streamUrl: dto.streamUrl,
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
      // Phase 19 (D-11): translate P2002 on the (orgId, streamUrl) unique
      // constraint to DuplicateStreamUrlError (HTTP 409). Only translate when
      // meta.target includes 'streamUrl' — future unique constraints on other
      // fields must surface their own errors rather than being swallowed here.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes('streamUrl')) {
          throw new DuplicateStreamUrlError(dto.streamUrl);
        }
      }
      throw error;
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
          { jobId: `probe:${camera.id}` },
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
    return this.tenancy.camera.update({
      where: { id },
      data: dto,
    });
  }

  async deleteCamera(id: string) {
    await this.findCameraById(id);
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
  ): Promise<{ imported: number; errors: Array<{ row: number; message: string }> }> {
    // Verify site exists
    const site = await this.tenancy.site.findUnique({ where: { id: dto.siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${dto.siteId} not found`);
    }

    // Check maxCameras package limit for total (existing + new)
    await this.enforceMaxCamerasLimitBulk(orgId, dto.cameras.length);

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
    const cameras = await this.tenancy.$transaction(async (tx: any) => {
      const created: any[] = [];
      for (const cam of dto.cameras) {
        const c = await tx.camera.create({
          data: {
            orgId,
            siteId: dto.siteId,
            name: cam.name,
            streamUrl: cam.streamUrl,
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

    // Enqueue ffprobe jobs (best-effort — skipped silently when probeQueue is
    // not bootstrapped, e.g. in unit tests). The StreamProbeProcessor in
    // StreamsModule consumes these and populates Camera.codecInfo.
    //
    // Phase 19 (D-04): use jobId: probe:{cameraId} so rapid duplicate enqueues
    // (e.g. bulk-import followed by on-publish refresh) merge at the BullMQ
    // layer (T-19-03 mitigation).
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
            { jobId: `probe:${camera.id}` },
          );
        } catch (err) {
          this.logger.warn(
            `Failed to enqueue probe for camera ${camera.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    return { imported: cameras.length, errors: [] };
  }

  // ─── Probe Enqueue Helpers (Phase 19) ──────────

  /**
   * D-02: enqueue a probe that pulls ground-truth codecInfo from SRS
   * `/api/v1/streams`. Called by the SRS on-publish callback after
   * StatusService.transition(online). The optional delay gives SRS time to
   * populate its stream registry before the worker fetches (RESEARCH Pitfall 3).
   *
   * Uses jobId: probe:{cameraId} for idempotency — if the UI retry or a
   * subsequent on-publish fires within the same window, BullMQ merges rather
   * than spawning a second probe (T-19-03 dedup mitigation).
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
      await this.probeQueue.add(
        'probe-camera',
        {
          cameraId,
          streamUrl: camera.streamUrl,
          orgId,
          source: 'srs-api',
        } as ProbeJobData,
        { jobId: `probe:${cameraId}`, delay: opts?.delay ?? 0 },
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
        { jobId: `probe:${cameraId}` },
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
