import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

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
 */
@ApiTags('Health')
@Controller('api/health')
export class HealthController {
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
}
