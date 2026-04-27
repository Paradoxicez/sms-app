# deploy/

Production deployment artifacts. **This directory is production-only — do not place dev tooling here.**

Each phase of the v1.3 milestone fills in specific files:

- Phase 25 — `apps/api/Dockerfile`, `apps/web/Dockerfile`, per-app `.dockerignore` (image pipeline; lives under `apps/`, not here)
- Phase 26 — `deploy/docker-compose.yml`, `deploy/.env.production.example`
- Phase 27 — `deploy/Caddyfile`, `deploy/DOMAIN-SETUP.md`
- Phase 28 — `.github/workflows/build-images.yml`, `.github/workflows/release.yml` (CI/CD; lives under `.github/`, not here)
- Phase 29 — `deploy/scripts/{bootstrap,update,backup,restore,init-secrets}.sh`, `deploy/BACKUP-RESTORE.md`, `deploy/TROUBLESHOOTING.md`, and a real 5-step quickstart that **overwrites this README**

See `.planning/ROADMAP.md` (Phases 24-30) and `.planning/REQUIREMENTS.md` (DEPLOY-01..26) for the canonical scope.

**Convention lock:** see `CLAUDE.md` §"Deploy Folder Convention" — `deploy/` = production-only artifacts; `apps/` = dev workflow source; `pnpm-workspace.yaml` MUST NOT include `deploy/`.
