import { Global, Module } from '@nestjs/common';
import { StreamHealthMetricsService } from './stream-health-metrics.service';

/**
 * 2026-04-30 self-healing trio (A-H).
 *
 * StreamHealthMetricsService is a tiny in-memory ring-buffer service that
 * needs to be consumed by:
 *
 *   - FfmpegService (record start/exit) — in StreamsModule
 *   - StreamProcessor (check isDegraded, mark degraded) — in StreamsModule
 *   - StatusService (record transitions) — in StatusModule (@Global)
 *   - CameraHealthService (read tolerance, skip degraded) — in ResilienceModule
 *   - SrsCallbackController (snapshot for /metrics) — in SrsModule
 *
 * Wiring StreamsModule → StatusModule → StreamsModule via the existing graph
 * forms a cycle, and the consuming surface is too wide to thread through
 * forwardRef cleanly. Promote the service to a @Global() module so every
 * consumer can inject it without an explicit import.
 *
 * Single instance is correct for this service — the in-memory state IS the
 * source of truth; replicating across modules would split the rolling-window
 * counters and produce nonsense crash-loop verdicts.
 */
@Global()
@Module({
  providers: [StreamHealthMetricsService],
  exports: [StreamHealthMetricsService],
})
export class StreamHealthModule {}
