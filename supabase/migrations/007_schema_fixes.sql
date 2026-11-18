-- ============================================================
-- Schema fixes: files columns, reports RLS, and new indexes
-- ============================================================

-- 1. Add missing columns to files table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'files' AND column_name = 'event_id') THEN
    ALTER TABLE files ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'files' AND column_name = 'backup_path') THEN
    ALTER TABLE files ADD COLUMN backup_path TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'files' AND column_name = 'deleted_at') THEN
    ALTER TABLE files ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

-- 2. Enable RLS on reports table and add policies

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can create a report
CREATE POLICY "reports_insert" ON reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users can view their own reports
CREATE POLICY "reports_select_own" ON reports
  FOR SELECT USING (user_id = auth.uid());

-- Admins can view all reports
CREATE POLICY "reports_select_admin" ON reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Admins can update reports
CREATE POLICY "reports_update_admin" ON reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- 3. Add indexes on new files columns

CREATE INDEX IF NOT EXISTS idx_files_event_id ON files(event_id);
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at) WHERE deleted_at IS NULL;
