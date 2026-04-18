# Milestones

## v1.1 UI Overhaul (Shipped: 2026-04-18)

**Phases completed:** 6 phases, 15 plans, 25 tasks

**Key accomplishments:**

- Generic DataTable with @tanstack/react-table: sorting, search, faceted filters, numbered pagination, row selection, and row action menus -- consumed by 13+ pages
- DatePicker and DateRangePicker wrapper components using base-ui Popover + react-day-picker Calendar, replacing all 6 native date inputs across 3 pages
- 1. [Rule 1 - Bug] React hooks rules violation in tenant layout
- Split-screen login with branding panel, remember me checkbox wired to better-auth rememberMe param, and 30-day session config
- One-liner:
- Audit log migrated from cursor-based Load More to DataTable with server-side offset pagination, search, Action filter, DateRangePicker, and View Details dialog
- Users and API Keys tables migrated to DataTable with sortable columns, faceted filters, search, and contextual quick actions
- Webhooks and Stream Profiles migrated to DataTable with sortable columns, faceted filters, search, and quick action menus replacing manual table and card grid layouts
- 1. [Rule 1 - Bug] Fixed useRef TypeScript strict mode error
- Task 3 (checkpoint:human-verify)
- Commit:
- Commit:
- Shared HierarchyTree component with collapsible search and resizable split-panel projects page showing context-sensitive DataTable for projects, sites, and cameras

---

## v1.0 MVP (Shipped: 2026-04-16)

**Phases completed:** 9 phases, 39 plans, 79 tasks

**Key accomplishments:**

- NestJS + Next.js monorepo with Prisma 6 schema (9 models including Package and UserPermissionOverride), Docker Compose (PostgreSQL 16 + Redis 7), and Vitest test infrastructure
- Better Auth with organization/admin/RBAC plugins, 4-role permission system with per-user override support (D-02), RLS tenant isolation via Prisma Client Extension + nestjs-cls, and 26 tests across 5 suites
- Package CRUD with JSONB feature toggles, organization management with System org protection, and user invitation/creation with last-admin guard -- 21 new tests, all 47 total tests passing
- PostgreSQL RLS policies on Member, Invitation, UserPermissionOverride with superuser bypass, SuperAdminGuard on UsersController, and integration tests proving org-level row filtering
- FeaturesService + FeatureGuard for backend enforcement, GET /api/organizations/:orgId/features endpoint, useFeatures React hook for frontend UI gating
- 1. [Rule 2 - Missing Critical] Created AuthGuard
- Camera management UI with projects hierarchy, camera list with real-time status, camera detail with HLS preview player, Start/Stop stream controls, and Socket.IO live status updates.
- Policy CRUD with per-field merge resolution and JWT-signed playback session creation via jose library
- SRS on_play JWT/domain verification, token-protected HLS key serving with m3u8 proxy rewrite, and three-tier rate limiting via ThrottlerModule
- Policy management dialogs, camera embed code generation, and public embed player page
- API key CRUD with sk_live_ prefix, SHA-256 hash storage, X-API-Key guard, combined auth guard, and Redis usage tracking with daily BullMQ aggregation
- Swagger UI at /api/docs with all 6 controllers documented, batch playback sessions endpoint with max-50 Zod validation, and dual AuthOrApiKeyGuard on session creation endpoints
- Webhook subscription CRUD with BullMQ delivery, HMAC-SHA256 signing, SSRF-safe URL validation, and StatusService integration for camera event emission
- Developer Portal with sidebar nav, D-07 dynamic Quick Start curl examples, API key management UI with one-time reveal, and webhook management pages with delivery log viewer
- 5 in-app documentation guides (API Workflow, Policies, Stream Profiles, Webhooks, Streaming Basics) with docs index page and GuideCard/DocPage components
- 6 test stub files with 55 todo tests covering dashboard, map, metrics, audit, notifications, and SRS log gateway
- Audit interceptor, notification system with Socket.IO delivery, and dashboard aggregation endpoints with RLS-protected Prisma models
- Leaflet map page at /admin/map with status-colored camera markers, MarkerClusterGroup clustering, HLS popup preview via hls.js, and Monitoring sidebar navigation section
- Dashboard page with stat cards, bandwidth/API usage area charts with time range toggles, status-sorted camera table, and super admin system metrics -- all with 30s polling and Socket.IO real-time updates
- Audit log page with filtered table and detail dialog, plus SRS real-time log streaming gateway and viewer on Stream Engine page
- Notification bell with real-time Socket.IO delivery, popover dropdown with mark-as-read, per-event preferences, and camera detail Activity tab with audit log
- SrsNode data model with CRUD API, nginx HLS caching proxy config generation, and multi-node SrsApiService refactor
- BullMQ health polling with 3-miss OFFLINE threshold, auto-recovery, edge-routed playback sessions with origin fallback, and Socket.IO status broadcasting
- Admin cluster management page with node table, add/remove/detail dialogs, real-time Socket.IO health updates, and sidebar navigation
- 34 Vitest it.todo() stubs across 6 files covering segment archival, manifest generation, lifecycle, retention, quota, and schedules
- MinIO object storage, Recording Prisma models, start/stop API, and on_hls callback segment archival pipeline with path traversal protection
- Dynamic m3u8 manifest generation, hourly retention cleanup, scheduled recording via BullMQ, and storage quota alerts at 80%/90% thresholds
- Recordings UI with camera detail tab (calendar, timeline bar, HLS player, start/stop controls), schedule dialog, retention settings, and admin recordings list page
- Dev Package seed with feature check endpoint, error toasts on recording actions, and correct storage quota field mapping
- 1. [Rule 3 — Blocking issue] Missing vitest infrastructure in web app
- 1. [Rule 3 - Blocking] Wave 0 test files not present in worktree
- Nav primitives (Task 1)
- Shared tenant components (Task 1a).
- One-liner:

---
