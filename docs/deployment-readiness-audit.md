# Deployment Readiness Audit

Date: 2026-03-11

## Summary

- Web frontend build: succeeds
- Current web deployment readiness: not ready for production
- Current Android/iOS app deployment readiness: not ready
- Main reason: frontend and backend contracts are inconsistent, and production/mobile hosting paths are not wired

## Verified

- `npm run build --workspace=client` completes successfully
- The client produces a production build in `client/dist`
- A process is already listening on port `3001`, so a clean backend boot check was not completed in this audit

## Critical Blockers

### 1. Signup flow bypasses the backend profile creation path

- Frontend signup uses Supabase Auth directly in `client/src/hooks/useAuth.js`
- Backend profile creation into the `users` table only exists in `server/src/controllers/authController.js`
- Backend room, file, message, and relation logic assumes `users.id` exists in the database

Impact:
- A newly signed up user may exist in Supabase Auth but not in the app `users` table
- Room creation and other features that rely on the `users` table can fail or behave inconsistently

Evidence:
- `client/src/hooks/useAuth.js`
- `server/src/controllers/authController.js`

### 2. Join room API is incompatible

- Frontend sends `POST /api/rooms/join` with only `invite_code`
- Backend exposes `POST /api/rooms/:roomId/join`

Impact:
- Join room from the dashboard cannot work as implemented

Evidence:
- `client/src/services/rooms.js`
- `server/src/routes/rooms.js`

### 3. Event creation payload does not match backend validation

- Frontend sends `location` and omits `end_time`
- Backend expects `location_name`, `start_time`, and `end_time`

Impact:
- Creating an event should fail validation in production

Evidence:
- `client/src/components/schedule/EventForm.jsx`
- `server/src/utils/validators.js`
- `server/src/controllers/eventController.js`

### 4. Event update and delete routes are incompatible

- Frontend uses `/api/rooms/:roomId/events/:eventId` with `PUT` and `DELETE`
- Backend exposes `PATCH /api/events/:eventId` and `DELETE /api/events/:eventId`

Impact:
- Event update/delete from the UI cannot work as implemented

Evidence:
- `client/src/services/events.js`
- `server/src/routes/events.js`

### 5. File delete route and file field mapping are incompatible

- Frontend deletes with `/api/rooms/:roomId/files/:fileId`
- Backend exposes `DELETE /api/files/:fileId`
- Frontend expects fields like `file.url` and `file.user_id`
- Backend stores/returns `file_url` and `uploaded_by`

Impact:
- File download button can disappear
- File delete button visibility and delete requests can fail

Evidence:
- `client/src/services/files.js`
- `client/src/components/files/FileList.jsx`
- `server/src/routes/files.js`
- `server/src/controllers/fileController.js`

### 6. Room create payload uses a different field name

- Frontend sends `course_code`
- Backend expects `course_name`

Impact:
- Course data is silently dropped even if room creation succeeds

Evidence:
- `client/src/components/room/CreateRoomDialog.jsx`
- `server/src/controllers/roomController.js`

## Production Deployment Gaps

### 7. Frontend assumes same-origin `/api` in production

- All frontend service calls use relative `/api/...`
- Vite proxy only works in local development
- There is no production API base URL strategy in the client

Impact:
- If the frontend is deployed to Vercel and the backend is hosted elsewhere, API requests will hit the Vercel domain instead of the backend unless rewrites or env-based URLs are added

Evidence:
- `client/vite.config.js`
- `client/src/services/*.js`

### 8. Socket connection needs a production URL

- Socket client uses `VITE_SOCKET_URL` or falls back to an empty string
- Empty string only works for same-origin hosting

Impact:
- Real-time chat and live location will fail unless a public socket backend URL is configured

Evidence:
- `client/src/lib/socket.js`

### 9. Backend deployment target is still required

- The backend is Express + Socket.IO
- Supabase covers Postgres/Auth/Storage, but it does not automatically host this Node server

Impact:
- Vercel + Supabase alone is not enough for the current architecture

Required:
- Host the Node backend on a platform that supports long-running processes and WebSockets

Evidence:
- `server/src/index.js`
- `server/src/sockets/index.js`

## Mobile Deployment Gaps

### 10. No Android/iOS wrapper exists yet

- No Capacitor config
- No native Android or iOS project folders
- No Expo or React Native app

Impact:
- This repository cannot currently produce Play Store or App Store builds

### 11. Mobile-specific runtime assumptions need validation

- Geolocation uses browser APIs directly
- Clipboard uses browser APIs directly
- Maps rely on `react-leaflet`
- Real-time features require HTTPS/WSS and mobile permission handling

Impact:
- Even after adding Capacitor, these flows need device testing before store submission

Evidence:
- `client/src/components/location/LocationToggle.jsx`
- `client/src/pages/RoomPage.jsx`
- `client/src/components/location/LocationMap.jsx`
- `client/src/hooks/useSocket.js`

## Non-Blocking But Important

### 12. Client bundle is large

- The production JS bundle is about 633 kB before gzip warning handling

Impact:
- Not a deployment blocker, but it will hurt mobile startup and weaker network conditions

## Recommended Path

### Phase 1. Make web production-ready

- Unify frontend/backend contracts for auth, rooms, events, files, and location
- Add a production API base URL and socket URL strategy
- Decide the final hosting split:
  - Frontend: Vercel
  - Backend: Render/Railway/Fly.io
  - Database/Auth/Storage: Supabase
- Run end-to-end checks for signup, login, room create/join, event CRUD, file upload/delete, chat, location

### Phase 2. Add mobile packaging

- Add Capacitor to the Vite frontend
- Create Android and iOS native shells
- Configure app icons, splash screens, permissions, deep links, and environment variables
- Verify auth redirect behavior, geolocation permissions, socket stability, and uploads on real devices

### Phase 3. Store submission

- Android: Play Console internal testing first
- iOS: TestFlight first, then App Store review

## Bottom Line

- Web deployment can be reached fairly quickly after contract fixes
- Android/iOS deployment is feasible with Capacitor, but only after the web app is first made production-safe
- Trying to ship mobile stores before fixing the web production path will create avoidable failures
