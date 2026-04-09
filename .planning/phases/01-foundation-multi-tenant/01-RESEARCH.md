# Phase 1: Foundation & Multi-Tenant - Research

**Researched:** 2026-04-09
**Domain:** Authentication, Multi-Tenancy (PostgreSQL RLS), RBAC, Package System
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundational authentication, multi-tenant isolation, and package/limits system for the SMS Platform. The core stack is NestJS (backend) + Next.js (frontend) + PostgreSQL (database) + Prisma (ORM) + Better Auth (authentication) + Redis (sessions/cache).

Better Auth v1.6.1 provides built-in plugins for organizations, RBAC, admin management, invitation flow, and session management -- covering nearly all Phase 1 auth requirements out of the box. The key integration challenge is wiring Better Auth with NestJS (via `@thallesp/nestjs-better-auth` v2.6.0) and combining it with Prisma Client Extensions for PostgreSQL RLS-based tenant isolation.

The RLS pattern uses `set_config()` / `current_setting()` PostgreSQL session variables injected via Prisma Client Extensions on every query, with `nestjs-cls` (AsyncLocalStorage) providing request-scoped tenant context without sacrificing singleton injection performance.

**Primary recommendation:** Use Better Auth's organization + admin + RBAC plugins as the auth backbone, Prisma Client Extensions with `nestjs-cls` for RLS enforcement, and a dedicated `packages` table with explicit columns for limits + JSONB for feature toggles.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Four roles split by responsibility -- Admin (manages everything in org), Operator (manages cameras/streams), Developer (API keys/integration only), Viewer (watch streams only)
- **D-02:** Role + custom override model -- roles serve as permission templates with default permissions, but Org Admin can override (add/remove) specific permissions per user
- **D-03:** Better Auth's organization + RBAC plugins handle role assignment and permission checks
- **D-04:** Packages stored in a dedicated `packages` table with explicit columns for each limit (max_cameras, max_viewers, max_bandwidth_mbps, max_storage_gb)
- **D-05:** Feature toggles stored as JSONB field on the packages table (e.g., `{recordings: true, webhooks: true, map: false}`) -- new features added without migration
- **D-06:** No preset packages -- Super admin creates custom packages freely, full flexibility
- **D-07:** Super admin capabilities limited to: CRUD organizations and CRUD packages -- does not access or manage data inside individual orgs
- **D-08:** Super admin lives in a special "System" organization and can impersonate into other orgs when needed
- **D-09:** Super admin has a separate admin panel at /admin, distinct from the regular org dashboard
- **D-10:** Two methods to add users: email invitation (Better Auth invitation plugin) + admin directly creates account
- **D-11:** No self-registration -- users must be invited or created by an Org Admin (B2B model)
- **D-12:** Better Auth handles invitation flow, email sending, and account creation

### Claude's Discretion
- Exact Prisma schema design for packages, organizations, and users tables
- Better Auth plugin configuration details
- RLS policy implementation specifics
- Session management approach (Better Auth default)
- Password requirements and validation rules
- Error handling and validation patterns

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can sign in with email and password | Better Auth email/password auth with scrypt hashing, configurable min/max password length |
| AUTH-02 | User session persists across browser refresh | Better Auth cookie-based sessions with 7-day default expiry, Redis secondary storage for performance |
| AUTH-03 | Role-based access control (Admin, Operator, Developer, Viewer) | Better Auth organization plugin with `createAccessControl()` for custom roles/permissions |
| AUTH-04 | Super admin can manage all tenants, packages, and system settings | Better Auth admin plugin with impersonation, custom superadmin role via `ac.newRole()` |
| TENANT-01 | Organization isolation with shared-schema + org_id (PostgreSQL RLS) | Prisma Client Extensions + `set_config()`/`current_setting()` + nestjs-cls for request-scoped tenant ID |
| TENANT-02 | Super admin can create/edit/deactivate organizations | Better Auth organization plugin + admin plugin; deactivation via custom field on org table |
| TENANT-03 | Package system with configurable limits | Dedicated `packages` table with explicit limit columns, linked to organizations via foreign key |
| TENANT-04 | Feature toggles per package | JSONB field on packages table, queryable with Prisma's JSON filtering |
| TENANT-05 | Per-org user management (invite, assign roles, deactivate) | Better Auth organization invitation + member management APIs |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-auth | 1.6.1 | Authentication framework | Built-in org, RBAC, admin, invitation plugins; Prisma adapter; NestJS integration [VERIFIED: npm registry] |
| @thallesp/nestjs-better-auth | 2.6.0 | NestJS integration for Better Auth | Guards, decorators (@Session, @Roles, @OrgRoles), global AuthGuard [VERIFIED: npm registry] |
| @nestjs/core | 11.1.18 | Backend framework | Modular architecture, DI, guards/interceptors [VERIFIED: npm registry] |
| prisma | 7.7.0 | ORM + migrations | Type-safe DB access, Client Extensions for RLS, migration system [VERIFIED: npm registry] |
| @prisma/client | 7.7.0 | Database client | Auto-generated types, extension API for RLS injection [VERIFIED: npm registry] |
| next | 16.2.3 | Frontend framework | React-based SSR, App Router [VERIFIED: npm registry] |
| ioredis | 5.10.1 | Redis client | Session secondary storage, cache [VERIFIED: npm registry] |
| zod | 4.3.6 | Validation | Request validation, config schemas [VERIFIED: npm registry] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nestjs-cls | 6.2.0 | AsyncLocalStorage for NestJS | Store tenant ID per-request without request-scoped providers [VERIFIED: npm registry] |
| @nestjs/swagger | 11.2.6 | API documentation | Auto-generated OpenAPI docs for admin and org APIs [VERIFIED: npm registry] |
| @nestjs/config | 4.0.3 | Configuration management | Environment variables, app config [VERIFIED: npm registry] |
| vitest | 4.1.3 | Testing framework | Fast TypeScript-native testing [VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Better Auth | Passport.js + custom org/RBAC | Far more code to build org, invitation, RBAC from scratch |
| nestjs-cls (AsyncLocalStorage) | REQUEST-scoped providers | Performance hit -- creates new instances per request; CLS keeps singletons |
| Prisma Client Extensions for RLS | Raw SQL middleware | Extensions are type-safe and composable; raw SQL loses Prisma benefits |
| Cookie-based sessions | JWT tokens | Cookies are simpler for SSR (Next.js), revocable, no client-side storage issues |

**Installation:**
```bash
# Backend (NestJS)
npm install @nestjs/core @nestjs/common @nestjs/platform-express @nestjs/config @nestjs/swagger
npm install better-auth @thallesp/nestjs-better-auth
npm install prisma @prisma/client
npm install nestjs-cls ioredis zod

# Frontend (Next.js)
npm install next react react-dom

# Dev dependencies
npm install -D vitest @nestjs/testing typescript @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
apps/
  api/                       # NestJS backend
    src/
      auth/                  # Better Auth config + NestJS module
        auth.config.ts       # Better Auth instance with plugins
        auth.module.ts       # NestJS AuthModule (forRoot)
        auth.controller.ts   # Auth route handler (catch-all for Better Auth)
        roles.ts             # Custom roles + access control definitions
        guards/              # Custom guards (SuperAdmin, OrgRole)
      tenancy/               # Multi-tenant infrastructure
        tenancy.module.ts    # Prisma extension + CLS setup
        prisma-tenancy.extension.ts  # $extends with set_config
        rls.policies.sql     # RLS policy definitions
      organizations/         # Org management module
        organizations.module.ts
        organizations.service.ts
        organizations.controller.ts
      packages/              # Package/limits module
        packages.module.ts
        packages.service.ts
        packages.controller.ts
        dto/                 # Zod schemas + DTOs
      users/                 # User management within orgs
        users.module.ts
        users.service.ts
        users.controller.ts
      admin/                 # Super admin panel API
        admin.module.ts
        admin.controller.ts
      prisma/                # Prisma service + schema
        prisma.module.ts
        prisma.service.ts
        schema.prisma
        migrations/
  web/                       # Next.js frontend
    src/
      app/
        (auth)/              # Login page (no layout chrome)
        (dashboard)/         # Org dashboard (with sidebar)
        admin/               # Super admin panel (/admin)
      lib/
        auth-client.ts       # Better Auth client instance
```

### Pattern 1: Better Auth + NestJS Integration
**What:** Better Auth handles all auth endpoints as a catch-all route; NestJS uses guards for protection
**When to use:** All auth operations (login, session, org, invitation)

```typescript
// Source: https://better-auth.com/docs/integrations/nestjs
// auth.config.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization, admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

// Define custom permissions
const statement = {
  ...defaultStatements,
  camera: ["create", "read", "update", "delete", "start", "stop"],
  stream: ["view", "manage"],
  apiKey: ["create", "read", "revoke"],
  recording: ["view", "manage"],
} as const;

const ac = createAccessControl(statement);

// Define 4 roles per D-01
export const viewerRole = ac.newRole({
  camera: ["read"],
  stream: ["view"],
});

export const developerRole = ac.newRole({
  camera: ["read"],
  stream: ["view"],
  apiKey: ["create", "read", "revoke"],
});

export const operatorRole = ac.newRole({
  camera: ["create", "read", "update", "delete", "start", "stop"],
  stream: ["view", "manage"],
  recording: ["view", "manage"],
});

export const adminRole = ac.newRole({
  camera: ["create", "read", "update", "delete", "start", "stop"],
  stream: ["view", "manage"],
  apiKey: ["create", "read", "revoke"],
  recording: ["view", "manage"],
  ...adminAc.statements,
});

export const superAdminRole = ac.newRole({
  ...adminAc.statements,
  user: ["impersonate-admins", ...adminAc.statements.user],
});

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // B2B, no self-reg
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // refresh daily
  },
  plugins: [
    organization({
      ac,
      roles: {
        admin: adminRole,
        operator: operatorRole,
        developer: developerRole,
        viewer: viewerRole,
      },
      allowUserToCreateOrganization: false, // B2B, admin-only
      creatorRole: "admin",
      sendInvitationEmail: async (data) => {
        // Send invitation email via your email service
      },
    }),
    admin({
      ac,
      roles: { superAdmin: superAdminRole },
      defaultRole: "viewer",
      impersonationSessionDuration: 3600,
    }),
  ],
});
```

### Pattern 2: Prisma Client Extension for RLS
**What:** Automatically inject org_id into every database query via PostgreSQL session variables
**When to use:** All database operations that need tenant isolation

```typescript
// Source: https://dev.to/moofoo/nestjspostgresprisma-multi-tenancy
// prisma-tenancy.extension.ts
import { PrismaClient } from "@prisma/client";
import { ClsService } from "nestjs-cls";

export function createTenancyExtension(
  prisma: PrismaClient,
  cls: ClsService,
) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const orgId = cls.get("ORG_ID");
          if (!orgId) {
            // No org context -- allow for super admin / system operations
            return query(args);
          }
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}
```

```sql
-- RLS policy example
-- Source: PostgreSQL docs + community patterns
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_cameras ON cameras
  USING (org_id = current_setting('app.current_org_id')::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);

-- Bypass role for migrations and super admin operations
CREATE ROLE app_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;

CREATE ROLE app_admin BYPASSRLS;
-- Prisma migrations use app_admin; runtime queries use app_user
```

### Pattern 3: Super Admin "System" Organization
**What:** A special organization that exists at the platform level for super admin users (D-08)
**When to use:** Super admin operations, /admin panel

```typescript
// Seed script pattern
const systemOrg = await prisma.organization.upsert({
  where: { slug: "system" },
  create: {
    name: "System",
    slug: "system",
    metadata: { isSystem: true },
  },
  update: {},
});
```

### Anti-Patterns to Avoid
- **Application-level filtering instead of RLS:** Never rely solely on `WHERE org_id = ?` in application code -- RLS is the enforcement layer; application code is convenience
- **Request-scoped Prisma clients:** Creating a new PrismaClient per request exhausts connection pools; use CLS + extensions instead
- **Storing roles as enums in Prisma:** Better Auth manages roles in its own tables; don't duplicate role storage
- **Disabling RLS for "convenience":** Once enabled, never bypass RLS except through the designated admin role

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authentication (login/signup/session) | Custom auth middleware | Better Auth email/password plugin | Session management, CSRF, timing attack protection built-in |
| Organization management | Custom org CRUD + membership | Better Auth organization plugin | Invitation flow, member roles, teams all included |
| Role-based access control | Custom RBAC middleware | Better Auth RBAC + `createAccessControl()` | Permission inheritance, role composition, runtime checks |
| User invitation flow | Custom invitation tokens + emails | Better Auth invitation plugin | Token generation, expiry, acceptance flow handled |
| Impersonation | Custom session switching | Better Auth admin plugin `impersonateUser()` | Session tracking, audit trail, auto-expiry |
| Password hashing | bcrypt/argon2 manual implementation | Better Auth built-in (scrypt) | Timing-safe comparison, configurable work factor |
| Multi-tenant data isolation | Manual WHERE clauses | PostgreSQL RLS + Prisma Client Extensions | Database-level enforcement, impossible to bypass in application code |
| Session storage | Custom Redis session store | Better Auth `secondaryStorage` with Redis | Automatic fallback, cache invalidation, refresh logic |

**Key insight:** Better Auth's plugin ecosystem covers ~80% of Phase 1's auth requirements out of the box. The remaining 20% is the packages/limits system and RLS infrastructure, which are application-specific.

## Common Pitfalls

### Pitfall 1: Prisma Does Not Manage RLS Policies
**What goes wrong:** Developers expect `prisma migrate dev` to create/update RLS policies
**Why it happens:** Prisma schema has no representation for RLS policies, database roles, or `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
**How to avoid:** Manage RLS policies in separate SQL migration files. Use Prisma migrations for schema, then raw SQL files for RLS. Can use `prisma.$executeRawUnsafe()` in a seed/setup script, or maintain `.sql` files applied after Prisma migrations.
**Warning signs:** RLS policies missing after fresh `prisma migrate reset`

### Pitfall 2: RLS Bypass When set_config Not Called
**What goes wrong:** Queries run without `set_config()` bypass RLS entirely (PostgreSQL defaults to superuser without policies)
**Why it happens:** Prisma connects as the database owner who bypasses RLS by default
**How to avoid:** Create a separate `app_user` role without BYPASSRLS. Prisma runtime connection uses `app_user`; migration connection uses owner. Alternatively, use `SET ROLE app_user` in the transaction.
**Warning signs:** Data from other orgs visible in API responses

### Pitfall 3: Better Auth Body Parser Conflict with NestJS
**What goes wrong:** Better Auth endpoints return 400 or empty responses
**Why it happens:** NestJS's built-in body parser consumes the request body before Better Auth can process it
**How to avoid:** Disable NestJS body parser: `NestFactory.create(AppModule, { bodyParser: false })`
**Warning signs:** Auth routes (login, signup) fail silently

### Pitfall 4: Better Auth Schema vs Custom Prisma Schema Conflict
**What goes wrong:** Prisma migrate fails or Better Auth tables have wrong columns
**Why it happens:** Better Auth's `npx auth generate` creates its own schema definitions that may conflict with custom additions
**How to avoid:** Run `npx auth@latest generate` first to get base schema, then add custom fields/tables. Re-run after adding plugins. Never manually edit Better Auth's generated fields.
**Warning signs:** Missing columns like `activeOrganizationId` on session table

### Pitfall 5: Forgetting org_id on New Tables
**What goes wrong:** New tables added in future phases lack tenant isolation
**Why it happens:** Developer creates a new Prisma model without `org_id` column and RLS policy
**How to avoid:** Establish a checklist: every new table that holds tenant data MUST have `org_id` column + RLS policy. Create a linting/review rule for this.
**Warning signs:** Cross-tenant data leaks discovered during testing

### Pitfall 6: CLS Context Lost in Background Jobs
**What goes wrong:** Background tasks (BullMQ jobs, cron) don't have CLS context, causing RLS to fail
**Why it happens:** AsyncLocalStorage context only exists within HTTP request lifecycle
**How to avoid:** For background jobs, explicitly set org_id in the CLS store before running tenant-scoped operations, or use the non-RLS Prisma client with explicit WHERE clauses
**Warning signs:** Background jobs return empty results or throw errors about missing `app.current_org_id`

## Code Examples

### Better Auth Client Setup (Next.js Frontend)
```typescript
// Source: https://better-auth.com/docs/basic-usage
// lib/auth-client.ts
import { createAuthClient } from "better-auth/client";
import { organizationClient, adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [
    organizationClient(),
    adminClient(),
  ],
});

// Login
const { data, error } = await authClient.signIn.email({
  email: "user@example.com",
  password: "password",
});

// Set active organization
await authClient.organization.setActive({
  organizationId: "org-id",
});
```

### NestJS CLS + Tenancy Module Setup
```typescript
// Source: https://dev.to/moofoo/nestjspostgresprisma-multi-tenancy
// tenancy.module.ts
import { Global, Module } from "@nestjs/common";
import { ClsModule } from "nestjs-cls";
import { PrismaModule } from "../prisma/prisma.module";

export const TENANCY_CLIENT = Symbol("TENANCY_CLIENT");

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      middleware: {
        mount: true,
        setup: (cls, req) => {
          // Extract org_id from Better Auth session
          // This will be set by auth middleware after session validation
        },
      },
    }),
    PrismaModule,
  ],
  providers: [
    {
      provide: TENANCY_CLIENT,
      inject: [PrismaService, ClsService],
      useFactory: (prisma: PrismaService, cls: ClsService) => {
        return createTenancyExtension(prisma, cls);
      },
    },
  ],
  exports: [TENANCY_CLIENT],
})
export class TenancyModule {}
```

### Package Schema (Prisma)
```prisma
// Source: CONTEXT.md decisions D-04, D-05, D-06
model Package {
  id               String   @id @default(uuid())
  name             String
  description      String?
  maxCameras       Int
  maxViewers       Int
  maxBandwidthMbps Int
  maxStorageGb     Int
  features         Json     @default("{}")  // {recordings: true, webhooks: false, ...}
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  organizations Organization[]
}

model Organization {
  // Better Auth manages core org fields (id, name, slug, etc.)
  // Add package relationship
  packageId String?
  package   Package? @relation(fields: [packageId], references: [id])
  isActive  Boolean  @default(true)
}
```

### Permission Check in NestJS Controller
```typescript
// Source: https://github.com/ThallesP/nestjs-better-auth
import { Controller, Post, Param } from "@nestjs/common";
import { Session, UserSession, OrgRoles } from "@thallesp/nestjs-better-auth";

@Controller("cameras")
export class CameraController {
  @Post()
  @OrgRoles("admin", "operator") // Only admin/operator can create cameras
  async createCamera(
    @Session() session: UserSession,
    // session.user, session.session.activeOrganizationId available
  ) {
    // Camera creation logic (Phase 2)
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Passport.js + custom guards | Better Auth with built-in plugins | 2024-2025 | 80% less auth code to write |
| JWT tokens for sessions | Cookie-based sessions (Better Auth default) | Ongoing trend | Better SSR support, revocable |
| Manual WHERE org_id = ? | PostgreSQL RLS + Prisma Extensions | 2023+ (Prisma Extensions GA) | Database-enforced isolation |
| Request-scoped providers for tenant context | AsyncLocalStorage (nestjs-cls) | 2023+ | No performance hit from DI scope |
| Prisma 5.x | Prisma 7.7.0 | 2025-2026 | Required output path, improved extensions |
| NestJS 10 | NestJS 11 | 2025 | SWC default compiler, improved logging |

**Deprecated/outdated:**
- `@better-auth/prisma-adapter` as separate package -- now included in `better-auth/adapters/prisma` [ASSUMED]
- Prisma `@prisma/client` import path changes in Prisma 7+ (custom output path required) [VERIFIED: npm docs]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@better-auth/prisma-adapter` is included in main `better-auth` package (not separate install) | Standard Stack | Minor -- may need additional npm install |
| A2 | Better Auth organization plugin roles map directly to the 4 custom roles (Admin, Operator, Developer, Viewer) defined in D-01 | Architecture Patterns | Medium -- may need workaround if org plugin role names are restricted |
| A3 | Prisma 7.7.0 Client Extensions work correctly with `$transaction` for RLS set_config pattern | Architecture Patterns | High -- core tenancy pattern depends on this |
| A4 | `nestjs-cls` v6.2.0 is compatible with NestJS 11.x | Standard Stack | Medium -- may need version adjustment |
| A5 | Better Auth `secondaryStorage` can use ioredis directly for session caching | Architecture Patterns | Low -- Redis adapter may have specific interface requirements |

## Open Questions (Resolved)

1. **Better Auth + Prisma 7 compatibility** -- RESOLVED
   - What we know: Better Auth docs reference Prisma 7 output path requirement
   - Resolution: Use explicit `output` path in Prisma generator config (`output: "./generated/client"`). Run `npx auth generate` first, then adjust output path. Test during Plan 01 Task 2.

2. **RLS policy management strategy** -- RESOLVED
   - What we know: Prisma cannot manage RLS policies natively
   - Resolution: Maintain RLS policies in `apps/api/src/prisma/rls.policies.sql`. Apply after Prisma migrations via `prisma.$executeRawUnsafe()` in a setup script or CI step. Phase 1 creates the SQL file; actual RLS enforcement activates when tenant-scoped tables are created in future phases.

3. **D-02: Role + custom override model** -- RESOLVED
   - What we know: Better Auth supports custom roles via `createAccessControl()` and dynamic access control
   - Resolution: Better Auth's `dynamicAccessControl` compatibility is uncertain. Use custom `UserPermissionOverride` table in Prisma schema with columns (id, userId, orgId, permission, action: "grant"|"deny", @@unique([userId, orgId, permission])). A `checkPermission()` helper in `apps/api/src/auth/permissions.ts` checks role defaults from `ROLE_PERMISSIONS` map, then applies overrides from the table. This delivers D-02 fully without depending on uncertain Better Auth features.

4. **Database role separation for RLS** -- RESOLVED
   - What we know: RLS needs a non-superuser role to be enforced
   - Resolution: Use two database URLs -- `DATABASE_URL` (owner role) for Prisma migrations, `DATABASE_APP_URL` (app_user role) for runtime. Phase 1 creates the `app_user` role in `rls.policies.sql`. Runtime Prisma connection will switch to `app_user` when RLS policies are activated in future phases.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 22.11.0 | -- |
| Docker | PostgreSQL, Redis containers | Yes | 28.3.2 | -- |
| PostgreSQL | Database | Yes (via psql) | 14.17 (local) | Use Docker container (PostgreSQL 16 recommended) |
| Redis | Session cache | Unknown (cli not found) | -- | Use Docker container |
| npm | Package management | Yes | 10.9.0 | -- |
| git | Version control | Yes | 2.39.5 | -- |

**Missing dependencies with no fallback:**
- None -- all can be containerized via Docker Compose

**Missing dependencies with fallback:**
- Redis CLI not installed locally -- use Docker container (planned deployment target anyway)
- PostgreSQL 14.17 local is older than recommended 16 -- use Docker container with PostgreSQL 16

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | none -- see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | User sign in with email/password | integration | `npx vitest run tests/auth/sign-in.test.ts -x` | Wave 0 |
| AUTH-02 | Session persists across refresh | integration | `npx vitest run tests/auth/session.test.ts -x` | Wave 0 |
| AUTH-03 | RBAC (4 roles with permissions) | unit | `npx vitest run tests/auth/rbac.test.ts -x` | Wave 0 |
| AUTH-04 | Super admin manages tenants/packages | integration | `npx vitest run tests/admin/super-admin.test.ts -x` | Wave 0 |
| TENANT-01 | RLS enforces org isolation | integration | `npx vitest run tests/tenancy/rls-isolation.test.ts -x` | Wave 0 |
| TENANT-02 | Super admin CRUD organizations | integration | `npx vitest run tests/admin/org-management.test.ts -x` | Wave 0 |
| TENANT-03 | Package system with limits | unit | `npx vitest run tests/packages/package-limits.test.ts -x` | Wave 0 |
| TENANT-04 | Feature toggles per package | unit | `npx vitest run tests/packages/feature-toggles.test.ts -x` | Wave 0 |
| TENANT-05 | Per-org user management | integration | `npx vitest run tests/users/org-user-management.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- Vitest configuration with TypeScript paths
- [ ] `tests/setup.ts` -- Test database setup (Docker PostgreSQL + Redis for tests)
- [ ] `tests/helpers/auth.ts` -- Helper to create authenticated sessions for testing
- [ ] `tests/helpers/tenancy.ts` -- Helper to create test organizations with RLS context
- [ ] Framework install: `npm install -D vitest @vitest/coverage-v8`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth email/password with scrypt hashing |
| V3 Session Management | yes | Better Auth cookie-based sessions, 7-day expiry, daily refresh |
| V4 Access Control | yes | Better Auth RBAC + PostgreSQL RLS (defense in depth) |
| V5 Input Validation | yes | Zod schemas for all request validation |
| V6 Cryptography | no | No custom crypto -- Better Auth handles password hashing |

### Known Threat Patterns for Auth + Multi-Tenant Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant data access | Information Disclosure | PostgreSQL RLS with set_config per request |
| Session fixation | Spoofing | Better Auth regenerates session on login |
| Password brute force | Tampering | Better Auth rate limiting + account lockout |
| User enumeration via signup | Information Disclosure | Better Auth synthetic user response on duplicate email |
| Privilege escalation via role tampering | Elevation of Privilege | Roles managed server-side only; client cannot set own role |
| Missing org_id on new tables | Information Disclosure | Code review checklist; RLS policy for every tenant table |
| Impersonation abuse | Spoofing | Time-limited sessions (1 hour default), audit trail via impersonatedBy field |

## Sources

### Primary (HIGH confidence)
- [Better Auth Organization Plugin](https://better-auth.com/docs/plugins/organization) -- Full plugin API, roles, permissions, invitations
- [Better Auth Admin Plugin](https://better-auth.com/docs/plugins/admin) -- Impersonation, user management, access control
- [Better Auth NestJS Integration](https://better-auth.com/docs/integrations/nestjs) -- Setup, guards, decorators
- [Better Auth Prisma Adapter](https://better-auth.com/docs/adapters/prisma) -- Database configuration
- [Better Auth Session Management](https://better-auth.com/docs/concepts/session-management) -- Cookie config, expiry, Redis secondary storage
- [Better Auth Email/Password](https://better-auth.com/docs/authentication/email-password) -- Password hashing (scrypt), requirements config
- npm registry -- All package versions verified via `npm view`

### Secondary (MEDIUM confidence)
- [NestJS + Prisma + PostgreSQL RLS multi-tenancy](https://dev.to/moofoo/nestjspostgresprisma-multi-tenancy-using-nestjs-prisma-nestjs-cls-and-prisma-client-extensions-ok7) -- Prisma Client Extension + CLS pattern
- [Prisma RLS guide (Atlas)](https://atlasgo.io/guides/orms/prisma/row-level-security) -- RLS policy management with Prisma
- [@thallesp/nestjs-better-auth GitHub](https://github.com/ThallesP/nestjs-better-auth) -- NestJS integration library docs

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified via npm registry, official docs consulted
- Architecture: HIGH -- established patterns with multiple reference implementations
- Pitfalls: HIGH -- documented in official issues and community posts
- Better Auth plugin compatibility: MEDIUM -- specific plugin interactions (org + admin + RBAC together) need testing

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (30 days -- stable ecosystem, no major breaking changes expected)
