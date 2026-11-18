# Flinders Collab - Project Report
> Last updated: 2026-03-16 (Session 2)
> Author: IT-Yun
> Purpose: Comprehensive reference for any developer or AI tool working on this project

---

## 1. Project Overview

**Flinders Collab** is a team collaboration web app built for Flinders University students. It provides room-based collaboration with real-time chat, task management, event scheduling, file sharing, and campus information.

- **Live URL**: Deployed on Render (auto-deploy from `main` branch)
- **GitHub**: `LEE0718-FAN/flinders-collab`
- **Supabase ref**: `hxofymycvvnouevcfsxn`

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + shadcn/ui (Radix UI) |
| State | Zustand (`authStore.js`) |
| Routing | React Router v6 (Outlet pattern for shared layout) |
| Backend | Express.js + Socket.IO |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Deployment | Render.com (monorepo — server serves built client in production) |

---

## 3. Project Structure

```
Project 1/
├── client/
│   ├── src/
│   │   ├── App.jsx                    # Router, ProtectedLayout (Outlet pattern)
│   │   ├── components/
│   │   │   ├── InteractiveTutorial.jsx # Auto-advancing tutorial system
│   │   │   ├── ProfileDialog.jsx
│   │   │   ├── ReportButton.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── auth/                   # LoginForm, SignupForm
│   │   │   ├── chat/                   # Chat components
│   │   │   ├── files/                  # File upload/download
│   │   │   ├── location/              # Location sharing
│   │   │   ├── room/                   # Room components
│   │   │   ├── schedule/              # Calendar/events
│   │   │   └── ui/                     # shadcn/ui primitives
│   │   ├── hooks/
│   │   │   └── useAuth.js             # Auth hook (login, signup, guest, logout)
│   │   ├── layouts/
│   │   │   └── MainLayout.jsx         # Sidebar + header (persists via Outlet)
│   │   ├── lib/
│   │   │   ├── api.js                  # apiUrl() base URL resolver
│   │   │   ├── api-headers.js          # getAuthHeaders(), parseResponse()
│   │   │   ├── auth-token.js           # localStorage session management
│   │   │   └── socket.js              # Socket.IO client
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── RoomPage.jsx
│   │   │   ├── DeadlinesPage.jsx
│   │   │   ├── BoardPage.jsx
│   │   │   ├── FlindersLifePage.jsx
│   │   │   ├── AdminPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   └── SignupPage.jsx
│   │   ├── services/                   # API call modules
│   │   │   ├── auth.js, rooms.js, events.js, tasks.js
│   │   │   ├── board.js, files.js, chat.js
│   │   │   ├── flinders.js, reports.js
│   │   │   ├── announcements.js, location.js
│   │   └── store/
│   │       └── authStore.js            # Zustand store (user, session)
│   └── dist/                           # Built output (served by Express in prod)
├── server/
│   ├── src/
│   │   ├── index.js                    # Express app entry, Socket.IO init
│   │   ├── config.js                   # Environment config
│   │   ├── routes/                     # Express route files
│   │   │   ├── auth.js, rooms.js, events.js, tasks.js
│   │   │   ├── board.js, files.js, messages.js
│   │   │   ├── flinders.js, reports.js
│   │   │   ├── announcements.js, location.js, admin.js
│   │   ├── controllers/               # Route handlers
│   │   │   ├── authController.js       # signup, login, logout, getMe, guest
│   │   │   ├── roomController.js, eventController.js, taskController.js
│   │   │   ├── boardController.js, fileController.js, messageController.js
│   │   │   ├── announcementController.js, reportController.js
│   │   │   ├── locationController.js, activityController.js
│   │   ├── middleware/
│   │   │   ├── auth.js                 # JWT verification via Supabase
│   │   │   ├── errorHandler.js         # Global error + 404 handler
│   │   │   ├── monitorMiddleware.js    # Request monitoring
│   │   │   └── validate.js            # Input validation
│   │   ├── services/
│   │   │   └── supabase.js            # supabaseAdmin + supabasePublic clients
│   │   ├── sockets/                    # Socket.IO event handlers
│   │   └── utils/
│   │       ├── maintenance.js          # Nightly DB optimization scheduler
│   │       ├── eventCrawler.js         # Flinders event crawler (daily)
│   │       ├── monitor.js             # Health checks, memory alerts
│   │       └── migrate.js            # Auto-run DB migrations on startup
├── supabase/                          # Migration SQL files
├── scripts/                           # Utility scripts
├── render.yaml                        # Render deployment config
└── .env                               # Environment variables (NOT in git)
```

---

## 4. Architecture Decisions

### 4.1 Shared Layout via React Router Outlet
**What**: `App.jsx` uses a `<ProtectedLayout>` component that wraps `<MainLayout>` around `<Outlet />`. All protected pages are nested routes inside this layout.

**Why**: Previously each page individually imported and wrapped `<MainLayout>`, causing the entire sidebar/header to remount on every navigation. This made page transitions extremely slow.

**How it works**:
```jsx
// App.jsx
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <MainLayout>
        <Suspense fallback={...}>
          <Outlet />
        </Suspense>
      </MainLayout>
    </ProtectedRoute>
  );
}

// Routes
<Route element={<ProtectedLayout />}>
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/rooms/:roomId" element={<RoomPage />} />
  ...
</Route>
```

**Impact**: Individual page components must NOT wrap themselves in `<MainLayout>`. They render content only.

### 4.2 Supabase Client Separation
**What**: Two Supabase clients exist in `server/src/services/supabase.js`:
- `supabaseAdmin` — uses `SERVICE_ROLE_KEY` (bypasses RLS, full admin access)
- `supabasePublic` — uses `ANON_KEY` (respects RLS, used for auth sign-in)

**Why**: `supabaseAdmin` has a global `Authorization: Bearer <SERVICE_KEY>` header. Using it for `signInWithPassword()` causes a 500 error because the service key conflicts with the auth flow. User-facing auth operations (login, password sign-in) MUST use `supabasePublic`.

**Rule**: Always use `supabasePublic` for `signInWithPassword()`. Use `supabaseAdmin` for everything else (DB queries, user management, storage).

### 4.3 API URL Resolution
**What**: All frontend service files use `apiUrl('/api/...')` from `@/lib/api.js` to build fetch URLs.

**Why**: In development the API runs on a different port. In production the client is served by the same Express server. `apiUrl()` resolves the correct base URL in both environments.

**Rule**: Every `fetch()` call in `client/src/services/*.js` must wrap the URL with `apiUrl()`.

### 4.4 Session Persistence
**What**: Sessions are stored in `localStorage` (not `sessionStorage`).

**Why**: `sessionStorage` clears when the tab closes, forcing re-login. Users expect to stay logged in across tab closes.

**File**: `client/src/lib/auth-token.js` — `saveSession()`, `loadSession()`, `clearSession()`, `getAccessToken()`

### 4.5 Trust Proxy on Render
**What**: `app.set('trust proxy', 1)` is set in `server/src/index.js` before any middleware.

**Why**: Render uses a reverse proxy. Without trust proxy, all users share the same IP (`127.0.0.1`), causing rate limiters to block ALL users after one person hits the limit.

---

## 5. Account Types & User Model

### 5.1 Account Types
| Type | Description | Flinders Life visible | Signup method |
|------|-------------|----------------------|---------------|
| `flinders` | Flinders University student | Yes | Signup page (requires @flinders.edu.au email) |
| `general` | Other university student | No | Signup page (any email) |
| `tester` | Temporary visitor | Yes | "Try as Tester" button on Login page |

### 5.2 Where account_type lives
- **Supabase Auth**: `user_metadata.account_type`
- **Client session** (localStorage): `session.user.account_type` AND `session.user.user_metadata.account_type`
- **useAuth login()**: Falls back to email domain check if server doesn't return account_type:
  ```js
  const accountType = result.user.account_type ||
    (email.endsWith('@flinders.edu.au') ? 'flinders' : 'general');
  ```

### 5.3 Flinders Life visibility
**Sidebar** (`MainLayout.jsx` line 112):
```js
{(user?.account_type || user?.user_metadata?.account_type || 'flinders') !== 'general' && (
  <NavItem to="/flinders-life" ... />
)}
```
Logic: Show Flinders Life unless account_type is explicitly `'general'`. Default to `'flinders'` if undefined (legacy users).

**Tutorial** (`InteractiveTutorial.jsx`): Same check — skips Flinders Life step entirely for `general` users.

### 5.4 Tester Account Flow
1. User clicks "Try as Tester" on login page
2. Server creates a temporary Supabase Auth user (`tester-{uuid}@guest.test`)
3. Session is stored with `is_tester: true`
4. Tutorial auto-starts for tester
5. On cleanup (exit/tab close/refresh):
   - `POST /api/auth/guest/cleanup` deletes all tester data
   - Session cleared, redirect to login
6. `beforeunload` event uses `fetch keepalive` for tab close cleanup
7. On page load, if `is_tester` session exists, auto-cleanup runs (`App.jsx` lines 40-51)

---

## 6. Interactive Tutorial System

### 6.1 Overview
File: `client/src/components/InteractiveTutorial.jsx`

An auto-advancing guided tour with animated cursor, typing demos, and overlay/spotlight system. Renders globally in `App.jsx` (outside routes).

### 6.2 Tutorial Flow (14 steps)
| Step | Page | What happens |
|------|------|-------------|
| 1 | Dashboard | Welcome message |
| 2 | Dashboard | Spotlight "Create Room" button |
| 3 | Dashboard | Spotlight "Join Room" button |
| 3.5 | Dashboard | Spotlight sidebar |
| 4 | Dashboard | "Let's try it!" message |
| 5 | Dashboard | Open Create Room dialog, type room name + course code, create room via API |
| 6 | Room | Navigate into created room, show invite code |
| 7 | Room | Schedule tab — open Add Event dialog, typing demo, create event via API |
| 8 | Room | Tasks tab — open New Task, typing demo, create task |
| 9 | Room | Chat tab — show explanation |
| 10 | Room | Files tab — show explanation |
| 11 | Deadlines | Navigate to deadlines, spotlight content |
| 12 | Board | Set academic info via API, fill AcademicInfoGate if shown, open New Post dialog, typing demo |
| 13 | Flinders Life | Click through Events / Academic Calendar / Study Rooms tabs (SKIPPED for `general` users) |
| 14 | — | "All done!" — cleanup tutorial room |

### 6.3 Click Blocking
During the tutorial, ALL user interaction is blocked except the 3 control buttons (Skip, Don't show again, Exit).

**Implementation**:
1. **Global CSS injection**: A `<style>` tag disables `pointer-events` on everything:
   ```css
   body > *:not([data-tutorial-root]) { pointer-events: none !important; }
   [data-radix-portal] { pointer-events: none !important; }
   [data-radix-portal] * { pointer-events: none !important; }
   ```
2. **Invisible click blocker div**: `<div className="fixed inset-0" style={{ zIndex: 99998 }} />` catches any remaining clicks.
3. **Tutorial root exempt**: The tutorial wrapper has `data-tutorial-root` attribute and `pointerEvents: 'auto'` so control buttons work.
4. **Programmatic interactions bypass CSS**: `el.dispatchEvent()`, `el.focus()`, `el.click()` all work regardless of `pointer-events: none` because they don't go through DOM hit-testing.

### 6.4 Z-Index Layers
| Layer | Z-Index | Purpose |
|-------|---------|---------|
| Click blocker | 99998 | Invisible full-screen click catcher |
| Dark overlay + spotlight | 99999 | Visual dimming (pointer-events: none) |
| Tooltip | 100000 | Tutorial tooltip card (pointer-events: none) |
| Cursor | 100001 | Animated cursor (pointer-events: none) |
| Control buttons | 100002 | Skip / Don't show / Exit (pointer-events: auto) |

### 6.5 Tutorial Room Cleanup
- Room ID stored in `createdRoomIdRef` and `localStorage['tutorial-room-id']`
- On tutorial end: `safeDeleteTutorialRoom()` retries deletion up to 3 times
- On next app load: leftover cleanup checks `localStorage['tutorial-room-id']` and deletes if found
- On `handleStop`: cleanup runs before setting active to false
- Tutorial completed flag: `localStorage['tutorial-completed']` prevents re-showing

### 6.6 Custom Events
| Event | Purpose |
|-------|---------|
| `rooms-updated` | Trigger sidebar room list refresh |
| `events-updated` | Trigger schedule/calendar refresh |
| `start-interactive-tutorial` | Externally start the tutorial |

### 6.7 Key Technical Details
- **Typing demo**: Uses `nativeInputValueSetter` to set React-controlled input values, fires `input` + `change` events
- **Simulated clicks**: Dispatches full pointer/mouse event chain (pointerdown → mousedown → pointerup → mouseup → click)
- **Skip/Cancel**: `skipRef` resolves current sleep immediately, `cancelRef` aborts the entire flow
- **Skip disabled during room/event creation** to prevent orphaned resources

---

## 7. Completed Features

### Core
- **Auth**: Signup (Flinders/general), login, logout, guest/tester accounts
- **Rooms**: Create, join (invite code), leave, delete, edit name/course
- **Dashboard**: Room cards with member count, course badge, owner/member role
- **Room tabs**: Schedule, Tasks, Chat, Files

### Collaboration
- **Tasks**: Create with multi-member assignment, status (pending/in_progress/completed), priority, due dates
- **Events/Schedule**: Calendar view, CRUD events, categories (study/meeting/social/deadline/other)
- **Chat**: Real-time messaging via Socket.IO, text/images/files
- **Files**: Upload (lecture materials + team submissions), download, delete, categories
- **Location sharing**: Real-time via Socket.IO + REST

### Platform
- **Free Board**: Community board with posts, academic info gate (year/semester)
- **Flinders Life**: 3 tabs — Events (crawled), Academic Calendar, Study Rooms
- **Deadlines**: Aggregated view of all room events
- **Announcements**: Room announcements with unread badges
- **Admin Panel**: User management, reports, user delete
- **Report System**: Any user can submit, admins review

### Infrastructure
- Rate limiting on auth endpoints (login 10/15min, signup 5/15min)
- Nightly DB maintenance scheduler
- Daily Flinders event crawler
- Server health monitoring
- Keep-alive ping for Render free tier
- Auto-migration on startup
- Chunk reload on deployment mismatch

---

## 8. Security Notes

### Applied
- Rate limiting on auth endpoints
- CORS multi-origin support
- Socket.IO room membership verification
- Socket.IO disconnect cleanup
- Task delete permission checks
- `trust proxy` for correct IP detection on Render
- Tester account auto-cleanup on tab close / refresh

### Known Considerations
- Storage SELECT policy may allow any authenticated user to download files from any room
- Password minimum is 6 chars (Supabase default)
- `.env` may exist in git history — keys should be rotated
- Tasks FK references `auth.users` instead of `public.users`

---

## 9. Key Files Quick Reference

| What | File |
|------|------|
| App router | `client/src/App.jsx` |
| Shared layout | `client/src/layouts/MainLayout.jsx` |
| Auth hook | `client/src/hooks/useAuth.js` |
| Auth store | `client/src/store/authStore.js` |
| Session storage | `client/src/lib/auth-token.js` |
| API base URL | `client/src/lib/api.js` |
| Auth headers | `client/src/lib/api-headers.js` |
| Tutorial | `client/src/components/InteractiveTutorial.jsx` |
| Server entry | `server/src/index.js` |
| Auth controller | `server/src/controllers/authController.js` |
| Supabase clients | `server/src/services/supabase.js` |
| Auth middleware | `server/src/middleware/auth.js` |

---

## 10. Development & Deployment

### Local Development
```bash
# Root
npm install

# Client (port 5173)
cd client && npm run dev

# Server (port 3001)
cd server && npm run dev
```

### Deployment
- Push to `main` branch → Render auto-deploys
- Build: `cd client && npm run build` → `client/dist/`
- Server serves `client/dist/` as static files in production
- SPA fallback: non-API routes serve `index.html`

### Environment Variables
Required in `.env` (server):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLIENT_URL` (CORS origin, comma-separated for multiple)
- `PORT` (default 3001)
- `NODE_ENV`

---

## 11. Common Pitfalls & Past Bugs

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Login 500 error | `supabaseAdmin` used for `signInWithPassword` — service key conflicts with auth | Use `supabasePublic` for sign-in |
| "user is not defined" | `SidebarContent` referenced `user` without receiving it as prop | Added `user` prop to `SidebarContent` |
| Slow page navigation | Every page wrapped in its own `<MainLayout>` causing full remount | Moved to shared `ProtectedLayout` with `Outlet` |
| Rate limiter blocks all users | Render reverse proxy — all users share same IP | `app.set('trust proxy', 1)` |
| Session lost on tab close | Using `sessionStorage` | Changed to `localStorage` |
| API calls fail on deployed site | Missing `apiUrl()` wrapper in service files | Wrapped all fetch URLs with `apiUrl()` |
| Tutorial not showing for new signups | `useEffect` dependency `[]` only ran on mount (before login) | Added `user` as dependency |
| Clicks possible during tutorial | Dialog portals (Radix) rendered above click blocker z-index | Global CSS `pointer-events: none !important` on all non-tutorial elements |
| Tutorial room left behind | Cleanup failed silently | Added retry (3 attempts) + localStorage-based leftover cleanup on mount |
| AcademicInfoGate blocks tutorial | New users haven't set year/semester | Tutorial calls `updateAcademicInfo(2, 1)` via API before navigating to board |
| Schedule event appears before typing demo | Event created via API before "let me add an event" message | Moved API call to after typing demo |
| Flinders Life missing for Flinders users | `&&` condition with two undefined checks could fail for legacy users | Changed to single check with `\|\|` fallback: `(account_type \|\| 'flinders') !== 'general'` |
| Tester "Internal server error" | `guestLogin` accessed `loginData.session.access_token` without null check — crashes if session is null | Added `!loginData?.session` check before accessing properties |
| Login crashes on invalid email | No server-side email format validation — Supabase throws unhandled error | Added `@` and `.` check in `authController.login()` |
| Other University accepts flinders email | No cross-check between account type and email domain | Added client-side block: flinders email + general account → error with redirect message |

---

## 12. Changes Made in This Session (2026-03-16)

### 12.1 Tutorial Click Blocking (Global CSS Injection)
**File**: `client/src/components/InteractiveTutorial.jsx`

**Problem**: During typing demos, Radix UI dialog portals rendered above the z-index 99998 click blocker, allowing user clicks.

**Fix**: Injected a global `<style>` tag during tutorial that disables pointer-events on ALL elements:
```css
body > *:not([data-tutorial-root]) { pointer-events: none !important; }
[data-radix-portal] { pointer-events: none !important; }
[data-radix-portal] * { pointer-events: none !important; }
```
- Tutorial wrapper div has `data-tutorial-root` attribute → exempt from blocking
- Programmatic interactions (`el.dispatchEvent()`, `el.focus()`) bypass CSS pointer-events

### 12.2 Tutorial Room Cleanup Hardening
**File**: `client/src/components/InteractiveTutorial.jsx`

**Problem**: Tutorial room sometimes left behind after tutorial ends.

**Fix**:
- `safeDeleteTutorialRoom()` now retries up to 3 times with 500ms delay between attempts
- Leftover cleanup on mount also retries once after 1 second on failure
- Removed name-based room scan (could delete user rooms with same name)
- Cleanup is ID-based only (via `localStorage['tutorial-room-id']`)

### 12.3 Flinders Life Visibility Fix
**File**: `client/src/layouts/MainLayout.jsx` (line 112)

**Before**: `user?.account_type !== 'general' && user?.user_metadata?.account_type !== 'general'`
**After**: `(user?.account_type || user?.user_metadata?.account_type || 'flinders') !== 'general'`

**Why**: Legacy users (signed up before account_type feature) had both fields undefined. The new logic defaults to `'flinders'` if neither is set, so Flinders Life always shows unless explicitly `'general'`.

### 12.4 Tutorial Skips Flinders Life for General Users
**File**: `client/src/components/InteractiveTutorial.jsx`

Added check before step 13:
```js
const acctType = user?.account_type || user?.user_metadata?.account_type || 'flinders';
if (acctType === 'general') { /* skip to "All done!" */ }
```

### 12.5 Login Email Validation
**File**: `server/src/controllers/authController.js`

Added server-side validation before `signInWithPassword`:
```js
if (!email || !password) → 400 "Email and password are required"
if (!email.includes('@') || !email.includes('.')) → 400 "Please enter a valid email address"
```

Client-side (`LoginForm.jsx`): "Internal server error" messages now show friendlier text: "Something went wrong. Please check your email format and try again."

### 12.6 Tester Login Null Check
**File**: `server/src/controllers/authController.js`

**Before**: `if (loginError) { ... }` — didn't catch case where error is null but session is also null
**After**: `if (loginError || !loginData?.session) { ... }` — handles both cases

Added `console.error` log for debugging: `'Guest sign-in failed:', loginError?.message || 'No session returned'`

### 12.7 Other University Flinders Email Block
**File**: `client/src/components/auth/SignupForm.jsx`

Added validation in `handleSubmit`:
```js
if (accountType === 'general' && email.endsWith('@flinders.edu.au')) {
  setError('Flinders email detected! Please go back and sign up as "Flinders Student" instead.');
  return;
}
```

### 12.8 Project Report Created
**File**: `docs/PROJECT_REPORT.md`

Comprehensive reference document covering:
- Tech stack, project structure, architecture decisions
- Account types, auth flow, tester system
- Tutorial system (flow, click blocking, z-index layers, cleanup)
- All completed features
- Security notes
- Key files reference
- Development & deployment guide
- Common pitfalls & past bugs table
