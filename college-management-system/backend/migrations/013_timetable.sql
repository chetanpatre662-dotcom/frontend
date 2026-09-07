-- =============================================================================
-- 013_timetable.sql — Timetable management (ADDITIVE, backward-compatible).
-- -----------------------------------------------------------------------------
-- Adds a weekly class timetable to Askbook. The academic identity is the SAME
-- triple used everywhere else: (program, branch, semester). No section/batch/
-- academic-session concept is introduced because none exists in the schema —
-- those relationships are intentionally NOT fabricated.
--
-- Model:
--   timetables         one row per academic group (program+branch+semester).
--                      A group has at most one active timetable ("the current
--                      timetable for CSE B.Tech Sem 2").
--   timetable_entries  the individual weekly slots (Monday 09:30-10:30 → DSA).
--                      Each slot may OPTIONALLY reference a real subject
--                      (courses.id) and a faculty (faculty.id) and a room.
--                      Unmatched subjects are kept as free text (subject_name)
--                      with course_id NULL so the admin-review flow can map them
--                      later — never fabricated, never auto-created.
--
-- SAFETY: only CREATE TABLE IF NOT EXISTS + additive ALTER guarded by DO blocks.
-- No DROP DATABASE / DROP TABLE / TRUNCATE. Fully idempotent.
-- =============================================================================

-- ---- 1) timetables: one timetable per academic group ------------------------
CREATE TABLE IF NOT EXISTS timetables (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Denormalized academic group (mirrors courses/classes columns). Catalog
  -- values are validated in the service layer against course_catalog/branches.
  program     TEXT        NOT NULL,
  branch      TEXT        NOT NULL,
  semester    SMALLINT    NOT NULL CHECK (semester BETWEEN 1 AND 12),
  title       TEXT,                       -- e.g. "Odd Sem 2025 timetable"
  -- How this timetable was produced (for the admin UI + observability). Always
  -- 'manual' unless it came through the AI extraction+review flow.
  source_kind TEXT        NOT NULL DEFAULT 'manual'
                          CHECK (source_kind IN ('manual','image','pdf','text','url')),
  created_by  BIGINT      REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One timetable per exact academic group. Re-saving replaces its entries.
  CONSTRAINT uq_timetables_group UNIQUE (program, branch, semester)
);

CREATE INDEX IF NOT EXISTS idx_timetables_group
  ON timetables (program, branch, semester);

DROP TRIGGER IF EXISTS trg_timetables_updated_at ON timetables;
CREATE TRIGGER trg_timetables_updated_at
  BEFORE UPDATE ON timetables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- 2) timetable_entries: the individual weekly slots ----------------------
CREATE TABLE IF NOT EXISTS timetable_entries (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timetable_id  BIGINT      NOT NULL REFERENCES timetables (id) ON DELETE CASCADE,
  -- 0 = Monday … 6 = Sunday (ISO-ish, stored as SMALLINT for cheap filtering).
  day_of_week   SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 24h times stored as TIME. start < end enforced in the service + a CHECK.
  start_time    TIME        NOT NULL,
  end_time      TIME        NOT NULL,
  -- OPTIONAL real subject reference (courses.id). NULL when the extracted
  -- subject could not be safely matched — the admin resolves it on review.
  course_id     BIGINT      REFERENCES courses (id) ON DELETE SET NULL,
  -- Always-present display name (what the timetable literally said). Even when
  -- course_id is set, we keep the label the admin confirmed.
  subject_name  TEXT        NOT NULL,
  subject_code  TEXT,                     -- optional, as printed on the source
  -- OPTIONAL faculty reference (faculty.id). NULL when unknown/unmatched.
  faculty_id    BIGINT      REFERENCES faculty (id) ON DELETE SET NULL,
  faculty_name  TEXT,                     -- optional free-text (as printed)
  room          TEXT,                     -- optional
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_timetable_entry_time CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_timetable_entries_tt
  ON timetable_entries (timetable_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_course
  ON timetable_entries (course_id);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_faculty
  ON timetable_entries (faculty_id);

DROP TRIGGER IF EXISTS trg_timetable_entries_updated_at ON timetable_entries;
CREATE TRIGGER trg_timetable_entries_updated_at
  BEFORE UPDATE ON timetable_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- 3) Allow 'timetable' as a RAG source_type ------------------------------
-- ai_document_chunks.source_type (migration 010) constrains the source kinds.
-- Extend the CHECK to ADD 'timetable' so a saved timetable can be indexed for
-- RAG ("what does my timetable look like this week?"). Guarded + idempotent,
-- exactly like migration 011 did for the files.entity_type constraint. This is
-- additive: existing values remain valid, no rows are affected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_document_chunks_source_type_check') THEN
    ALTER TABLE ai_document_chunks DROP CONSTRAINT ai_document_chunks_source_type_check;
  END IF;
  ALTER TABLE ai_document_chunks
    ADD CONSTRAINT ai_document_chunks_source_type_check
    CHECK (source_type IN
      ('note','question_paper','assignment','project',
       'announcement','event','document','timetable'));
END $$;
