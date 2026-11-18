-- Reset all application data while keeping the schema.
-- Run this in Supabase SQL Editor when you want a clean start.

TRUNCATE TABLE
  location_sessions,
  files,
  messages,
  events,
  room_members,
  rooms,
  users
RESTART IDENTITY CASCADE;

-- Optional: remove auth users created through Supabase Auth manually in the dashboard
-- if you also want a completely empty authentication state.
