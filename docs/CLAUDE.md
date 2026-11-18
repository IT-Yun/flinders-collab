# Flinders University Team Collaboration App

## Project Specification

This is a team collaboration application designed for students at **Flinders University**. The app enables university students to form project teams, communicate in real-time, share files, schedule events, and optionally share live locations during meetups.

## Core Features

### 1. User Management
- University email authentication (`@flinders.edu.au` domain enforced)
- Student profiles with name, student ID, major, and avatar
- Flinders University as the default institution

### 2. Rooms (Team Spaces)
- Create and join rooms via unique invite codes
- Rooms are associated with courses (e.g., COMP3000) and semesters
- Role-based membership: owner, admin, member
- Room owners can manage members and settings

### 3. Real-time Messaging
- Text messages within rooms
- System messages for room events
- File message type for shared attachments
- Messages indexed by room and timestamp for efficient loading

### 4. Events & Scheduling
- Create events with title, description, location, and time range
- Events are scoped to rooms
- Optional live location sharing per event

### 5. File Sharing
- Upload and share files within rooms
- Files stored in Supabase Storage (`room-files` bucket)
- File metadata tracked (name, URL, type, size, category)
- Only uploaders can delete their own files

### 6. Live Location Sharing
- Opt-in location sharing during events
- Status tracking: sharing, on_the_way, arrived, late, stopped
- Scoped to specific events — not always-on
- Only visible to room members participating in the event

## Tech Stack

- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth with email domain restriction
- **Storage**: Supabase Storage for file uploads
- **Security**: Row Level Security (RLS) policies on all tables

## Database Schema

### Tables
- `users` — Student profiles with Flinders email constraint
- `rooms` — Team spaces with course association and invite codes
- `room_members` — Many-to-many room membership with roles
- `events` — Scheduled events within rooms
- `messages` — Chat messages within rooms
- `files` — File metadata for uploads within rooms
- `location_sessions` — Live location data scoped to events

### Key Constraints
- All UUIDs generated via `uuid_generate_v4()`
- All timestamps use `TIMESTAMPTZ`
- Foreign keys use `ON DELETE CASCADE` for dependent data
- Email domain enforced via `CHECK` constraint at database level
- Room membership uniqueness enforced via `UNIQUE(room_id, user_id)`

### Security Model
- RLS enabled on all tables
- Only authenticated users with room membership can access room data
- Users can only modify their own data (profiles, messages, files, locations)
- Room owners/admins have elevated permissions for member management
- Location data strictly scoped to specific events and participants

## File Structure

```
supabase/
  migrations/
    001_initial_schema.sql    — Full database schema, indexes, RLS policies, storage config
  seed.sql                    — Sample data for development and testing
docs/
  CLAUDE.md                   — This file (project documentation)
```
