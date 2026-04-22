-- Phase 19 / D-10c: pre-constraint dedup for Camera.streamUrl
-- MUST run BEFORE `prisma db push` adds @@unique([orgId, streamUrl]).
-- Strategy: keep-oldest per (orgId, streamUrl) tuple (A3 in 19-RESEARCH).
-- Safe to re-run: idempotent — the second run finds zero rows whose
-- createdAt is strictly greater than another row's with the same
-- (orgId, streamUrl), so DELETE is a no-op.
--
-- Tenant isolation: the composite key starts with orgId, so orgA and orgB
-- holding the same streamUrl are not considered duplicates (T-19-05).

DELETE FROM "Camera" c
USING "Camera" c2
WHERE c."orgId" = c2."orgId"
  AND c."streamUrl" = c2."streamUrl"
  AND c."createdAt" > c2."createdAt";
