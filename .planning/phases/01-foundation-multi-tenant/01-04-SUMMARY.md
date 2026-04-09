---
phase: 01-foundation-multi-tenant
plan: 04
status: complete
started: 2026-04-09T09:15:00Z
completed: 2026-04-09T09:50:00Z
duration_minutes: 35
---

# Plan 01-04 Summary: Next.js Frontend with Admin Panel

## What Was Built

Next.js 15 frontend with sign-in page, super admin panel, and org user dashboard shell — all using the green theme design system from UI-SPEC.

### Key Features
- **Sign-in page** (`/sign-in`) — Card-centered layout, green "Sign In" button, zod + react-hook-form validation, loading spinner, error messages
- **Admin panel** (`/admin`) — 240px sidebar with green theme, navigation to Organizations/Packages/System Settings
- **Organizations page** (`/admin/organizations`) — Data table with name/slug/package/members/status columns, create dialog with auto-slug generation, deactivate action
- **Packages page** (`/admin/packages`) — Data table with limits (cameras/viewers/bandwidth/storage), create dialog with feature toggle switches (recordings/webhooks/map/audit_log)
- **Dashboard shell** (`/(dashboard)`) — Placeholder layout for org users
- **Green theme** — `--primary: hsl(142 71% 45%)` applied via shadcn/ui v4 + Tailwind CSS

## Deviations

| # | Planned | Actual | Reason | Impact |
|---|---------|--------|--------|--------|
| 1 | Static better-auth imports | Dynamic ESM loader (`esm-loader.ts`) | better-auth is ESM-only, NestJS compiles to CJS — TypeScript/SWC convert `import()` to `require()` | Added `esm-loader.ts` with `new Function('specifier', 'return import(specifier)')` pattern |
| 2 | No global API prefix | `/api/` prefix on all controllers | Frontend calls `${API_URL}/api/admin/...` but controllers had no prefix | Added `api/` to all controller decorators |
| 3 | SWC not specified | SWC compiler for NestJS | Required for faster builds and better ESM interop | Added `@swc/core`, updated `nest-cli.json` |
| 4 | shadcn Radix-based | shadcn v4 base-nova style | Latest shadcn uses base-ui instead of Radix — no `asChild` prop | Used className directly on Trigger components |
| 5 | ClsModule default | ClsModule `global: true` | TenancyModule couldn't inject ClsService without global flag | One-line fix in app.module.ts |

## Self-Check: PASSED

- [x] Sign-in page renders and authenticates against Better Auth API
- [x] Admin panel sidebar with green theme navigation
- [x] Organizations page with table, create dialog, auto-slug
- [x] Packages page with limits table, create dialog, feature toggles
- [x] Dashboard shell for org users
- [x] Human verification: approved by user

## Key Files

### key-files.created
- `apps/web/src/lib/auth-client.ts` — Better Auth React client
- `apps/web/src/app/(auth)/sign-in/page.tsx` — Sign-in page
- `apps/web/src/app/admin/layout.tsx` — Admin panel layout with sidebar
- `apps/web/src/app/admin/organizations/page.tsx` — Organizations management
- `apps/web/src/app/admin/organizations/components/org-table.tsx` — Org data table
- `apps/web/src/app/admin/organizations/components/create-org-dialog.tsx` — Create org dialog
- `apps/web/src/app/admin/packages/page.tsx` — Packages management
- `apps/web/src/app/admin/packages/components/package-table.tsx` — Package data table
- `apps/web/src/app/admin/packages/components/create-package-dialog.tsx` — Create package dialog
- `apps/api/src/auth/esm-loader.ts` — ESM dynamic import bypass for better-auth

### key-files.modified
- `apps/api/src/auth/auth.config.ts` — Switched to async init with ESM loader
- `apps/api/src/auth/auth.controller.ts` — Async onModuleInit for Better Auth handler
- `apps/api/src/auth/roles.ts` — Async initAccessControl with ESM loader
- `apps/api/src/auth/guards/super-admin.guard.ts` — Use getAuth() instead of static import
- `apps/api/src/main.ts` — Added localhost:3002 to CORS origins
- `apps/api/src/app.module.ts` — ClsModule global: true
- `apps/api/nest-cli.json` — SWC builder
- `apps/api/src/admin/admin.controller.ts` — /api prefix
- `apps/api/src/organizations/organizations.controller.ts` — /api prefix
- `apps/api/src/packages/packages.controller.ts` — /api prefix
- `apps/api/src/users/users.controller.ts` — /api prefix

## Commits

| Hash | Message |
|------|---------|
| d657006 | feat(01-04): shadcn + green theme + auth client + sign-in page |
| 60836fd | feat(01-04): super admin panel with sidebar + org/packages pages |
| bfe2967 | fix(01-04): resolve ESM/CJS compatibility and API routing issues |
