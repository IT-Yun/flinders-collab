# Work Summary — 2026-03-31

## Overview
This session added a full friend system, Instagram-style DM page, timetable chat integration, real-time unread badges, and friend management features to the Flinders University collaboration app.

---

## Features Implemented

### 1. Timetable Chat (click-to-chat)
- **File**: `client/src/pages/TimetablePage.jsx`
- Clicking a timetable block opens a chat popup (not edit modal)
- Editing timetable entries is only accessible from the Courses view
- Chat popup enlarged: `sm:max-w-2xl/3xl`, `h-[90vh] sm:h-[82vh]`
- Members panel toggle (show/hide) with friend add/DM buttons

### 2. Auto-Join Topic Rooms + Canonical Room Resolution
- **Files**: `server/src/sockets/chatHandler.js`, `server/src/controllers/timetableController.js`, `server/src/routes/timetable.js`
- `POST /api/timetable/room/:roomId/ensure-member` — auto-joins user if they have the topic in their timetable
- Socket.IO `chat:join` handler also auto-joins topic rooms for users with matching timetable entries
- Fixes "Not a room member" error when opening topic chats
- **Canonical room resolution**: A `.single()` vs `.maybeSingle()` bug caused duplicate rooms per topic. Fixed by always resolving the oldest (canonical) room for each topic_id. `ensure-member` returns `canonicalRoomId` so the client uses the correct room. `user_timetable.room_id` is auto-corrected to the canonical room.

### 3. Friend System
- **Server**: `server/src/routes/flinders.js`
- **Client service**: `client/src/services/flinders.js`
- **DB table**: `flinders_friend_requests` with columns: `id`, `requester_id`, `target_id`, `message`, `status`, `pair_key`, `direct_room_id`, `location_visible_to`, `created_at`, `responded_at`
- Status values: `pending`, `accepted`, `declined`, `blocked`
- `pair_key` = sorted user IDs joined by `:` for deduplication
- Friend request with optional message (160 char limit), confirmation dialog
- Accept/decline friend requests
- On accept, creates a DM room via `getOrCreateDirectRoom()` with `room_type: 'direct'`

### 4. Friend Management (Delete, Block, Location)
- **Endpoints**:
  - `DELETE /api/flinders/friend-requests/:requestId` — remove friend + cleanup DM room
  - `POST /api/flinders/friend-requests/:requestId/block` — block user, cleanup DM
  - `PATCH /api/flinders/friend-requests/:requestId/location-visibility` — toggle `location_visible_to` JSONB array
- **Client**: `removeFriend()`, `blockFriend()`, `toggleFriendLocationVisibility()` in `flinders.js`
- Blocked users are filtered out of friend list via `.not('status', 'eq', 'blocked')`
- `location_visible_to` is a JSONB array of user IDs who can see the friend's location on Where Are You

### 5. Instagram-Style Messages Page
- **File**: `client/src/pages/MessagesPage.jsx`
- **Route**: `/messages` in `client/src/App.jsx`
- Left panel: friend list with search, incoming requests, last message preview
- Right panel: chat (embedded ChatPanel) or friend profile
- Mobile responsive: list ↔ chat toggle
- Friends sorted by most recent message
- Time formatting: now, Xm, Xh, Xd, or date

### 6. Friend Profile Panel
- Shows: name, avatar, email, major, year level, friendship date, request message
- Location sharing toggle (per-friend)
- Send Message, Remove Friend, Block User buttons
- Context menu on friend list items (hover → three dots)

### 7. Real-Time Unread Badges
- **File**: `client/src/layouts/MainLayout.jsx`
- Sidebar Messages item shows badge: `dmUnreadCount + dmMessageBadge`
- `dmUnreadCount`: computed from `roomBadgeCounts` for direct rooms
- `dmMessageBadge`: Socket.IO listener joins DM rooms, increments on `chat:message` when not on `/messages`
- **Timetable badges**: `client/src/pages/TimetablePage.jsx`
  - Socket.IO joins all topic rooms, tracks `chat:message` for unread counts
  - Badges shown on legend buttons and calendar blocks
  - Clears when popup opens for that topic

### 8. Sidebar Changes
- **File**: `client/src/layouts/MainLayout.jsx`
- Reordered: Timetable Buddy → Where are you → Flinders Life → Messages
- Hidden from sidebar: `room_type === 'topic'` and `room_type === 'direct'` rooms
- Only regular `group` rooms appear in sidebar room list

### 9. ChatPanel Embedded Mode
- **File**: `client/src/components/chat/ChatPanel.jsx`
- `embedded` prop (default false)
- When `embedded=true`: uses `h-full flex flex-col` (no fixed height), hides gradient header
- Used by both TimetablePage popup and MessagesPage

### 10. Calendar → Timetable Rename
- Button label changed from "Calendar" to "Timetable" in TimetablePage

---

## Database Migrations
- **File**: `server/src/utils/migrate.js`
- Added: `ALTER TABLE flinders_friend_requests ADD COLUMN IF NOT EXISTS location_visible_to JSONB NOT NULL DEFAULT '[]'::jsonb;`

---

## Room Types
The `rooms` table has a `room_type` column:
- `group` — regular group chat rooms (shown in sidebar)
- `topic` — auto-created for timetable topics (hidden from sidebar, accessed via timetable)
- `direct` — 1-on-1 DM rooms between friends (hidden from sidebar, accessed via Messages page)

DM rooms use `direct_pair_key` for deduplication (same format as `pair_key` in friend requests).

---

## Key Data Flow

### Adding a Friend
1. User clicks "Add Friend" on a course member in TimetablePage members panel
2. Confirmation dialog with optional message appears
3. `POST /api/flinders/friend-requests` creates record with `status: 'pending'`
4. Target user sees request in Messages page incoming section
5. On accept: `POST /api/flinders/friend-requests/:id/respond` → creates DM room → sets `direct_room_id`
6. Both users see each other in Messages friend list

### Location Visibility
1. Friend toggles "Share my location" in profile panel or context menu
2. `PATCH /api/flinders/friend-requests/:id/location-visibility` updates `location_visible_to` array
3. Where Are You page checks this array to show/hide friend location

---

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Supabase (PostgreSQL + RLS + Auth)
- **Real-time**: Socket.IO
- **Deployment**: Render (auto-deploy on push to main)
- **PWA**: Service worker, manifest, push notifications

---

## Git Commits (this session)
1. `c86e6a7` — open topic chat as popup instead of navigating away
2. `7858138` — add timetable entry editing and topic room leave button
3. `54c1452` — topic rooms show direct group chat with no tabs
4. `cf8adeb` — simplify topic rooms to chat-only layout
5. `e5bbe5e` — add calendar drag-to-create, popular times, and multi-block support
6. `af63e1f` — add Instagram-style Messages page, friend system in timetable, and real-time DM badges
7. `2973fc3` — reorder sidebar: Timetable Buddy → Where are you → Flinders Life → Messages
8. `fcf0ce9` — hide topic rooms from sidebar, bigger chat popup, friend request dialog with message, embedded ChatPanel mode
9. `30bc722` — add real-time unread badges on timetable topic buttons and calendar blocks
10. `7138f1d` — add friend management: profile panel, delete/block, location visibility toggle
11. `4e8c84e` — fix duplicate topic room creation by using maybeSingle instead of single
12. `1314633` — fix Not a room member error by resolving canonical topic room

---

## Known Bug Fixed: Duplicate Topic Rooms
- **Root cause**: `addToTimetable` in `timetableController.js` used Supabase `.single()` to check for existing topic rooms. `.single()` returns an error (not null) when no rows match, so the check always failed → new room created every time.
- **Fix**: Changed `.single()` → `.maybeSingle()` in 3 places. Added canonical room resolution logic so even existing duplicate rooms are handled gracefully — always uses the oldest room per topic_id.
- **Affected files**: `server/src/controllers/timetableController.js`, `server/src/sockets/chatHandler.js`, `client/src/pages/TimetablePage.jsx`
