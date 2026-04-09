---
phase: 02-stream-engine-camera-management
plan: 01
status: completed
started: "2026-04-09T13:00:31Z"
completed: "2026-04-09T13:03:55Z"
duration: 204s
commits:
  - 3ae8414
  - 4cf5a3d
tasks_completed: 2
tasks_total: 2
key-decisions:
  - "RLS policies applied to 5 org-scoped tables; SystemSettings excluded (super admin only)"
  - "SRS srs.conf uses fMP4 HLS with 2s fragments matching CLAUDE.md recommendations"
  - "Docker sms-network bridge connects all services for internal callback routing"
key-files:
  created:
    - config/srs.conf
    - apps/api/Dockerfile
  modified:
    - apps/api/src/prisma/schema.prisma
    - apps/api/package.json
    - apps/web/package.json
    - docker-compose.yml
dependency-graph:
  requires: []
  provides:
    - "Phase 2 Prisma models (Project, Site, Camera, StreamProfile, OrgSettings, SystemSettings)"
    - "SRS streaming container with HLS and WebRTC"
    - "API Dockerfile with FFmpeg"
    - "BullMQ, Socket.IO, fluent-ffmpeg npm packages"
  affects:
    - "All subsequent Phase 2 plans (02-02 through 02-06)"
tech-stack:
  added:
    - "bullmq@5.x"
    - "@nestjs/bullmq@11.x"
    - "socket.io@4.x"
    - "@nestjs/websockets@11.x"
    - "@nestjs/platform-socket.io@11.x"
    - "fluent-ffmpeg@2.x"
    - "csv-parse@6.x"
    - "@nestjs/schedule@6.x"
    - "hls.js@1.x"
    - "socket.io-client@4.x"
  patterns:
    - "SRS HTTP callbacks on internal Docker network"
    - "fMP4 HLS with 2s fragment / 10s window"
---

# Phase 02 Plan 01: Foundation Infrastructure Summary

Prisma schema extended with 6 Phase 2 models, SRS v6 container running with fMP4 HLS and WebRTC, API Dockerfile with FFmpeg, and all streaming dependencies installed.

## Objective

Establish the database schema, streaming infrastructure, and dependency foundation that all subsequent Phase 2 plans build upon.

## What Was Built

### Task 1: Prisma Schema + RLS + Dependencies
- Added 6 new models to Prisma schema: Project, Site, Camera, StreamProfile, OrgSettings, SystemSettings
- All org-scoped tables have RLS policies (Project, Site, Camera, StreamProfile, OrgSettings)
- SystemSettings excluded from RLS (super admin only, no orgId)
- Permissions granted to app_user role on all Phase 2 tables
- API dependencies: bullmq, @nestjs/bullmq, socket.io, @nestjs/websockets, @nestjs/platform-socket.io, fluent-ffmpeg, csv-parse, @nestjs/schedule
- Web dependencies: hls.js, socket.io-client

### Task 2: Docker Compose SRS + srs.conf + Dockerfile
- SRS v6 container added to Docker Compose with all 5 port mappings (1935, 1985, 8080, 8000/udp, 10080/udp)
- srs.conf configured with: HLS fMP4 (2s fragments, 10s window), 6 HTTP callbacks pointing to api:3001, WebRTC (WHEP) enabled
- API Dockerfile created with FFmpeg and curl on node:22-slim base
- sms-network bridge network connects all services
- srs_data volume for HLS segments and DVR files
- SRS verified running: curl returns version 6.0.184

## Key Files

### Created
- `config/srs.conf`: SRS streaming engine configuration with HLS, callbacks, WebRTC
- `apps/api/Dockerfile`: API container image with FFmpeg for RTSP processing

### Modified
- `apps/api/src/prisma/schema.prisma`: Added Project, Site, Camera, StreamProfile, OrgSettings, SystemSettings models
- `apps/api/package.json`: Added bullmq, socket.io, fluent-ffmpeg, csv-parse and related packages
- `apps/web/package.json`: Added hls.js, socket.io-client
- `docker-compose.yml`: Added SRS service, sms-network, srs_data volume

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - this plan establishes infrastructure and schema only, no application logic stubs.

## Issues

None.

## Self-Check: PASSED

All created files exist. All commits verified in git log.
