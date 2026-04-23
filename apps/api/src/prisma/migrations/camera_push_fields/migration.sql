-- Phase 19.1 / D-06: seed ingestMode='pull' for all existing Camera rows.
-- MUST run BEFORE `prisma db push` in apps/api/package.json db:push chain.
-- Idempotent: the UPDATE only touches rows where ingestMode IS NULL, so
-- repeated runs after prisma db push has added the column are no-ops.
-- Safe on an empty table (UPDATE of zero rows).
--
-- The column does not exist yet on first run (Prisma adds it via db push),
-- so we guard with information_schema. This keeps the migration chain
-- compatible with fresh test DBs that get schema via prisma db push only.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Camera' AND column_name = 'ingestMode'
  ) THEN
    UPDATE "Camera" SET "ingestMode" = 'pull' WHERE "ingestMode" IS NULL;
  END IF;
END $$;
