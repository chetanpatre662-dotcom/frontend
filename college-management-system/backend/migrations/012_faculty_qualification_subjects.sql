-- =============================================================================
-- 012_faculty_qualification_subjects.sql
-- -----------------------------------------------------------------------------
-- The faculty profile screen now collects two additional (optional) details:
--   * qualification      — highest academic qualification (e.g. "M.Tech, PhD")
--   * subjects_handled    — free-text list of subjects/courses the faculty
--                           teaches (comma-separated in the UI). Stored as TEXT
--                           to stay non-breaking (no new relational table).
--
-- Both are nullable so existing faculty rows remain valid without backfill.
-- Additive and safe: no data is dropped, no existing columns change. The
-- migration runner wraps this file in a single transaction. IF NOT EXISTS keeps
-- it idempotent if partially applied.
-- =============================================================================

ALTER TABLE faculty ADD COLUMN IF NOT EXISTS qualification    TEXT;
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS subjects_handled TEXT;
