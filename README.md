# Flinders Collab — University Team Collaboration App

A full-stack collaboration platform for Flinders University students: join rooms with your classmates, chat in real time, share files, coordinate timetables and deadlines, and get push notifications for what matters.

Ships as a **web app, iOS app, and Android app** from a single React codebase via Capacitor.

🔗 **Live:** https://flinders-collab-id3a.onrender.com  *(private beta — invite only)*
📐 **Architecture deep-dive:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [한국어](./ARCHITECTURE.ko.md)

## Tech stack

**Frontend** — React 18, Vite, Tailwind CSS, Radix UI, Supabase JS client
**Mobile wrapper** — Capacitor 8 (iOS + Android native builds from the web codebase)
**Backend** — Node.js, Express 4, Socket.IO, Supabase (Postgres + Auth + Storage)
**Infra / security** — Helmet, `express-rate-limit`, `express-validator`, CORS, compression, Web Push (VAPID), Multer uploads
**Deploy** — Render (backend + static build), Supabase (managed Postgres + Auth + Storage)
**Experimental** — Flutter companion client (`flutter_app/`)

## Features

- **Auth** — Supabase email/password with password reset flow and OTP brute-force protection
- **Rooms** — create or join team rooms by invite code; per-room roles
- **Real-time chat** — Socket.IO messaging with typing indicators and read state
- **Announcements & board** — threaded discussion board and pinned room announcements
- **Timetable & deadlines** — personal class schedule with upcoming-deadline view
- **Events** — shared team calendar per room
- **Tasks** — per-room task list with assignees and status
- **File sharing** — uploads backed by Supabase Storage (with storage lockdown policies)
- **Location** — campus-aware features across Bedford Park, City, and Tonsley
- **Push notifications** — Web Push via VAPID for messages and key events
- **Onboarding tours** — per-sidebar interactive tours for first-time users
- **Admin panel** — moderation, member management, reports queue
- **Reporting** — in-app reporting for content / users

## Architecture

For the full picture — system diagram, request lifecycle, real-time message flow, data model (ER diagram), security layers, and the design trade-offs behind them — see **[ARCHITECTURE.md](./ARCHITECTURE.md)** ([한국어 버전](./ARCHITECTURE.ko.md)).

```
client/                   # React + Vite web app (also wrapped in Capacitor)
  src/
    pages/                # Dashboard, Room, Messages, Board, Timetable,
                          # Deadlines, FlindersLife, FlindersSocial, Admin,
                          # Settings, Login, Signup, ResetPassword
    components/           # auth, chat, room, schedule, files, location,
                          # settings, ui/, OnboardingTour, InteractiveTutorial,
                          # ProfileDialog, AvatarCropDialog, InstallBanner, ...
    layouts/ hooks/ store/ services/ lib/
  ios/                    # Capacitor-generated Xcode project
  android/                # Capacitor-generated Android Studio project

server/                   # Express API
  src/
    routes/               # auth, rooms, messages, events, tasks, board,
                          # announcements, timetable, files, push, location,
                          # reports, admin, flinders
    controllers/          # matching controller per route
    sockets/              # socket.io handlers (chat)
    middleware/           # auth guard, validation, rate limiting, error handling
    services/             # business logic + Supabase data access
    config.js             # env-driven config
    index.js              # app entry

supabase/
  migrations/             # 13 migrations (schema evolution)
  seed.sql, reset_app_data.sql

flutter_app/              # companion Flutter client (experimental)
scripts/                  # maintenance scripts
render.yaml               # Render deployment config
```

## Running locally

### Prerequisites
- Node.js 20+
- A Supabase project
- (Optional) Xcode / Android Studio to build native apps

### Backend

```bash
cd server
cp .env.example .env          # fill in Supabase + VAPID + JWT values
npm install
npm run dev                   # http://localhost:3000
```

Run the files in `supabase/migrations/` against your Supabase project to set up the schema.

### Web client

```bash
cd client
cp .env.example .env          # fill in VITE_SUPABASE_URL + ANON_KEY + API base URL
npm install
npm run dev                   # http://localhost:5173
```

### Mobile builds (iOS / Android)

```bash
cd client
npm run ios:prepare           # build + sync Capacitor -> iOS project
npm run ios:open              # opens Xcode

npm run android:prepare
npm run android:open          # opens Android Studio
```

## Security

- All secrets live in environment variables; nothing is hardcoded
- `.env` is `.gitignore`d; only `.env.example` with placeholders is tracked
- Express hardened with Helmet, rate limiting, and input validation on every route
- Supabase tables protected with **Row-Level Security policies**; Storage buckets locked down
- Auth flow includes password-reset and OTP brute-force protection
- Web Push keys (VAPID) are server-side only

## Status

Active development; in private beta with Flinders University students. Recent work has focused on security hardening (RLS, storage policies, OTP protection) and onboarding / first-use experience.

## License

Personal / portfolio project. Not for redistribution.
