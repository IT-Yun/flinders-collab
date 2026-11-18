-- ============================================================
-- 003: Location & File Hardening
-- ============================================================
-- Adds schema-level safeguards for event time ranges,
-- location session freshness, and file metadata integrity.

-- ============================================================
-- 1. Ensure event end_time is always after start_time
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_events_time_range'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT chk_events_time_range CHECK (end_time > start_time);
  END IF;
END $$;

-- ============================================================
-- 2. Location session freshness index
--    Speeds up the "active, non-stale sessions" query used by
--    getLocationStatus (filters on event_id + status + updated_at).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_location_sessions_active
  ON location_sessions (event_id, status, updated_at DESC)
  WHERE status <> 'stopped';

-- ============================================================
-- 3. File metadata: default file_size to 0 when not provided
--    and add a CHECK to prevent negative sizes.
-- ============================================================
ALTER TABLE files
  ALTER COLUMN file_size SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_files_size_non_negative'
  ) THEN
    ALTER TABLE files
      ADD CONSTRAINT chk_files_size_non_negative
      CHECK (file_size >= 0 OR file_size IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_files_file_url_non_empty'
  ) THEN
    ALTER TABLE files
      ADD CONSTRAINT chk_files_file_url_non_empty
      CHECK (length(btrim(file_url)) > 0);
  END IF;
END $$;

-- ============================================================
-- 4. Storage policy: allow room admins/owners to delete files
--    (original policy only allowed the uploader to delete).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'room_files_delete_admin'
  ) THEN
    CREATE POLICY "room_files_delete_admin" ON storage.objects
      FOR DELETE USING (
        bucket_id = 'room-files'
        AND auth.uid() IN (
          SELECT rm.user_id FROM room_members rm
          JOIN rooms r ON r.id = rm.room_id
          WHERE rm.role IN ('owner', 'admin')
          AND r.id::text = (storage.foldername(name))[2]
        )
      );
  END IF;
END $$;
