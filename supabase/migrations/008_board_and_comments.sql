-- ============================================================
-- 008: Board (자유 게시판), Comments, User Academic Info
-- ============================================================

-- 1. Add academic info columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS year_level INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS semester INTEGER;

-- 2. Board posts table
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

-- 3. Board post participation (참여/불참)
CREATE TABLE IF NOT EXISTS board_participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('join', 'pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_participations_post ON board_participations(post_id);

-- 4. Comments table (generic — can attach to board posts or other entities)
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

-- 5. RLS policies
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Board posts: any authenticated user can read
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_select') THEN
  CREATE POLICY "board_posts_select" ON board_posts FOR SELECT
    USING (auth.uid() IS NOT NULL);
END IF;
END $$;

-- Board posts: authenticated users can create
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_insert') THEN
  CREATE POLICY "board_posts_insert" ON board_posts FOR INSERT
    WITH CHECK (auth.uid() = author_id);
END IF;
END $$;

-- Board posts: only author can update
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_update') THEN
  CREATE POLICY "board_posts_update" ON board_posts FOR UPDATE
    USING (auth.uid() = author_id);
END IF;
END $$;

-- Board posts: only author can delete
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_posts_delete') THEN
  CREATE POLICY "board_posts_delete" ON board_posts FOR DELETE
    USING (auth.uid() = author_id);
END IF;
END $$;

-- Participations: any authenticated user can read
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_participations_select') THEN
  CREATE POLICY "board_participations_select" ON board_participations FOR SELECT
    USING (auth.uid() IS NOT NULL);
END IF;
END $$;

-- Participations: authenticated users can toggle their own
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_participations_insert') THEN
  CREATE POLICY "board_participations_insert" ON board_participations FOR INSERT
    WITH CHECK (auth.uid() = user_id);
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_participations_update') THEN
  CREATE POLICY "board_participations_update" ON board_participations FOR UPDATE
    USING (auth.uid() = user_id);
END IF;
END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'board_participations_delete') THEN
  CREATE POLICY "board_participations_delete" ON board_participations FOR DELETE
    USING (auth.uid() = user_id);
END IF;
END $$;

-- Comments: any authenticated user can read
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_select') THEN
  CREATE POLICY "comments_select" ON comments FOR SELECT
    USING (auth.uid() IS NOT NULL);
END IF;
END $$;

-- Comments: authenticated users can create
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_insert') THEN
  CREATE POLICY "comments_insert" ON comments FOR INSERT
    WITH CHECK (auth.uid() = author_id);
END IF;
END $$;

-- Comments: only author can delete
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_delete') THEN
  CREATE POLICY "comments_delete" ON comments FOR DELETE
    USING (auth.uid() = author_id);
END IF;
END $$;
