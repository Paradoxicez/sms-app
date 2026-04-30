import {
  Inject,
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { PoliciesService } from '../policies/policies.service';
import { StatusService } from '../status/status.service';
import { ClusterService } from '../cluster/cluster.service';

@Injectable()
export class PlaybackService {
  private readonly logger = new Logger(PlaybackService.name);
  private readonly jwtSecret: string;

  constructor(
    @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
    private readonly systemPrisma: SystemPrismaService,
    private readonly policiesService: PoliciesService,
    private readonly statusService: StatusService,
    @Inject(forwardRef(() => ClusterService)) private readonly clusterService: ClusterService,
  ) {
    const secret = process.env.JWT_PLAYBACK_SECRET;
    if (secret) {
      this.jwtSecret = secret;
    } else {
      this.jwtSecret = randomBytes(32).toString('hex');
      this.logger.warn(
        'JWT_PLAYBACK_SECRET not set -- using generated random secret. Set JWT_PLAYBACK_SECRET in production.',
      );
    }
  }

  /**
   * Create a new playback session for a camera.
   *
   * 1. Verify camera exists and belongs to org
   * 2. Resolve policy for camera
   * 3. Check viewer limit
   * 4. Create PlaybackSession record
   * 5. Sign JWT token
   * 6. Return { sessionId, hlsUrl, expiresAt }
   */
  async createSession(cameraId: string, orgId: string) {
    // 1. Verify camera exists and belongs to org
    const camera = await this.tenantPrisma.camera.findUnique({
      where: { id: cameraId },
    });

    if (!camera || camera.orgId !== orgId) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }

    // 2. Resolve policy
    const resolved = await this.policiesService.resolve(cameraId);

    // 3. Check viewer limit
    const currentViewers = this.statusService.getViewerCount(cameraId);
    if (resolved.maxViewers > 0 && currentViewers >= resolved.maxViewers) {
      throw new ForbiddenException(
        `Viewer limit reached (${currentViewers}/${resolved.maxViewers})`,
      );
    }

    // 4. Create PlaybackSession record
    const expiresAt = new Date(Date.now() + resolved.ttlSeconds * 1000);
    const session = await this.tenantPrisma.playbackSession.create({
      data: {
        orgId,
        cameraId,
        token: '', // placeholder, updated after JWT signing
        hlsUrl: '', // placeholder
        ttlSeconds: resolved.ttlSeconds,
        maxViewers: resolved.maxViewers,
        domains: resolved.domains,
        allowNoReferer: resolved.allowNoReferer,
        expiresAt,
      },
    });

    // 5. Sign JWT
    const token = jwt.sign(
      {
        cam: cameraId,
        org: orgId,
        domains: resolved.domains,
        sub: session.id,
      },
      this.jwtSecret,
      { algorithm: 'HS256', expiresIn: resolved.ttlSeconds },
    );

    // 6. Select least-loaded edge node for HLS delivery (per D-09, D-10, D-11)
    const edgeNode = await this.clusterService.getLeastLoadedEdge();
    const publicBase = process.env.PUBLIC_HLS_BASE_URL;
    const hlsBase = edgeNode
      ? `${edgeNode.hlsUrl}/live/${orgId}/${cameraId}.m3u8`
      : publicBase
      ? `${publicBase}/live/${orgId}/${cameraId}.m3u8`
      : `http://${process.env.SRS_HOST || 'localhost'}:8080/live/${orgId}/${cameraId}.m3u8`;
    const hlsUrl = `${hlsBase}?token=${token}`;

    const updated = await this.tenantPrisma.playbackSession.update({
      where: { id: session.id },
      data: { token, hlsUrl },
    });

    return {
      sessionId: updated.id,
      hlsUrl: updated.hlsUrl,
      expiresAt: updated.expiresAt,
    };
  }

  /**
   * Create a playback session for a BACKGROUND/SYSTEM caller (no HTTP request
   * context, no CLS ORG_ID). Mirrors createSession line-for-line EXCEPT every
   * Prisma op uses systemPrisma (RLS bypass) and the user-viewer-limit check
   * is skipped — background tasks (e.g. SnapshotService FFmpeg snapshot grab)
   * are not user viewers.
   *
   * SECURITY: createSession remains the only path for HTTP-request callers.
   * createSystemSession is callable only from server-side services that
   * already know the trusted orgId (e.g. resolved via systemPrisma in the
   * caller). The orgId/cameraId match check below is preserved as
   * defense-in-depth (mirrors 49adac6 StatusService pattern + 260420-oid).
   *
   * Closes the regression introduced when SnapshotService.refreshOne (added
   * in 260426-06n) called createSession from a fire-and-forget path with no
   * CLS context — tenantPrisma's tenancy extension returned null even for
   * cameras that exist in Postgres, producing the cascading "Camera not
   * found" log spam.
   */
  async createSystemSession(cameraId: string, orgId: string) {
    // 1. Verify camera exists and belongs to org (systemPrisma — bypass RLS)
    const camera = await this.systemPrisma.camera.findUnique({
      where: { id: cameraId },
    });

    if (!camera || camera.orgId !== orgId) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }

    // 2. Resolve policy (policiesService is policy-config only, not tenant-scoped)
    const resolved = await this.policiesService.resolve(cameraId);

    // 3. Viewer-limit check is INTENTIONALLY skipped — background snapshot
    //    tasks must not be blocked by user viewer counts. (Per quick task
    //    260426-0m4 design lock.)

    // 4. Create placeholder PlaybackSession via systemPrisma
    const expiresAt = new Date(Date.now() + resolved.ttlSeconds * 1000);
    const session = await this.systemPrisma.playbackSession.create({
      data: {
        orgId,
        cameraId,
        token: '',
        hlsUrl: '',
        ttlSeconds: resolved.ttlSeconds,
        maxViewers: resolved.maxViewers,
        domains: resolved.domains,
        allowNoReferer: resolved.allowNoReferer,
        expiresAt,
      },
    });

    // 5. Sign JWT — identical claim shape to createSession so on_play accepts
    const token = jwt.sign(
      {
        cam: cameraId,
        org: orgId,
        domains: resolved.domains,
        sub: session.id,
      },
      this.jwtSecret,
      { algorithm: 'HS256', expiresIn: resolved.ttlSeconds },
    );

    // 6. Pick edge node + build hlsUrl. Background callers (snapshot/probe) MUST
    //    use the INTERNAL SRS HTTP endpoint — never PUBLIC_HLS_BASE_URL — so the
    //    FFmpeg fetch goes container-to-container (api → srs:8080) and bypasses
    //    Caddy hairpin. Hairpin via the public domain produced 502 EOF spam in
    //    production (caddy logs Lavf/59.27.100 → /srs-hls/.../*.m3u8 → context
    //    canceled / EOF) because the internal probe path competed with viewer
    //    HLS traffic over the same TLS path.
    const edgeNode = await this.clusterService.getLeastLoadedEdge();
    const internalBase = `http://${process.env.SRS_HOST || 'srs'}:8080`;
    const hlsBase = edgeNode
      ? `${edgeNode.hlsUrl}/live/${orgId}/${cameraId}.m3u8`
      : `${internalBase}/live/${orgId}/${cameraId}.m3u8`;
    const hlsUrl = `${hlsBase}?token=${token}`;

    const updated = await this.systemPrisma.playbackSession.update({
      where: { id: session.id },
      data: { token, hlsUrl },
    });

    return {
      sessionId: updated.id,
      hlsUrl: updated.hlsUrl,
      expiresAt: updated.expiresAt,
    };
  }

  /**
   * Create playback sessions for multiple cameras in one call.
   * Returns both successful sessions and per-camera errors.
   */
  async createBatchSessions(cameraIds: string[], orgId: string) {
    const sessions: Array<{
      cameraId: string;
      sessionId: string;
      hlsUrl: string;
      expiresAt: Date;
    }> = [];
    const errors: Array<{ cameraId: string; error: string }> = [];

    for (const cameraId of cameraIds) {
      try {
        const session = await this.createSession(cameraId, orgId);
        sessions.push({ cameraId, ...session });
      } catch (err: any) {
        errors.push({
          cameraId,
          error: err.message || 'Failed to create session',
        });
      }
    }

    return { sessions, errors };
  }

  /**
   * Verify a JWT playback token.
   * Returns session data if valid, null if invalid.
   */
  async verifyToken(token: string, cameraId: string, orgId: string) {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;

      // Check claims match
      if (payload.cam !== cameraId || payload.org !== orgId) {
        this.logger.warn(
          `verifyToken: claim mismatch — expected cam=${cameraId}/org=${orgId}, got cam=${payload.cam}/org=${payload.org}`,
        );
        return null;
      }

      // Look up session via systemPrisma — SRS callback runs without CLS ORG_ID,
      // so the tenancy extension would skip set_config and RLS would deny the row.
      // The orgId/cameraId from the JWT payload (already verified above) are added
      // to the where clause as defense-in-depth (mirrors 49adac6 StatusService pattern).
      const session = await this.systemPrisma.playbackSession.findFirst({
        where: { id: payload.sub as string, orgId, cameraId },
      });

      if (!session) {
        this.logger.warn(
          `verifyToken: session ${payload.sub} not found in DB (may have been cleaned up)`,
        );
        return null;
      }

      return {
        sessionId: session.id,
        cameraId: session.cameraId,
        orgId: session.orgId,
        domains: session.domains,
        allowNoReferer: session.allowNoReferer,
        maxViewers: session.maxViewers,
        expiresAt: session.expiresAt,
      };
    } catch (err) {
      // Token expired, invalid signature, etc.
      this.logger.warn(
        `verifyToken: jwt.verify threw ${(err as Error).name}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Verify a JWT playback token minimally -- checks signature and expiry only.
   * No cameraId/orgId match required (used for HLS key serving).
   * Returns decoded payload or null.
   */
  async verifyTokenMinimal(token: string) {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
      return {
        sub: payload.sub as string,
        cam: payload.cam as string,
        org: payload.org as string,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get session by ID (for embed page).
   * Returns null if expired or not found.
   *
   * Public endpoint with no auth guard — runs without CLS ORG_ID, so we use
   * systemPrisma to bypass RLS. Session id is an unguessable cuid; access
   * control for HLS playback is enforced separately via JWT signature in
   * verifyToken (SRS on_play callback).
   */
  async getSession(sessionId: string) {
    const session = await this.systemPrisma.playbackSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return null;
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      return null;
    }

    return {
      id: session.id,
      hlsUrl: session.hlsUrl,
      expiresAt: session.expiresAt,
      cameraId: session.cameraId,
    };
  }

  /**
   * List playback sessions for a camera (most recent first).
   *
   * Returns only { id, createdAt, expiresAt } to match the frontend
   * PlaybackSession shape. Does NOT filter expired sessions -- the UI
   * renders an Expired badge via isExpired(expiresAt).
   *
   * Verifies the camera belongs to the caller's org (defense in depth;
   * TENANCY_CLIENT extension also filters by org).
   */
  async listSessionsByCamera(
    cameraId: string,
    orgId: string,
    limit: number = 20,
  ) {
    const camera = await this.tenantPrisma.camera.findUnique({
      where: { id: cameraId },
    });

    if (!camera || camera.orgId !== orgId) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const sessions = await this.tenantPrisma.playbackSession.findMany({
      where: { cameraId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      select: { id: true, createdAt: true, expiresAt: true },
    });

    return sessions;
  }

  /**
   * Domain matching for SRS callback verification.
   *
   * Per D-14: empty domains array = allow all
   * Per D-15: wildcard patterns supported (*, *.example.com)
   * Per D-16: no referer handling based on allowNoReferer flag
   */
  matchDomain(
    pageUrl: string | undefined | null,
    allowedDomains: string[],
    allowNoReferer: boolean,
  ): boolean {
    if (!pageUrl) return allowNoReferer;
    if (allowedDomains.length === 0) return true;

    let hostname: string;
    try {
      hostname = new URL(pageUrl).hostname;
    } catch {
      // Malformed URL = treat as no referer
      return allowNoReferer;
    }

    for (const pattern of allowedDomains) {
      if (pattern === '*') return true;
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1); // ".example.com"
        if (hostname.endsWith(suffix) || hostname === pattern.slice(2)) {
          return true;
        }
      } else {
        if (hostname === pattern) return true;
      }
    }

    return false;
  }
}
