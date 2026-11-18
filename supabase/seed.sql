-- ============================================================
-- Seed Data for Flinders University Team Collaboration App
-- ============================================================

-- Test user
INSERT INTO users (id, university_email, student_id, full_name, major, university)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'demo-project-fixture-01@flinders.edu.au',
    'TEST0001',
    'Demo Student 1',
    'Computer Science',
    'Flinders University'
);

-- Second test user
INSERT INTO users (id, university_email, student_id, full_name, major, university)
VALUES (
    'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    'demo-project-fixture-02@flinders.edu.au',
    'TEST0002',
    'Demo Student 2',
    'Software Engineering',
    'Flinders University'
);

-- Sample room
INSERT INTO rooms (id, name, course_name, description, owner_id, invite_code, semester)
VALUES (
    'c3d4e5f6-a7b8-9012-cdef-123456789012',
    'Software Engineering Project',
    'COMP3000',
    'Team collaboration room for COMP3000 Software Engineering project',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'COMP3000-2026-S1',
    '2026 Semester 1'
);

-- Room memberships
INSERT INTO room_members (room_id, user_id, role)
VALUES
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'owner'),
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'member');

-- Sample events
INSERT INTO events (id, room_id, title, description, location_name, start_time, end_time, created_by, enable_location_sharing)
VALUES
    (
        'd4e5f6a7-b8c9-0123-defa-234567890123',
        'c3d4e5f6-a7b8-9012-cdef-123456789012',
        'Sprint Planning Meeting',
        'Weekly sprint planning for the project',
        'Flinders University Library Room 2.01',
        '2026-03-15 10:00:00+10:30',
        '2026-03-15 11:00:00+10:30',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        true
    ),
    (
        'e5f6a7b8-c9d0-1234-efab-345678901234',
        'c3d4e5f6-a7b8-9012-cdef-123456789012',
        'Code Review Session',
        'Review pull requests and merge changes',
        'Online - Discord',
        '2026-03-17 14:00:00+10:30',
        '2026-03-17 15:30:00+10:30',
        'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        false
    ),
    (
        'f6a7b8c9-d0e1-2345-fabc-456789012345',
        'c3d4e5f6-a7b8-9012-cdef-123456789012',
        'Final Presentation Prep',
        'Prepare slides and demo for final presentation',
        'Flinders University Tonsley Building',
        '2026-03-20 09:00:00+10:30',
        '2026-03-20 12:00:00+10:30',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        true
    );

-- Sample message
INSERT INTO messages (room_id, user_id, content, message_type)
VALUES
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Welcome to the Software Engineering Project room!', 'system'),
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Hey everyone, looking forward to working together!', 'text');
