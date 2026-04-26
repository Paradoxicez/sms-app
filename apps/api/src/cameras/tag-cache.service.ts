import { Inject, Injectable, Optional, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../api-keys/api-keys.service';

/**
 * Phase 22 Plan 22-05 (D-09, D-28): distinct-tags cache for the autocomplete
 * combobox + table/map filter MultiSelect.
 *
 * Cache key shape: `tags:distinct:{orgId}` — the orgId is part of the key so a
 * shared single-Redis deployment cannot leak Org A's tags into Org B's response
 * (T-22-02 mitigation; pinned by tests/cameras/distinct-tags.test.ts).
 *
 * TTL: 60 seconds. Computing distinct over the `tags String[]` column is a
 * full-org scan with `unnest` — caching reduces the combobox-open-frequency
 * case to a Redis GET. The 60s window is short enough that newly-tagged
 * cameras surface in the autocomplete promptly without a manual invalidate.
 *
 * Fallback: if Redis is unavailable (env not set, network blip, OOM), we fall
 * back to an in-process `Map` so the API never crashes on a tags/distinct
 * request. The in-memory layer also serves as a near-zero-latency hit when
 * Redis is configured — the redis path is checked first, and on success we
 * still write through to memory so a follow-up redis outage doesn't blow the
 * cache out.
 */
const TTL_SECONDS = 60;

@Injectable()
export class TagCacheService {
  private readonly logger = new Logger(TagCacheService.name);
  // Per-org in-memory fallback. Map keys are orgIds (NOT cache keys) — the
  // memory layer doesn't share the `tags:distinct:` prefix because it's
  // already scoped to one process.
  private memoryFallback = new Map<
    string,
    { value: string[]; expiresAt: number }
  >();

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /**
   * Read-through cache: return the cached distinct-tags array for `orgId`,
   * computing via `compute()` only on miss. The compute function runs against
   * Postgres ($queryRaw with set_config for RLS — see CamerasService.findDistinctTags).
   *
   * Order of precedence:
   *   1. Redis GET — primary cache (if Redis is configured + reachable).
   *   2. In-memory Map — fallback when Redis errors OR when Redis isn't wired.
   *   3. compute() — the DB round trip; result is written to BOTH layers.
   */
  async getOrCompute(
    orgId: string,
    compute: () => Promise<string[]>,
  ): Promise<string[]> {
    const key = `tags:distinct:${orgId}`;

    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          return JSON.parse(cached) as string[];
        }
      } catch (err) {
        // Don't crash the request — fall through to memory + compute.
        this.logger.warn(
          `Redis read failed for ${key}: ${(err as Error).message}`,
        );
      }
    }

    // Memory fallback: only honor a non-expired entry.
    const mem = this.memoryFallback.get(orgId);
    if (mem && mem.expiresAt > Date.now()) {
      return mem.value;
    }

    // Cache miss — compute fresh.
    const fresh = await compute();

    if (this.redis) {
      try {
        await this.redis.setex(key, TTL_SECONDS, JSON.stringify(fresh));
      } catch (err) {
        this.logger.warn(
          `Redis write failed for ${key}: ${(err as Error).message}`,
        );
      }
    }

    // Always populate memory so a Redis outage immediately after this call
    // still returns a hit on the next request (within TTL).
    this.memoryFallback.set(orgId, {
      value: fresh,
      expiresAt: Date.now() + TTL_SECONDS * 1000,
    });

    return fresh;
  }

  /**
   * Drop both Redis + memory entries for an org. Currently unused by Phase 22
   * code paths (the 60s TTL is cheap), but exposed for future bulk-tags or
   * camera-create hooks that want to invalidate immediately rather than wait
   * for the TTL to expire.
   */
  async invalidate(orgId: string): Promise<void> {
    const key = `tags:distinct:${orgId}`;
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err) {
        this.logger.warn(
          `Redis invalidate failed for ${key}: ${(err as Error).message}`,
        );
      }
    }
    this.memoryFallback.delete(orgId);
  }
}
