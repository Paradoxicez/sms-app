---
phase: 25-multi-stage-dockerfiles-image-hardening
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/next.config.ts
autonomous: true
requirements:
  - DEPLOY-02
must_haves:
  truths:
    - "next.config.ts declares outputFileTracingRoot pointing at the monorepo root (two levels up from apps/web/)"
    - "Existing output:'standalone', skipTrailingSlashRedirect:true, and rewrites are preserved unchanged"
    - "pnpm dev still boots without warnings about missing workspace files"
  artifacts:
    - path: apps/web/next.config.ts
      provides: "Next.js config with monorepo-aware outputFileTracingRoot"
      contains: "outputFileTracingRoot"
  key_links:
    - from: apps/web/next.config.ts
      to: "monorepo root (repo root)"
      via: "path.join(__dirname, '../../')"
      pattern: "outputFileTracingRoot"
---

<objective>
Add `outputFileTracingRoot: path.join(__dirname, '../../')` to `apps/web/next.config.ts` so Next.js 15 standalone build (`pnpm build`) traces files across the pnpm workspace correctly. Without this, `apps/web/.next/standalone/server.js` boots in the Docker container and crashes with `Error: Cannot find module '@some/workspace-pkg'` because the file tracer defaults to the closest `package.json` (which is `apps/web/`) and misses workspace symlinks.

Per D-18, this is a SURGICAL addition. We MUST preserve existing keys: `output: 'standalone'`, `skipTrailingSlashRedirect: true`, and the entire `rewrites()` function (lines 12-35 of current file). The current `next.config.ts` uses `import type { NextConfig } from 'next';` only — we need to add `path` and `fileURLToPath` imports plus the `__dirname` ESM polyfill.

Purpose: Plan 05 (web Dockerfile) `RUN pnpm build` produces `.next/standalone/` that the runtime stage copies. Without `outputFileTracingRoot`, the standalone tree is incomplete and the container crashes at boot.
Output: Updated `next.config.ts` (~10 added lines, 0 removed lines).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md
@.planning/research/ARCHITECTURE.md
@apps/web/next.config.ts

<interfaces>
<!-- Next.js 15 docs reference: outputFileTracingRoot -->
<!-- https://nextjs.org/docs/app/api-reference/config/next-config-js/outputFileTracingRoot -->
<!-- For monorepos, set this to the workspace root (repo root) so the tracer includes -->
<!-- pnpm-workspace symlinks. -->

Current `apps/web/next.config.ts` (38 lines, verbatim from working tree — DO NOT modify outside the additions below):
```typescript
import type { NextConfig } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const nextConfig: NextConfig = {
  output: 'standalone',
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
      { source: '/socket.io/', destination: `${API_URL}/socket.io/` },
      { source: '/socket.io/:path+', destination: `${API_URL}/socket.io/:path+` },
    ];
  },
};

export default nextConfig;
```

ESM `__dirname` polyfill — required because next.config.ts is loaded as ESM (verified: file uses `import type` and `export default`):
```typescript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

Path target — from `apps/web/next.config.ts`, two levels up is repo root:
- `apps/web/next.config.ts` → `apps/web/` → `apps/` → repo root.
- `path.join(__dirname, '../../')` resolves to repo root.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add outputFileTracingRoot to next.config.ts</name>
  <files>apps/web/next.config.ts</files>
  <read_first>
    - apps/web/next.config.ts (current 38-line content — must be preserved exactly except for the additions below)
    - .planning/research/ARCHITECTURE.md lines 261-275 (the snippet that mandates this exact addition for pnpm monorepos)
  </read_first>
  <action>
    Edit `apps/web/next.config.ts` to add the ESM `__dirname` polyfill and the `outputFileTracingRoot` config key. The final file must be EXACTLY this (preserving existing comments — do NOT delete the verbose Socket.IO rewrite comments):

    ```typescript
    import type { NextConfig } from 'next';
    import path from 'node:path';
    import { fileURLToPath } from 'node:url';

    // ESM equivalent of CommonJS __dirname — needed because next.config.ts
    // is loaded as an ES module. Used to resolve outputFileTracingRoot
    // relative to this file (apps/web/next.config.ts → repo root is ../../).
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

    const nextConfig: NextConfig = {
      output: 'standalone',
      // outputFileTracingRoot: REQUIRED for pnpm monorepo standalone builds.
      // Without this, .next/standalone/server.js boots in Docker and crashes
      // with "Cannot find module '@some/workspace-pkg'" because the tracer
      // defaults to apps/web/ and misses workspace symlinks. Phase 25 D-18.
      outputFileTracingRoot: path.join(__dirname, '../../'),
      // Skip Next.js's default trailing-slash redirect so the /socket.io/ rewrite
      // reaches the upstream without the browser being bounced through a 308.
      // Socket.IO's default path IS "/socket.io/" with trailing slash — the
      // redirect happens before rewrites and strips it, breaking the match.
      skipTrailingSlashRedirect: true,
      async rewrites() {
        return [
          {
            source: '/api/:path*',
            destination: `${API_URL}/api/:path*`,
          },
          // WebSocket handshakes must ride the same origin as the auth cookie
          // (localhost:3000 in dev) so Better Auth's session cookie reaches the
          // NestJS gateways' handleConnection. Socket.IO's server is mounted at
          // `/socket.io/` *with trailing slash* — Next.js 15's `:path*` rewrite
          // collapses the trailing slash when the capture is empty, so we need
          // TWO explicit rules: one for the base path (empty capture) that
          // preserves the trailing slash, and one for sub-paths (non-empty).
          // See debug/resolved/notifications-srs-log-gateways-reject-browser-cookies.md
          {
            source: '/socket.io/',
            destination: `${API_URL}/socket.io/`,
          },
          {
            source: '/socket.io/:path+',
            destination: `${API_URL}/socket.io/:path+`,
          },
        ];
      },
    };

    export default nextConfig;
    ```

    Concrete diff vs current file:
    - Add 2 import lines (path, fileURLToPath) below the existing `import type { NextConfig } from 'next';`.
    - Add the `__dirname` polyfill block (4 lines including comment + blank line).
    - Inside `nextConfig`, between `output: 'standalone',` and `skipTrailingSlashRedirect: true,`, insert:
      ```typescript
      // outputFileTracingRoot: REQUIRED for pnpm monorepo ... Phase 25 D-18.
      outputFileTracingRoot: path.join(__dirname, '../../'),
      ```
    - Preserve every other line byte-identical (including the existing Socket.IO comment block — DO NOT trim it).
  </action>
  <verify>
    <automated>grep -q "outputFileTracingRoot: path.join(__dirname, '../../'" apps/web/next.config.ts && grep -q "import path from 'node:path';" apps/web/next.config.ts && grep -q "import { fileURLToPath } from 'node:url';" apps/web/next.config.ts && grep -q "output: 'standalone'" apps/web/next.config.ts && grep -q "skipTrailingSlashRedirect: true" apps/web/next.config.ts && grep -q "/socket.io/:path+" apps/web/next.config.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/next.config.ts` contains exact string `outputFileTracingRoot: path.join(__dirname, '../../'`.
    - File contains exact strings `import path from 'node:path';` and `import { fileURLToPath } from 'node:url';`.
    - File still contains exact string `output: 'standalone'` (preserved).
    - File still contains exact string `skipTrailingSlashRedirect: true` (preserved).
    - File still contains both rewrite rules: `'/socket.io/'` and `'/socket.io/:path+'` (verified separately so a regex doesn't accidentally pass on one).
    - File still contains the existing API rewrite: `source: '/api/:path*'`.
  </acceptance_criteria>
  <done>next.config.ts has the new key + ESM polyfill, all existing config preserved.</done>
</task>

<task type="auto">
  <name>Task 2: Validate the config builds and dev still boots</name>
  <files>(no file changes — runtime verification only)</files>
  <read_first>
    - apps/web/next.config.ts (verify the edits from Task 1 landed)
  </read_first>
  <action>
    1. From repo root: `pnpm --filter @sms-platform/web build` — must exit 0 and produce `apps/web/.next/standalone/` directory. Next.js will print `Creating an optimized production build ...` and on monorepos with `outputFileTracingRoot` set will trace the workspace correctly.
    2. Verify the standalone output exists: `test -d apps/web/.next/standalone && test -f apps/web/.next/standalone/apps/web/server.js` (path inside standalone reflects the workspace structure when `outputFileTracingRoot` points at repo root).
    3. Boot dev briefly to confirm no regression: `pnpm --filter @sms-platform/web dev > /tmp/web-25-03.log 2>&1 &` then `sleep 15` then `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/` — expected non-5xx code. Then kill the bg process.
    4. Optional but recommended: `bash scripts/dev-smoke.sh` — must exit 0.
  </action>
  <verify>
    <automated>pnpm --filter @sms-platform/web build > /tmp/web-build-25-03.log 2>&1 && test -d apps/web/.next/standalone && test -f apps/web/.next/standalone/apps/web/server.js</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @sms-platform/web build` exits 0.
    - Directory `apps/web/.next/standalone/` exists after build.
    - File `apps/web/.next/standalone/apps/web/server.js` exists (proves tracing root captured the monorepo structure correctly — without outputFileTracingRoot, the path would be `.next/standalone/server.js` flat).
    - `bash scripts/dev-smoke.sh` exits 0 (no regression).
  </acceptance_criteria>
  <done>Production build succeeds, standalone output reflects the monorepo layout, dev workflow unaffected.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Build context → image | `pnpm build` runs in builder stage of Plan 05 Dockerfile; `.next/standalone/` is copied to runtime stage |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-06 | Tampering / DoS | Standalone build missing files | mitigate | `outputFileTracingRoot` set to monorepo root ensures workspace deps are traced into `.next/standalone/`; without it, container boot crashes with "Cannot find module" — caught by Plan 06 D-19 step 8 (curl /api/health on running web container). |
| T-25-07 | Information Disclosure | Tracing root pulls in extra files | accept | `path.join(__dirname, '../../')` resolves to repo root. Build context is already filtered by per-app `.dockerignore` (Plan 05) which excludes `.env*`, `.git`, `.planning/`, etc. — so tracing root doesn't widen the leak surface. |
</threat_model>

<verification>
1. `grep -q "outputFileTracingRoot" apps/web/next.config.ts`.
2. `pnpm --filter @sms-platform/web build` exits 0.
3. `apps/web/.next/standalone/apps/web/server.js` exists.
4. `bash scripts/dev-smoke.sh` exits 0.
</verification>

<success_criteria>
- next.config.ts is monorepo-aware for standalone builds.
- Plan 05 web Dockerfile builder stage will produce a complete standalone tree.
- Plan 06 step D-19.8 (`docker run --rm sms-web:phase25-test ...` + `curl /api/health` returns 200) becomes achievable.
</success_criteria>

<output>
After completion, create `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-03-SUMMARY.md`
</output>
