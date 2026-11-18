-- ============================================================
-- Flinders University Team Collaboration App - Initial Schema
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_email TEXT UNIQUE NOT NULL
        CHECK (university_email LIKE '%@flinders.edu.au'),
    student_id TEXT UNIQUE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    major TEXT,
    university TEXT DEFAULT 'Flinders University',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Rooms table
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    course_name TEXT,
    description TEXT,
    owner_id UUID REFERENCES users(id),
    invite_code TEXT UNIQUE NOT NULL,
    semester TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Room members table
CREATE TABLE room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(room_id, user_id)
);

-- Events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    location_name TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id),
    enable_location_sharing BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text'
        CHECK (message_type IN ('text', 'system', 'file')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Files table
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id),
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Location sessions table
CREATE TABLE location_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status TEXT DEFAULT 'sharing'
        CHECK (status IN ('sharing', 'on_the_way', 'arrived', 'late', 'stopped')),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(event_id, user_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX idx_room_members_user_id ON room_members(user_id);
CREATE INDEX idx_room_members_room_id ON room_members(room_id);
CREATE INDEX idx_events_room_start ON events(room_id, start_time);
CREATE INDEX idx_messages_room_created ON messages(room_id, created_at DESC);
CREATE INDEX idx_files_room_id ON files(room_id);
CREATE INDEX idx_files_room_created ON files(room_id, created_at DESC);
CREATE INDEX idx_location_sessions_event_id ON location_sessions(event_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_sessions ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_select_shared_rooms" ON users
    FOR SELECT USING (
        id IN (
            SELECT rm.user_id FROM room_members rm
            WHERE rm.room_id IN (
                SELECT rm2.room_id FROM room_members rm2
                WHERE rm2.user_id = auth.uid()
            )
        )
    );

CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Rooms policies
CREATE POLICY "rooms_select_members" ON rooms
    FOR SELECT USING (
        id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "rooms_insert_authenticated" ON rooms
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "rooms_update_owner" ON rooms
    FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "rooms_delete_owner" ON rooms
    FOR DELETE USING (owner_id = auth.uid());

-- Room members policies
CREATE POLICY "room_members_select" ON room_members
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "room_members_insert" ON room_members
    FOR INSERT WITH CHECK (
        -- Users can join rooms, or room owners/admins can add members
        user_id = auth.uid()
        OR room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "room_members_delete" ON room_members
    FOR DELETE USING (
        -- Members can leave, or owners/admins can remove
        user_id = auth.uid()
        OR room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Events policies
CREATE POLICY "events_select_members" ON events
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "events_insert_members" ON events
    FOR INSERT WITH CHECK (
        room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "events_update_members" ON events
    FOR UPDATE USING (
        room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "events_delete_creator" ON events
    FOR DELETE USING (created_by = auth.uid());

-- Messages policies
CREATE POLICY "messages_select_members" ON messages
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "messages_insert_members" ON messages
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );

-- Files policies
CREATE POLICY "files_select_members" ON files
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "files_insert_members" ON files
    FOR INSERT WITH CHECK (
        uploaded_by = auth.uid()
        AND room_id IN (
            SELECT room_id FROM room_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "files_delete_uploader" ON files
    FOR DELETE USING (uploaded_by = auth.uid());

-- Location sessions policies
CREATE POLICY "location_sessions_select_event_members" ON location_sessions
    FOR SELECT USING (
        event_id IN (
            SELECT e.id FROM events e
            JOIN room_members rm ON rm.room_id = e.room_id
            WHERE rm.user_id = auth.uid()
        )
    );

CREATE POLICY "location_sessions_insert_own" ON location_sessions
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND event_id IN (
            SELECT e.id FROM events e
            JOIN room_members rm ON rm.room_id = e.room_id
            WHERE rm.user_id = auth.uid()
        )
    );

CREATE POLICY "location_sessions_update_own" ON location_sessions
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "location_sessions_delete_own" ON location_sessions
    FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('room-files', 'room-files', false);

-- Storage policy: authenticated users can upload files
CREATE POLICY "room_files_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'room-files'
        AND auth.uid() IS NOT NULL
    );

-- Storage policy: room members can download files
CREATE POLICY "room_files_select" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'room-files'
        AND auth.uid() IS NOT NULL
    );

-- Storage policy: uploaders can delete their own files
CREATE POLICY "room_files_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'room-files'
        AND auth.uid() = owner
    );
