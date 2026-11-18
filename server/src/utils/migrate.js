const config = require('../config');

const MIGRATION_SQL = `
-- Add academic info columns to users table (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS year_level INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS semester INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS university TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS room_order JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flinders_interests JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS flinders_favorites JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{"chat": true, "tasks": true, "schedule": true, "files": true, "announcements": true, "board": true, "room_updates": true, "friend_requests": true}'::jsonb;

-- Allow non-Flinders university emails in the public users table.
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

-- Board posts table
CREATE TABLE IF NOT EXISTS board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_board_posts_author ON board_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_board_posts_category ON board_posts(category);
CREATE INDEX IF NOT EXISTS idx_board_posts_created ON board_posts(created_at DESC);

-- Board participations
CREATE TABLE IF NOT EXISTS board_participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('join', 'pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_board_participations_post ON board_participations(post_id);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL DEFAULT 'board_post',
  target_id UUID NOT NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);

-- RLS
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_select') THEN
  CREATE POLICY "board_posts_select" ON board_posts FOR SELECT USING (auth.uid() IS NOT NULL);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_insert') THEN
  CREATE POLICY "board_posts_insert" ON board_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_update') THEN
  CREATE POLICY "board_posts_update" ON board_posts FOR UPDATE USING (auth.uid() = author_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_delete') THEN
  CREATE POLICY "board_posts_delete" ON board_posts FOR DELETE USING (auth.uid() = author_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_participations_select') THEN
  CREATE POLICY "board_participations_select" ON board_participations FOR SELECT USING (auth.uid() IS NOT NULL);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_participations_insert') THEN
  CREATE POLICY "board_participations_insert" ON board_participations FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_participations_update') THEN
  CREATE POLICY "board_participations_update" ON board_participations FOR UPDATE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_participations_delete') THEN
  CREATE POLICY "board_participations_delete" ON board_participations FOR DELETE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_select') THEN
  CREATE POLICY "comments_select" ON comments FOR SELECT USING (auth.uid() IS NOT NULL);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_insert') THEN
  CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (auth.uid() = author_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_delete') THEN
  CREATE POLICY "comments_delete" ON comments FOR DELETE USING (auth.uid() = author_id);
END IF;
END $$;

-- Add anonymous flag to board_posts
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;

-- Add poll columns to board_posts
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS poll_options JSONB DEFAULT NULL;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS anonymous_poll BOOLEAN DEFAULT false;

-- Post reactions table
CREATE TABLE IF NOT EXISTS post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('fire', 'heart', 'laugh', 'clap', 'think')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id);

-- Poll votes table
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_post ON poll_votes(post_id);

-- RLS for new tables
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'post_reactions_select') THEN
  CREATE POLICY "post_reactions_select" ON post_reactions FOR SELECT USING (auth.uid() IS NOT NULL);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'post_reactions_insert') THEN
  CREATE POLICY "post_reactions_insert" ON post_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'post_reactions_delete') THEN
  CREATE POLICY "post_reactions_delete" ON post_reactions FOR DELETE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'poll_votes_select') THEN
  CREATE POLICY "poll_votes_select" ON poll_votes FOR SELECT USING (auth.uid() IS NOT NULL);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'poll_votes_insert') THEN
  CREATE POLICY "poll_votes_insert" ON poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'poll_votes_update') THEN
  CREATE POLICY "poll_votes_update" ON poll_votes FOR UPDATE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'poll_votes_delete') THEN
  CREATE POLICY "poll_votes_delete" ON poll_votes FOR DELETE USING (auth.uid() = user_id);
END IF;
END $$;

-- Add FK to public.users for PostgREST joins (auth.users FK is not visible to PostgREST)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'board_posts_author_users_fkey' AND table_name = 'board_posts') THEN
    ALTER TABLE board_posts ADD CONSTRAINT board_posts_author_users_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'comments_author_users_fkey' AND table_name = 'comments') THEN
    ALTER TABLE comments ADD CONSTRAINT comments_author_users_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'poll_votes_user_users_fkey' AND table_name = 'poll_votes') THEN
    ALTER TABLE poll_votes ADD CONSTRAINT poll_votes_user_users_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Task assignees table (multi-assignee support)
CREATE TABLE IF NOT EXISTS task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);

-- Make assigned_to nullable for multi-assignee tasks
ALTER TABLE tasks ALTER COLUMN assigned_to DROP NOT NULL;

-- RLS for task_assignees
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'task_assignees_select') THEN
  CREATE POLICY "task_assignees_select" ON task_assignees FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN room_members rm ON rm.room_id = t.room_id AND rm.user_id = auth.uid()
      WHERE t.id = task_assignees.task_id
    )
  );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'task_assignees_insert') THEN
  CREATE POLICY "task_assignees_insert" ON task_assignees FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN room_members rm ON rm.room_id = t.room_id AND rm.user_id = auth.uid()
      WHERE t.id = task_assignees.task_id
    )
  );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'task_assignees_update') THEN
  CREATE POLICY "task_assignees_update" ON task_assignees FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tasks t
      JOIN room_members rm ON rm.room_id = t.room_id AND rm.user_id = auth.uid()
      WHERE t.id = task_assignees.task_id AND rm.role IN ('owner', 'admin')
    )
  );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'task_assignees_delete') THEN
  CREATE POLICY "task_assignees_delete" ON task_assignees FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN room_members rm ON rm.room_id = t.room_id AND rm.user_id = auth.uid()
      WHERE t.id = task_assignees.task_id AND rm.role IN ('owner', 'admin')
    )
  );
END IF;
END $$;

-- FK to public.users for PostgREST joins on task_assignees
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'task_assignees_user_users_fkey' AND table_name = 'task_assignees') THEN
    ALTER TABLE task_assignees ADD CONSTRAINT task_assignees_user_users_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Room announcements
CREATE TABLE IF NOT EXISTS room_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_announcements_room ON room_announcements(room_id);

-- Announcement reads (tracks who has read which announcement)
CREATE TABLE IF NOT EXISTS announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES room_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);

ALTER TABLE room_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'room_announcements_select') THEN
  CREATE POLICY "room_announcements_select" ON room_announcements FOR SELECT USING (
    EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = room_announcements.room_id AND rm.user_id = auth.uid())
  );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'room_announcements_insert') THEN
  CREATE POLICY "room_announcements_insert" ON room_announcements FOR INSERT WITH CHECK (auth.uid() = author_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'room_announcements_delete') THEN
  CREATE POLICY "room_announcements_delete" ON room_announcements FOR DELETE USING (auth.uid() = author_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'announcement_reads_select') THEN
  CREATE POLICY "announcement_reads_select" ON announcement_reads FOR SELECT USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'announcement_reads_insert') THEN
  CREATE POLICY "announcement_reads_insert" ON announcement_reads FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
END $$;

-- FK to public.users for PostgREST joins
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'room_announcements_author_users_fkey' AND table_name = 'room_announcements') THEN
    ALTER TABLE room_announcements ADD CONSTRAINT room_announcements_author_users_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Cached Flinders events (auto-crawled daily)
CREATE TABLE IF NOT EXISTS flinders_events_cache (
  id SERIAL PRIMARY KEY,
  wp_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  link TEXT,
  image TEXT,
  event_date TIMESTAMPTZ,
  categories TEXT[] DEFAULT '{}',
  raw_json JSONB,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flinders_events_date ON flinders_events_cache(event_date);

-- Add location, time, cost columns to events cache
ALTER TABLE flinders_events_cache ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE flinders_events_cache ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE flinders_events_cache ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE flinders_events_cache ADD COLUMN IF NOT EXISTS cost TEXT;
ALTER TABLE flinders_events_cache ADD COLUMN IF NOT EXISTS time_display TEXT;

-- Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_room_active ON files(room_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_user ON post_reactions(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_post_user ON poll_votes(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_board_participations_post_user ON board_participations(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_room_announcements_room_created ON room_announcements(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON announcement_reads(user_id, announcement_id);
CREATE INDEX IF NOT EXISTS idx_events_room_start ON events(room_id, start_time);
CREATE INDEX IF NOT EXISTS idx_tasks_room_created ON tasks(room_id, created_at DESC);

-- Cross-device user state
ALTER TABLE users ADD COLUMN IF NOT EXISTS board_last_seen_at TIMESTAMPTZ;
ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_visited_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_room_members_user_last_visited ON room_members(user_id, last_visited_at DESC);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_type TEXT NOT NULL DEFAULT 'group';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS direct_pair_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_direct_pair_key ON rooms(direct_pair_key) WHERE direct_pair_key IS NOT NULL;

-- Room quick links
CREATE TABLE IF NOT EXISTS room_quick_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL DEFAULT 'Other',
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_quick_links_room_created ON room_quick_links(room_id, created_at ASC);

ALTER TABLE room_quick_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'room_quick_links_select') THEN
  CREATE POLICY "room_quick_links_select" ON room_quick_links FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members rm
      WHERE rm.room_id = room_quick_links.room_id
        AND rm.user_id = auth.uid()
    )
  );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'room_quick_links_insert') THEN
  CREATE POLICY "room_quick_links_insert" ON room_quick_links FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM room_members rm
      WHERE rm.room_id = room_quick_links.room_id
        AND rm.user_id = auth.uid()
    )
  );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'room_quick_links_delete') THEN
  CREATE POLICY "room_quick_links_delete" ON room_quick_links FOR DELETE USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM room_members rm
      WHERE rm.room_id = room_quick_links.room_id
        AND rm.user_id = auth.uid()
        AND rm.role IN ('owner', 'admin')
    )
  );
END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'room_quick_links_created_by_users_fkey' AND table_name = 'room_quick_links') THEN
    ALTER TABLE room_quick_links ADD CONSTRAINT room_quick_links_created_by_users_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Push subscriptions for PWA notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_subscriptions_manage_own') THEN
  CREATE POLICY "push_subscriptions_manage_own" ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
END IF;
END $$;

-- Deadline reminder ledger to prevent duplicate notifications
CREATE TABLE IF NOT EXISTS deadline_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id, reminder_date)
);
CREATE INDEX IF NOT EXISTS idx_deadline_reminders_date ON deadline_reminders(reminder_date);

-- Flinap: privacy-friendly campus presence board (campus only, never raw coordinates)
CREATE TABLE IF NOT EXISTS flinders_campus_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  campus TEXT NOT NULL CHECK (campus IN ('city', 'bedford', 'tonsley')),
  activity_status TEXT NOT NULL DEFAULT 'study' CHECK (activity_status IN ('study', 'in_class', 'meal', 'coffee', 'team_up', 'quiet', 'break')),
  status_message TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('gps', 'manual')),
  sharing_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flinders_campus_presence_campus ON flinders_campus_presence(campus);
CREATE INDEX IF NOT EXISTS idx_flinders_campus_presence_updated ON flinders_campus_presence(updated_at DESC);

CREATE TABLE IF NOT EXISTS flinders_friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  pair_key TEXT NOT NULL,
  direct_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flinders_friend_requests_pair_pending
  ON flinders_friend_requests(pair_key)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_flinders_friend_requests_requester ON flinders_friend_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flinders_friend_requests_target ON flinders_friend_requests(target_id, created_at DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'flinders_friend_requests_requester_users_fkey' AND table_name = 'flinders_friend_requests') THEN
    ALTER TABLE flinders_friend_requests ADD CONSTRAINT flinders_friend_requests_requester_users_fkey FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'flinders_friend_requests_target_users_fkey' AND table_name = 'flinders_friend_requests') THEN
    ALTER TABLE flinders_friend_requests ADD CONSTRAINT flinders_friend_requests_target_users_fkey FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'flinders_campus_presence_user_users_fkey' AND table_name = 'flinders_campus_presence') THEN
    ALTER TABLE flinders_campus_presence ADD CONSTRAINT flinders_campus_presence_user_users_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE flinders_campus_presence ADD COLUMN IF NOT EXISTS activity_status TEXT NOT NULL DEFAULT 'study';
ALTER TABLE flinders_campus_presence ADD COLUMN IF NOT EXISTS status_message TEXT;
DELETE FROM flinders_campus_presence WHERE campus = 'off_campus';
ALTER TABLE flinders_campus_presence DROP CONSTRAINT IF EXISTS flinders_campus_presence_campus_check;
ALTER TABLE flinders_campus_presence ADD CONSTRAINT flinders_campus_presence_campus_check CHECK (campus IN ('city', 'bedford', 'tonsley'));
ALTER TABLE flinders_campus_presence DROP CONSTRAINT IF EXISTS flinders_campus_presence_activity_status_check;
ALTER TABLE flinders_campus_presence ADD CONSTRAINT flinders_campus_presence_activity_status_check CHECK (activity_status IN ('study', 'in_class', 'meal', 'coffee', 'team_up', 'quiet', 'break'));
ALTER TABLE flinders_friend_requests ADD COLUMN IF NOT EXISTS pair_key TEXT;
ALTER TABLE flinders_friend_requests ADD COLUMN IF NOT EXISTS location_visible_to JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE flinders_friend_requests
SET pair_key = LEAST(requester_id::text, target_id::text) || ':' || GREATEST(requester_id::text, target_id::text)
WHERE pair_key IS NULL;

-- Enable Realtime on campus presence & friend requests (Pro plan)
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE flinders_campus_presence;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE flinders_friend_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Set REPLICA IDENTITY FULL for complete row data in Realtime events
ALTER TABLE flinders_campus_presence REPLICA IDENTITY FULL;
ALTER TABLE flinders_friend_requests REPLICA IDENTITY FULL;

-- RLS for Realtime subscriptions
ALTER TABLE flinders_campus_presence ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flinders_campus_presence' AND policyname = 'realtime_select_presence') THEN
    CREATE POLICY realtime_select_presence ON flinders_campus_presence FOR SELECT TO authenticated USING (sharing_enabled = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flinders_campus_presence' AND policyname = 'own_presence_all') THEN
    CREATE POLICY own_presence_all ON flinders_campus_presence FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- Timetable: course topics + student timetable
-- ============================================================

CREATE TABLE IF NOT EXISTS flinders_topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    credit_points TEXT,
    level TEXT,
    school TEXT,
    academic_org TEXT,
    year INT NOT NULL DEFAULT 2026,
    semesters TEXT[],
    campuses TEXT[],
    delivery_modes TEXT[],
    prerequisites TEXT,
    offerings JSONB,
    handbook_url TEXT,
    crawled_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(topic_code, year)
);
ALTER TABLE flinders_topics ADD COLUMN IF NOT EXISTS offerings JSONB;
CREATE INDEX IF NOT EXISTS idx_flinders_topics_code ON flinders_topics (topic_code);
CREATE INDEX IF NOT EXISTS idx_flinders_topics_title ON flinders_topics USING gin (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_flinders_topics_year ON flinders_topics (year);

CREATE TABLE IF NOT EXISTS user_timetable (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES flinders_topics(id) ON DELETE CASCADE,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    day_of_week INT,
    start_time TIME,
    end_time TIME,
    class_type TEXT,
    location TEXT,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, topic_id, day_of_week, start_time)
);
CREATE INDEX IF NOT EXISTS idx_user_timetable_user ON user_timetable (user_id);
CREATE INDEX IF NOT EXISTS idx_user_timetable_topic ON user_timetable (topic_id);

CREATE TABLE IF NOT EXISTS topic_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL REFERENCES flinders_topics(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(topic_id)
);
CREATE INDEX IF NOT EXISTS idx_topic_rooms_topic ON topic_rooms (topic_id);

ALTER TABLE flinders_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_rooms ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flinders_topics' AND policyname = 'topics_select_all') THEN
    CREATE POLICY topics_select_all ON flinders_topics FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_timetable' AND policyname = 'timetable_own') THEN
    CREATE POLICY timetable_own ON user_timetable FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'topic_rooms' AND policyname = 'topic_rooms_select_all') THEN
    CREATE POLICY topic_rooms_select_all ON topic_rooms FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Admin global announcements (site-wide banners)
CREATE TABLE IF NOT EXISTS admin_announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    type TEXT DEFAULT 'info' CHECK (type IN ('info','warning','success')),
    is_active BOOLEAN DEFAULT true,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);
-- ============================================================
-- Security: Harden storage policies (room members only)
-- ============================================================

-- Drop old overly-permissive SELECT policy and replace with member-only
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'room_files_select') THEN
    DROP POLICY "room_files_select" ON storage.objects;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'room_files_select_members') THEN
    CREATE POLICY "room_files_select_members" ON storage.objects
      FOR SELECT USING (
        bucket_id = 'room-files'
        AND auth.uid() IN (
          SELECT rm.user_id FROM room_members rm
          WHERE rm.room_id::text = (storage.foldername(name))[2]
        )
      );
  END IF;
END $$;

-- Drop old overly-permissive INSERT policy and replace with member-only
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'room_files_insert') THEN
    DROP POLICY "room_files_insert" ON storage.objects;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'room_files_insert_members') THEN
    CREATE POLICY "room_files_insert_members" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'room-files'
        AND auth.uid() IN (
          SELECT rm.user_id FROM room_members rm
          WHERE rm.room_id::text = (storage.foldername(name))[2]
        )
      );
  END IF;
END $$;

-- ============================================================
-- Security: RLS for all unprotected tables
-- ============================================================

-- 1. friend_requests: only requester or target can see/modify
ALTER TABLE flinders_friend_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flinders_friend_requests' AND policyname = 'friend_requests_own') THEN
    CREATE POLICY friend_requests_own ON flinders_friend_requests FOR SELECT TO authenticated
      USING (requester_id = auth.uid() OR target_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flinders_friend_requests' AND policyname = 'friend_requests_insert_own') THEN
    CREATE POLICY friend_requests_insert_own ON flinders_friend_requests FOR INSERT TO authenticated
      WITH CHECK (requester_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flinders_friend_requests' AND policyname = 'friend_requests_update_own') THEN
    CREATE POLICY friend_requests_update_own ON flinders_friend_requests FOR UPDATE TO authenticated
      USING (requester_id = auth.uid() OR target_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flinders_friend_requests' AND policyname = 'friend_requests_delete_own') THEN
    CREATE POLICY friend_requests_delete_own ON flinders_friend_requests FOR DELETE TO authenticated
      USING (requester_id = auth.uid() OR target_id = auth.uid());
  END IF;
END $$;

-- 2. admin_announcements: all authenticated can read, only admins can write
ALTER TABLE admin_announcements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_announcements' AND policyname = 'admin_announcements_read') THEN
    CREATE POLICY admin_announcements_read ON admin_announcements FOR SELECT TO authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_announcements' AND policyname = 'admin_announcements_write') THEN
    CREATE POLICY admin_announcements_write ON admin_announcements FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_announcements' AND policyname = 'admin_announcements_update') THEN
    CREATE POLICY admin_announcements_update ON admin_announcements FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_announcements' AND policyname = 'admin_announcements_delete') THEN
    CREATE POLICY admin_announcements_delete ON admin_announcements FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
  END IF;
END $$;

-- 3. deadline_reminders: users can only see/create their own reminders
ALTER TABLE deadline_reminders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deadline_reminders' AND policyname = 'deadline_reminders_own') THEN
    CREATE POLICY deadline_reminders_own ON deadline_reminders FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- 4. flinders_events_cache: public read for authenticated users (cached campus events)
CREATE TABLE IF NOT EXISTS flinders_events_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  title TEXT,
  description TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  location TEXT,
  url TEXT,
  image_url TEXT,
  category TEXT,
  crawled_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE flinders_events_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flinders_events_cache' AND policyname = 'events_cache_read') THEN
    CREATE POLICY events_cache_read ON flinders_events_cache FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;
`;

async function runMigration() {
  // Method 1: Supabase Management API (uses access token + project ref)
  const accessToken = config.supabaseAccessToken;
  const projectRef = config.supabaseProjectRef;

  if (accessToken && projectRef) {
    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ query: MIGRATION_SQL }),
        }
      );

      if (res.ok) {
        console.log('[migrate] Migration applied via Supabase Management API');
        return;
      }

      const text = await res.text();
      console.log('[migrate] Management API response:', res.status, text.slice(0, 200));
    } catch (err) {
      console.log('[migrate] Management API failed:', err.message);
    }
  }

  // Method 2: Direct PostgreSQL connection
  const databaseUrl = config.databaseUrl;
  if (databaseUrl) {
    try {
      const { Client } = require('pg');
      const client = new Client({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      await client.query(MIGRATION_SQL);
      await client.end();
      console.log('[migrate] Migration applied via direct PostgreSQL connection');
      return;
    } catch (err) {
      console.log('[migrate] Direct PostgreSQL failed:', err.message);
    }
  }

  // Method 3: Fallback — verify tables exist
  const url = config.supabase.url;
  const key = config.supabase.serviceRoleKey;
  if (url && key) {
    try {
      const { supabaseAdmin } = require('../services/supabase');
      const { error } = await supabaseAdmin.from('board_posts').select('id').limit(1);
      if (error && error.message.includes('does not exist')) {
        console.log('[migrate] Tables missing — set SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF for auto-migration');
      } else {
        console.log('[migrate] Board tables verified');
      }
    } catch (err) {
      console.log('[migrate] Verification failed:', err.message);
    }
  }
}

module.exports = { runMigration };
