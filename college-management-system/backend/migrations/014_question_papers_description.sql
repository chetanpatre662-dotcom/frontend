-- =============================================================================
-- 014_question_papers_description.sql
-- -----------------------------------------------------------------------------
-- Root cause of the "column 'description' of relation 'question_papers' does
-- not exist" error:
--
--   classContentRepository.js is a generic handler for notes, question_papers,
--   assignments, and projects.  It always includes `description` in every
--   SELECT / INSERT / UPDATE because the notes / assignments / projects tables
--   all have that column.  The question_papers table in migration 001 was
--   created without it, so every write via the generic repository fails.
--
-- Fix:  add `description TEXT` to question_papers (nullable, backward-compatible).
-- This restores parity with the other content tables and unblocks Add/Edit.
--
-- SAFETY:
--   * Purely ADDITIVE (ALTER TABLE … ADD COLUMN IF NOT EXISTS).
--   * Nullable: no default is needed; existing rows get NULL (no data loss).
--   * Guarded with IF NOT EXISTS so re-running after a partial failure is safe.
--   * No DROP / TRUNCATE / destructive operation of any kind.
--   * Runs in one transaction (the migration runner wraps every file in
--     BEGIN … COMMIT / ROLLBACK on failure).
-- =============================================================================

ALTER TABLE question_papers
  ADD COLUMN IF NOT EXISTS description TEXT;

-- A note on the check constraint approach used in migration 006 for assignments
-- and projects: those tables were created WITH description in their CREATE TABLE
-- statements, so no ALTER was needed there.  This file makes question_papers
-- match their shape.
