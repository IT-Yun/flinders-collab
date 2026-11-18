-- Tasks / Assignments table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast room-level queries
CREATE INDEX IF NOT EXISTS idx_tasks_room_id ON tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);

-- RLS policies
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room members can view tasks"
  ON tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = tasks.room_id
        AND room_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Room members can insert tasks"
  ON tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = tasks.room_id
        AND room_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Task assignee or admin can update tasks"
  ON tasks FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = tasks.room_id
        AND room_members.user_id = auth.uid()
        AND room_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admin or creator can delete tasks"
  ON tasks FOR DELETE
  USING (
    assigned_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM room_members
      WHERE room_members.room_id = tasks.room_id
        AND room_members.user_id = auth.uid()
        AND room_members.role IN ('owner', 'admin')
    )
  );
