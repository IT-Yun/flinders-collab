# Clean Start Guide

If the app still shows rooms, members, or events after demo removal, that data is already in the database.

## Why this happens

- The app now reads real data only
- Earlier setup included sample seed records
- Those records remain in Supabase until you delete them

## Clean start

1. Open Supabase SQL Editor
2. Run:

```sql
-- file: supabase/reset_app_data.sql
TRUNCATE TABLE
  location_sessions,
  files,
  messages,
  events,
  room_members,
  rooms,
  users
RESTART IDENTITY CASCADE;
```

3. In Supabase Auth dashboard, delete any old test users if you want a completely empty auth state
4. Restart the backend
5. Rebuild and rerun the mobile app

## Files

- Reset script: `./supabase/reset_app_data.sql`
- Empty seed file: `./supabase/seed.sql`

## After reset

The app should start with:

- no rooms
- no members
- no events
- no files

Then you can create a real account using a `@flinders.edu.au` email and all new data will be stored in the database.
