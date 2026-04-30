import { Controller, Get, HttpStatus, Optional, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import Redis from 'ioredis';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { SrsApiService } from '../srs/srs-api.service';
import { StreamHealthMetricsService } from '../streams/stream-health-metrics.service';

/**
 * HealthController exposes a public, unguarded liveness probe at GET /api/health.
 *
 * - Used by Dockerfile HEALTHCHECK (api + web images both probe an /api/health route).
 * - Used by Phase 27 Caddy upstream health probe and Phase 30 smoke test.
 * - Intentionally separate from AdminController (which is SuperAdminGuard-guarded) —
 *   `docker run --rm <image> curl localhost:3003/api/health` MUST succeed without auth.
 * - Audit interceptor SKIP_PATHS already lists '/api/health' (apps/api/src/audit/audit.interceptor.ts:12),
 *   so this endpoint emits zero audit rows.
 * - Liveness only: NO DB ping, NO Redis ping. A transient Postgres restart should NOT
 *   mark this container unhealthy and have Caddy strip traffic (per Phase 25 D-03).
 *
 * `/api/health/deep` (added 2026-04-30, self-healing trio task H) is the operator-only
 * deep readiness check. It DOES verify DB/Redis/SRS reachability + cross-references
 * SRS active stream count against the Camera table's online count. Returns 503 with
 * a structured JSON body when anything is inconsistent. CADDY MUST NOT use this path
 * for upstream healthcheck — a transient SRS hiccup would strip api from the load
 * balancer pool. Operators consume it ad-hoc or via external monitoring (Grafana,
 * UptimeKuma) that tolerates 503 without removing the upstream.
 */
@ApiTags('Health')
@Controller('api/health')
export class HealthController {
  constructor(
    @Optional() private readonly systemPrisma?: SystemPrismaService,
    @Optional() private readonly srsApi?: SrsApiService,
    @Optional()
    private readonly streamHealthMetrics?: StreamHealthMetricsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe (public, unguarded)' })
  @ApiResponse({
    status: 200,
    description: 'Service is alive',
    schema: { example: { ok: true } },
  })
  health() {
    return { ok: true };
  }

  @Get('deep')
  @ApiOperation({
    summary:
      'Deep readiness check (operator-only — do NOT wire to load balancer health probe)',
  })
  async deep(@Res() res: Response): Promise<Response> {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    // 1. DB ping — single SELECT 1.
    if (this.systemPrisma) {
      try {
        await this.systemPrisma.$queryRaw`SELECT 1`;
        checks.db = { ok: true };
      } catch (err) {
        checks.db = { ok: false, detail: (err as Error).message };
      }
    } else {
      checks.db = { ok: false, detail: 'SystemPrismaService unavailable' };
    }

    // 2. Redis ping — open a transient connection so we do not depend on
    //    any other module's pool. Closes immediately after the check.
    let redis: Redis | null = null;
    try {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        connectTimeout: 2_000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      await redis.connect();
      const pong = await redis.ping();
      checks.redis = { ok: pong === 'PONG' };
      if (!checks.redis.ok) checks.redis.detail = `unexpected reply: ${pong}`;
    } catch (err) {
      checks.redis = { ok: false, detail: (err as Error).message };
    } finally {
      try {
        await redis?.quit();
      } catch {
        // Best-effort close — already-closed quit() throws ECONNRESET.
      }
    }

    // 3. SRS reachable + stream count cross-check.
    let srsStreamCount: number | null = null;
    if (this.srsApi) {
      try {
        const result = await this.srsApi.getStreams();
        const streams = (result?.streams ?? []) as Array<unknown>;
        srsStreamCount = streams.length;
        checks.srs = { ok: true, detail: `${srsStreamCount} streams` };
      } catch (err) {
        checks.srs = { ok: false, detail: (err as Error).message };
      }
    } else {
      checks.srs = { ok: false, detail: 'SrsApiService unavailable' };
    }

    // 4. Cross-reference: SRS streams should match Camera.status='online' count.
    //    Tolerate ±1 for transient mid-publish race (camera in connecting->online
    //    transition with FFmpeg already pushing). Larger drift signals a stuck
    //    state worth investigating.
    let dbOnlineCount: number | null = null;
    if (this.systemPrisma) {
      try {
        dbOnlineCount = await this.systemPrisma.camera.count({
          where: { status: 'online' },
        });
      } catch (err) {
        checks.consistency = {
          ok: false,
          detail: `camera count failed: ${(err as Error).message}`,
        };
      }
    }

    if (
      srsStreamCount !== null &&
      dbOnlineCount !== null &&
      checks.consistency === undefined
    ) {
      const drift = Math.abs(srsStreamCount - dbOnlineCount);
      checks.consistency = {
        ok: drift <= 1,
        detail: `srs=${srsStreamCount} db=${dbOnlineCount} drift=${drift}`,
      };
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    const payload = {
      ok: allOk,
      checks,
      streamHealth: this.streamHealthMetrics?.snapshot() ?? null,
      timestamp: new Date().toISOString(),
    };

    return res
      .status(allOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(payload);
  }
}
