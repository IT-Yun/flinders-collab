# Deployment Plan

Date: 2026-03-11

## Recommended Stack

- Frontend hosting: Vercel
- Backend hosting: Render, Railway, or Fly.io
- Database/Auth/Storage: Supabase
- Mobile wrapper: Capacitor
- Android distribution: Google Play internal testing -> production
- iOS distribution: TestFlight -> App Store

## Why This Stack

- The current frontend is already a Vite web app, so Vercel fits well
- The current backend is an Express + Socket.IO server, so it needs a host that supports persistent Node processes and WebSockets
- The project already uses Supabase patterns for database/auth/storage
- Capacitor is the fastest path from this web codebase to Android/iOS packages

## Order Of Work

### 1. Fix production blockers

- Make signup create both Auth user and app profile reliably
- Unify room join API
- Unify event payloads and routes
- Unify file routes and field names
- Add production API base URL and socket URL configuration

Exit condition:
- Core flows work locally end-to-end

### 2. Deploy web stack

- Create Supabase production project
- Apply migrations and seed only if appropriate
- Deploy backend with production environment variables
- Deploy frontend to Vercel with production environment variables
- Update backend CORS to the real frontend domain

Exit condition:
- Public web URL works for login, rooms, events, files, chat, and location

### 3. Add mobile packaging

- Install Capacitor
- Generate Android and iOS projects
- Set app id, app name, icons, splash assets
- Configure geolocation and network permissions
- Point the mobile app to production API and socket URLs

Exit condition:
- App launches on a real Android device and a real iPhone

### 4. Test on devices

- Auth
- Room create and join
- Event create and delete
- File upload and delete
- Chat over mobile networks
- Location sharing with permission prompts

Exit condition:
- No blocker remains in device testing

### 5. Store release

- Android: internal testing, closed testing, then production
- iOS: TestFlight, then App Store review

## Immediate Next Step

- Use `docs/deployment-readiness-audit.md` as the source of truth
- Fix the API and data contract mismatches before attempting Vercel or Capacitor deployment
