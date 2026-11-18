-- ============================================================
-- 012: Timetable — Course Topics + Student Timetable
-- ============================================================

-- 1. Flinders topics (crawled from handbook.flinders.edu.au)
CREATE TABLE IF NOT EXISTS flinders_topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_code TEXT NOT NULL,               -- e.g. COMP2711
    title TEXT NOT NULL,                     -- e.g. Data Structures and Algorithms
    description TEXT,
    credit_points TEXT,                      -- e.g. 4.5 Units
    level TEXT,                              -- e.g. Year 2 undergraduate
    school TEXT,                             -- e.g. College of Science and Engineering
    academic_org TEXT,                       -- e.g. Computing and Mathematical Sciences
    year INT NOT NULL DEFAULT 2026,
    semesters TEXT[],                        -- e.g. {S1,S2}
    campuses TEXT[],                         -- e.g. {"Bedford Park"}
    delivery_modes TEXT[],                   -- e.g. {"In person"}
    prerequisites TEXT,
    offerings JSONB,                        -- [{semester, campus, mode, display_name}]
    handbook_url TEXT,
    crawled_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(topic_code, year)
);

-- Index for search
CREATE INDEX IF NOT EXISTS idx_flinders_topics_code ON flinders_topics (topic_code);
CREATE INDEX IF NOT EXISTS idx_flinders_topics_title ON flinders_topics USING gin (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_flinders_topics_year ON flinders_topics (year);

-- 2. User timetable entries (student's selected topics + class times)
CREATE TABLE IF NOT EXISTS user_timetable (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES flinders_topics(id) ON DELETE CASCADE,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,  -- auto-created chat room
    day_of_week INT,                         -- 0=Mon, 1=Tue, ..., 4=Fri
    start_time TIME,                         -- e.g. 09:00
    end_time TIME,                           -- e.g. 11:00
    class_type TEXT,                         -- lecture, tutorial, practical, workshop
    location TEXT,                           -- e.g. Room 101, Engineering Building
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, topic_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_user_timetable_user ON user_timetable (user_id);
CREATE INDEX IF NOT EXISTS idx_user_timetable_topic ON user_timetable (topic_id);

-- 3. Topic rooms — links a topic to its auto-created chat room (one room per topic)
CREATE TABLE IF NOT EXISTS topic_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL REFERENCES flinders_topics(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(topic_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_rooms_topic ON topic_rooms (topic_id);

-- 4. RLS
ALTER TABLE flinders_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_rooms ENABLE ROW LEVEL SECURITY;

-- Everyone can read topics
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flinders_topics' AND policyname = 'topics_select_all') THEN
    CREATE POLICY topics_select_all ON flinders_topics FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Users can manage their own timetable
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_timetable' AND policyname = 'timetable_own') THEN
    CREATE POLICY timetable_own ON user_timetable FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Everyone can read topic rooms
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'topic_rooms' AND policyname = 'topic_rooms_select_all') THEN
    CREATE POLICY topic_rooms_select_all ON topic_rooms FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
