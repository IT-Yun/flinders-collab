-- Normalize public user profiles for Flinders and non-Flinders students.

ALTER TABLE users ADD COLUMN IF NOT EXISTS university TEXT;

DO $$ DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'users'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%university_email%'
      AND pg_get_constraintdef(c.oid) ILIKE '%flinders.edu.au%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

UPDATE users
SET university = COALESCE(NULLIF(university, ''), 'Flinders University')
WHERE university IS NULL OR university = '';
