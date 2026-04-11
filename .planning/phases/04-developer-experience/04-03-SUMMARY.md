---
phase: 04-developer-experience
plan: 03
subsystem: api
tags: [webhooks, hmac, bullmq, ssrf, nestjs]

# Dependency graph
requires:
  - phase: 04-01
    provides: "Prisma schema with WebhookSubscription and WebhookDelivery models, FeatureKey.WEBHOOKS enum"
  - phase: 02
    provides: "StatusService with transition(), StatusModule @Global, BullModule.forRoot, AuthGuard"
provides:
  - "WebhooksService with subscription CRUD and emitEvent() for BullMQ queuing"
  - "WebhookDeliveryProcessor with HMAC-SHA256 signing and exponential backoff"
  - "SSRF-safe webhook URL validation (HTTPS + private IP blocking)"
  - "StatusService integration emitting camera.{status} webhook events"
  - "Wave 0 test stubs for webhooks and HMAC signature"
affects: [05-monitoring, 06-scaling, frontend-webhooks-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [bullmq-custom-backoff, hmac-webhook-signing, ssrf-url-validation, fire-and-forget-event-emission]

key-files:
  created:
    - apps/api/src/webhooks/webhooks.module.ts
    - apps/api/src/webhooks/webhooks.service.ts
    - apps/api/src/webhooks/webhooks.controller.ts
    - apps/api/src/webhooks/webhook-delivery.processor.ts
    - apps/api/src/webhooks/webhook-url.validator.ts
    - apps/api/src/webhooks/dto/create-webhook.dto.ts
    - apps/api/tests/webhooks/webhooks.test.ts
    - apps/api/tests/webhooks/hmac.test.ts
  modified:
    - apps/api/src/app.module.ts
    - apps/api/src/status/status.service.ts
    - apps/api/src/status/status.module.ts

key-decisions:
  - "Fire-and-forget webhook emission with .catch() to never block status transitions"
  - "Ownership verification before update/delete operations (not just RLS reliance)"

patterns-established:
  - "BullMQ custom backoff strategy: array-indexed delays for webhook retry intervals"
  - "HMAC-SHA256 signing: t={timestamp},v1={signature} format in X-Webhook-Signature header"
  - "SSRF protection: HTTPS enforcement + DNS resolution check against private IP ranges"
  - "Fire-and-forget async: .catch() on non-blocking side effects in critical paths"

requirements-completed: [DEV-04]

# Metrics
duration: 4min
completed: 2026-04-12
---

# Phase 04 Plan 03: Webhook System Summary

**Webhook subscription CRUD with BullMQ delivery, HMAC-SHA256 signing, SSRF-safe URL validation, and StatusService integration for camera event emission**

## Performance

- **Duration:** 4 min (231s)
- **Started:** 2026-04-11T18:33:41Z
- **Completed:** 2026-04-11T18:37:32Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Webhook subscription CRUD at /api/webhooks with FeatureKey.WEBHOOKS gating
- BullMQ-based delivery processor with HMAC-SHA256 signing, 10s timeout, 5-attempt exponential backoff (1m/5m/30m/2h/12h)
- SSRF-safe URL validation blocking localhost, private IPs, and non-HTTPS URLs
- StatusService.transition() emits camera.{status} webhook events on status changes
- Wave 0 test stubs: 24 todo tests for webhooks service, controller, delivery processor, and HMAC

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 test stubs for webhook module** - `9bfb7da` (test)
2. **Task 1: Webhook service + URL validator + BullMQ delivery processor** - `7a70002` (feat)
3. **Task 2: Hook StatusService to emit webhook events** - `f621d6e` (feat)

## Files Created/Modified
- `apps/api/src/webhooks/webhooks.module.ts` - Module registering BullMQ queue, controller, service, processor
- `apps/api/src/webhooks/webhooks.service.ts` - Subscription CRUD and emitEvent() for queuing deliveries
- `apps/api/src/webhooks/webhooks.controller.ts` - REST endpoints at /api/webhooks with auth and feature gating
- `apps/api/src/webhooks/webhook-delivery.processor.ts` - BullMQ processor with HMAC signing and retry backoff
- `apps/api/src/webhooks/webhook-url.validator.ts` - SSRF-safe URL validation (HTTPS, private IP blocking)
- `apps/api/src/webhooks/dto/create-webhook.dto.ts` - Zod schemas for create/update webhook DTOs
- `apps/api/tests/webhooks/webhooks.test.ts` - 19 Wave 0 test stubs
- `apps/api/tests/webhooks/hmac.test.ts` - 5 Wave 0 test stubs for HMAC signature
- `apps/api/src/app.module.ts` - Added WebhooksModule import
- `apps/api/src/status/status.service.ts` - Added WebhooksService injection and emitEvent() call
- `apps/api/src/status/status.module.ts` - Added WebhooksModule import

## Decisions Made
- Fire-and-forget webhook emission: .catch() ensures webhook failures never block camera status transitions
- Added ownership verification (findFirst with orgId) before update/delete in WebhooksService, beyond RLS

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Webhook system ready for frontend UI integration
- Wave 0 test stubs ready to be implemented when test phase arrives
- StatusService now emits events for all four camera statuses (online/offline/degraded/reconnecting)

---
*Phase: 04-developer-experience*
*Completed: 2026-04-12*
