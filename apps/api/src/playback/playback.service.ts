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
import { PoliciesService } from '../policies/policies.service';
import { StatusService } from '../status/status.service';
import { ClusterService } from '../cluster/cluster.service';

@Injectable()
export class PlaybackService {
  private readonly logger = new Logger(PlaybackService.name);
  private readonly jwtSecret: string;

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
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
    const camera = await this.prisma.camera.findUnique({
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
    const session = await this.prisma.playbackSession.create({
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
    const hlsBase = edgeNode
      ? `${edgeNode.hlsUrl}/live/${orgId}/${cameraId}.m3u8`
      : `http://${process.env.SRS_HOST || 'localhost'}:8080/live/${orgId}/${cameraId}.m3u8`;
    const hlsUrl = `${hlsBase}?token=${token}`;

    const updated = await this.prisma.playbackSession.update({
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

      // Look up session
      const session = await this.prisma.playbackSession.findUnique({
        where: { id: payload.sub },
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
   */
  async getSession(sessionId: string) {
    const session = await this.prisma.playbackSession.findUnique({
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
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
    });

    if (!camera || camera.orgId !== orgId) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const sessions = await this.prisma.playbackSession.findMany({
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
