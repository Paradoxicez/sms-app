// Phase 22 D-06: Prisma Client Extension that mirrors Camera.tags into
// Camera.tagsNormalized on every write path. The extension is the ONLY
// chokepoint that keeps the lowercase shadow column (used by the GIN-indexed
// filter `?tags[]=`) in sync — service-layer mirroring would force every
// callpath (CRUD, bulk import, bulk tag op, future paths) to remember to set
// both fields and is therefore intentionally avoided.
//
// Pattern source: 22-RESEARCH.md §"Pattern 1: Prisma Client Extension for
// write-time tag normalization", verified against existing
// apps/api/src/tenancy/prisma-tenancy.extension.ts (project standardizes on
// `prisma.$extends({ query: { … } })` — `$use` middleware was removed in v5+).
//
// Hook surface:
//   • create  — bulk import (D-10) lands here per-row, single-camera Add too
//   • update  — single-camera edits + per-row tx in bulkTagAction (D-12)
//   • upsert  — defensive coverage for any future upsert callsites
//
// Intentionally NOT hooked: `createMany` and `updateMany` cannot mutate
// per-row data through the extension; bulk paths use per-row create/update
// (Pitfall 5 in 22-RESEARCH.md), so they always trigger the per-row hook.
import type { PrismaClient } from '@prisma/client';
import { normalizeForDb } from './tag-normalize';

type ExtensibleClient = PrismaClient | ReturnType<PrismaClient['$extends']>;

export function createTagNormalizationExtension<T extends ExtensibleClient>(
  prisma: T,
) {
  return (prisma as any).$extends({
    name: 'cameraTagNormalization',
    query: {
      camera: {
        async create({ args, query }: any) {
          if (Array.isArray(args?.data?.tags)) {
            args.data.tagsNormalized = normalizeForDb(args.data.tags);
          }
          return query(args);
        },
        async update({ args, query }: any) {
          if (Array.isArray(args?.data?.tags)) {
            args.data.tagsNormalized = normalizeForDb(args.data.tags);
          }
          return query(args);
        },
        async upsert({ args, query }: any) {
          if (Array.isArray(args?.create?.tags)) {
            args.create.tagsNormalized = normalizeForDb(args.create.tags);
          }
          if (Array.isArray(args?.update?.tags)) {
            args.update.tagsNormalized = normalizeForDb(args.update.tags);
          }
          return query(args);
        },
      },
    },
  });
}
