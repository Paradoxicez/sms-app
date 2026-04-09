# Phase 1: Foundation & Multi-Tenant - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Authentication with email/password via Better Auth, organization isolation with PostgreSQL RLS (shared-schema + org_id), package system with configurable limits, per-org user management with RBAC. No camera, stream, or playback features — those are later phases.

</domain>

<decisions>
## Implementation Decisions

### Role & Permission Design
- **D-01:** Four roles split by responsibility — Admin (manages everything in org), Operator (manages cameras/streams), Developer (API keys/integration only), Viewer (watch streams only)
- **D-02:** Role + custom override model — roles serve as permission templates with default permissions, but Org Admin can override (add/remove) specific permissions per user
- **D-03:** Better Auth's organization + RBAC plugins handle role assignment and permission checks

### Package & Limits Model
- **D-04:** Packages stored in a dedicated `packages` table with explicit columns for each limit (max_cameras, max_viewers, max_bandwidth_mbps, max_storage_gb)
- **D-05:** Feature toggles stored as JSONB field on the packages table (e.g., `{recordings: true, webhooks: true, map: false}`) — new features added without migration
- **D-06:** No preset packages — Super admin creates custom packages freely, full flexibility

### Super Admin
- **D-07:** Super admin capabilities limited to: CRUD organizations and CRUD packages — does not access or manage data inside individual orgs
- **D-08:** Super admin lives in a special "System" organization and can impersonate into other orgs when needed
- **D-09:** Super admin has a separate admin panel at /admin, distinct from the regular org dashboard

### User Onboarding & Org Membership
- **D-10:** Two methods to add users: email invitation (Better Auth invitation plugin) + admin directly creates account
- **D-11:** No self-registration — users must be invited or created by an Org Admin (B2B model)
- **D-12:** Better Auth handles invitation flow, email sending, and account creation

### Claude's Discretion
- Exact Prisma schema design for packages, organizations, and users tables
- Better Auth plugin configuration details
- RLS policy implementation specifics
- Session management approach (Better Auth default)
- Password requirements and validation rules
- Error handling and validation patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Authentication & Multi-Tenant
- `.planning/REQUIREMENTS.md` §Authentication & Users — AUTH-01 through AUTH-04 requirements
- `.planning/REQUIREMENTS.md` §Multi-Tenant — TENANT-01 through TENANT-05 requirements
- `.planning/PROJECT.md` §Constraints — Tech stack decisions (Better Auth, NestJS, PostgreSQL, Prisma)
- `.planning/PROJECT.md` §Key Decisions — Better Auth over Passport.js rationale

### Stream Engine Reference (informational)
- `CLAUDE.md` §SRS Deep Dive — SRS capabilities and limitations (informs package limit design)
- `CLAUDE.md` §Recommended Web App Stack — Full tech stack with versions

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the foundational patterns (auth, data access, RLS)

### Integration Points
- Better Auth provides organization, RBAC, session, and invitation plugins out of the box
- PostgreSQL RLS will be the tenant isolation mechanism used by all subsequent phases
- Package limits will be checked by Phase 2+ features (camera count, viewer limits, etc.)

</code_context>

<specifics>
## Specific Ideas

- Super admin "System" org pattern — a dedicated org that exists at the platform level, not as a customer tenant
- Impersonation capability for Super admin to troubleshoot org-specific issues
- Feature toggle as JSONB allows rapid feature gating without schema changes as new phases ship

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-multi-tenant*
*Context gathered: 2026-04-09*
