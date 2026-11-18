# Web & Android Smoke Test Checklist

> **Scope:** Web (browser) and Android (Capacitor shell). iOS parity is planned but not yet covered.
>
> **How to use:** Walk through each section top-to-bottom. Mark pass/fail and note the failure symptom so another tester or agent can reproduce quickly.

---

## Prerequisites

| Item | Expected |
|------|----------|
| Backend server running | `npm run dev` in `server/` starts on port 3001 (or configured `PORT`) |
| Frontend dev server running | `npm run dev` in `client/` starts Vite on port 5173 |
| Supabase project reachable | `.env` contains valid `SUPABASE_URL` and `SUPABASE_ANON_KEY` |
| Android build (if testing native) | `npx cap sync android && cd client/android && ./gradlew assembleDebug` succeeds |

---

## 1. Signup

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 1.1 | Navigate to `/signup` | Signup form renders with email, password, and metadata fields | Blank page or console error |
| 1.2 | Submit with valid university email and password | Redirects to `/dashboard`; user session is created | Error toast or stays on signup page |
| 1.3 | Submit with missing/invalid email | Inline validation error; no network request fires | Request sent anyway or no feedback shown |
| 1.4 | Submit with password that is too short | Inline validation error | Accepts weak password silently |

**Route:** `POST /auth/signup`

---

## 2. Login

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 2.1 | Navigate to `/login` | Login form renders with email and password fields | Blank page or console error |
| 2.2 | Submit with valid credentials | Redirects to `/dashboard`; auth token stored | Error toast or stays on login page |
| 2.3 | Submit with wrong password | Error message shown; no redirect | Silent failure or unhandled exception |
| 2.4 | Visit `/dashboard` while logged out | Redirects to `/login` | Dashboard renders without auth |

**Route:** `POST /auth/login`

---

## 3. Create Room

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 3.1 | Click "Create Room" on dashboard | Room creation dialog/form appears | Nothing happens or console error |
| 3.2 | Fill in room name and submit | New room appears in dashboard list; user is auto-joined as owner | Room not visible or API error |
| 3.3 | Open the newly created room | Navigates to `/rooms/:roomId`; room page loads with tabs/sections | 404 or blank room page |

**Route:** `POST /rooms` (via `server/src/routes/rooms.js`)

---

## 4. Join Room

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 4.1 | Open "Join Room" dialog on dashboard | Dialog renders with invite code input | Dialog does not appear |
| 4.2 | Enter a valid invite code and submit | User joins the room; room appears in dashboard list | Error or room not added |
| 4.3 | Enter an invalid/expired invite code | Descriptive error message shown | Silent failure or crash |

**Route:** `POST /rooms/join` (via `server/src/routes/rooms.js`)

---

## 5. Schedule Event

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 5.1 | Open a room and navigate to schedule section | Event list and "Add Event" form/button visible | Section missing or empty without error |
| 5.2 | Create a new event with title, date, and time | Event appears in the event list | API error or event not shown |
| 5.3 | Verify event persists after page reload | Event still listed after refresh | Event disappears (not persisted) |

**Route:** `POST /rooms/:roomId/events` (via `server/src/routes/events.js`)

---

## 6. Share Location

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 6.1 | Open a room and find the location toggle | Location sharing toggle/button is visible | Component missing |
| 6.2 | Enable location sharing | Browser requests geolocation permission; on grant, location is broadcast to room members via Socket.IO | Permission not requested or location not sent |
| 6.3 | Verify other room members see the shared location on the map | Map component shows pin/marker for sharing user | Map blank or marker missing |

**Route:** `POST /events/:eventId/location/start` (via `server/src/routes/location.js`)

---

## 7. Stop Location Sharing

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 7.1 | Toggle location sharing off | Location updates stop; marker removed for other members | Updates keep sending or marker persists |
| 7.2 | Verify geolocation watch is cleared | No further `watchPosition` callbacks fire (check browser devtools) | Continued GPS polling (battery drain) |

**Route:** `POST /events/:eventId/location/stop` (via `server/src/routes/location.js`)

---

## 8. Upload File

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 8.1 | Open room and navigate to files section | File list and upload button visible | Section missing |
| 8.2 | Select a file and upload | Progress indicator shown; file appears in list on completion | Upload hangs or error toast |
| 8.3 | Upload a file exceeding size limit (if configured) | Descriptive error before or during upload | Silent failure or server 500 |

**Route:** `POST /rooms/:roomId/files` (via `server/src/routes/files.js`)

---

## 9. Download File

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 9.1 | Click download on an uploaded file | File downloads to device with correct name and content | Wrong file, corrupt content, or 404 |
| 9.2 | Download on Android (Capacitor) | File saves to device Downloads or opens share sheet | Download does nothing or crashes |

**Route:** `GET /files/:fileId/download` (via `server/src/routes/files.js`)

---

## 10. Delete File

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 10.1 | Click delete on an uploaded file | Confirmation prompt appears | Deletes without confirmation |
| 10.2 | Confirm deletion | File removed from list and from Supabase Storage | File still visible or storage not cleaned |

**Route:** `DELETE /files/:fileId` (via `server/src/routes/files.js`)

---

## 11. Chat (Real-time Messaging)

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 11.1 | Open a room's chat section | Previous messages load (paginated via `GET /rooms/:roomId/messages`) | Empty chat with no loading indicator |
| 11.2 | Send a message | Message appears instantly for sender via Socket.IO; persists on reload | Message not shown or lost on refresh |
| 11.3 | Receive a message from another member | Message appears in real time without page refresh | Requires manual refresh to see new messages |

**Route:** `GET /rooms/:roomId/messages` (via `server/src/routes/messages.js`); Socket.IO for real-time delivery

---

## 12. Logout

| # | Step | Expected Behaviour | Failure Symptom |
|---|------|--------------------|-----------------|
| 12.1 | Click logout | Session cleared; redirects to `/login` | Stays on dashboard or session not invalidated |
| 12.2 | Press browser back button after logout | Does not return to authenticated pages; stays on `/login` | Dashboard re-renders with stale data |

**Route:** `POST /auth/logout`

---

## Android-Specific Checks

| # | Check | Expected Behaviour | Failure Symptom |
|---|-------|--------------------|-----------------|
| A.1 | App launches in emulator/device | Capacitor WebView loads the frontend | White screen or crash on launch |
| A.2 | Deep links / navigation work | In-app route changes work via React Router inside WebView | URL bar appears or navigation breaks |
| A.3 | Geolocation permission prompt | Android system permission dialog appears when location sharing is toggled | Permission not requested; location fails silently |
| A.4 | File upload via Android | File picker opens; selected file uploads correctly | Picker does not open or upload fails |
| A.5 | Back button behaviour | Android hardware back navigates within app, not out of WebView | App closes unexpectedly |

---

## Future: iOS Parity

When an iOS build is added (via `npx cap add ios`), duplicate the Android-specific checks above for iOS, paying attention to:
- `NSLocationWhenInUseUsageDescription` in `Info.plist`
- File picker behaviour on Safari WebView
- iOS-specific back gesture / navigation patterns
- App Transport Security (ATS) for non-HTTPS dev servers
