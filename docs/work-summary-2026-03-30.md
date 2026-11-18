# Work Summary - 2026-03-30

## Scope

This document summarizes the major web release work completed around mobile web UX, Flinders Social, event creation, profile flow, performance, and security hardening.

## 1. Schedule and event flow

Updated the event creation flow to better support real student use cases.

Changes:

- calendar-selected dates are now editable inside the form
- event date can be changed again even after opening from another date on the calendar
- presentation-style events support start and end time
- submission or deadline-style events can use due-time-only flow
- mobile event creation UI was simplified and made more touch-friendly
- week numbering now supports user-controlled week-start offset near the schedule area

Main files:

- `client/src/components/schedule/EventForm.jsx`
- `client/src/components/schedule/EventList.jsx`
- `client/src/components/schedule/Calendar.jsx`
- `client/src/pages/RoomPage.jsx`
- `client/src/lib/flinders-week.js`
- `server/src/controllers/eventController.js`
- `server/src/utils/validators.js`

## 2. Board and popup usability

Improved desktop post creation and reduced cramped modal layout.

Changes:

- Free Board new-post dialog widened on desktop
- textarea height and internal dialog structure improved for long-form writing

Main file:

- `client/src/pages/BoardPage.jsx`

## 3. Flinders Life improvements

Refined Flinders Life content browsing and filtering.

Changes:

- Flinders Life event feed now shows all events first
- category filtering moved into a clearer side filter flow
- academic calendar and study-room sections preserved as core tabs

Main file:

- `client/src/pages/FlindersLifePage.jsx`

## 4. Flinders Social / Flinap launch

Built a Snapchat-style campus-only social presence feature.

Core behavior:

- users can share campus-only presence for City, Bedford Park, or Tonsley
- no exact coordinates are stored on the server
- GPS is converted to campus match in the browser first
- users can set a live activity status and short message
- map bubbles show profile photo or initials, status, and short message
- clicking a user opens a profile card with major, year, semester, friend request flow, and 1:1 chat access

UX refinements:

- sidebar entry is now `Flinders Social`
- mobile flow was reorganized to prioritize campus selection, then map, then status controls
- member-card header, close button, and typography were refined
- custom campus photos were added as soft map backgrounds
- map background contrast was tuned to reduce eye strain
- status/message inputs were adjusted for mobile keyboard behavior
- off-campus presence now auto-hides after a short grace period, then returns automatically on re-entry

Main files:

- `client/src/pages/FlindersLifePage.jsx`
- `client/src/pages/FlindersSocialPage.jsx`
- `client/src/layouts/MainLayout.jsx`
- `client/src/App.jsx`
- `client/src/components/ui/dialog.jsx`
- `client/src/components/ui/input.jsx`
- `client/src/services/flinders.js`
- `server/src/routes/flinders.js`
- `server/src/utils/migrate.js`

## 5. Profile and settings flow

Simplified profile ownership and made profile data reusable across the app.

Changes:

- Settings page now focuses on notification preferences only
- profile editing moved to the name-card profile dialog
- profile dialog expanded to support avatar upload, full name, student ID, and major
- Flinders student major field supports autocomplete
- Student ID validation was relaxed to allow letters, numbers, and hyphens
- Flinders Social now uses the same avatar/profile data as the main account profile
- cross-session profile sync improved so avatar/name changes propagate across devices and browser sessions

Main files:

- `client/src/components/ProfileDialog.jsx`
- `client/src/components/settings/PreferenceSettings.jsx`
- `client/src/components/settings/ProfileSettings.jsx`
- `client/src/pages/SettingsPage.jsx`
- `client/src/hooks/useAuth.js`
- `client/src/services/auth.js`
- `server/src/controllers/authController.js`

## 6. Notification settings expansion

Aligned settings with new social features.

Changes:

- notification settings remain the only Settings content
- added Friend Requests notification preference
- renamed older board-oriented wording to Flinders Social wording where appropriate
- friend request sent/accepted paths now trigger push-eligible notification types

Main files:

- `client/src/components/settings/PreferenceSettings.jsx`
- `client/src/lib/preferences.js`
- `server/src/controllers/authController.js`
- `server/src/controllers/pushController.js`
- `server/src/routes/flinders.js`
- `server/src/utils/migrate.js`

## 7. Performance and request reduction

Reduced repeated client/server work during general navigation.

Changes:

- reduced repeated board notification polling and unnecessary seen-updates
- reduced room visit sync frequency and redundant room-activity work
- cached room activity, activity summary, quick links, and board notification responses
- deferred some room-page data loads until the related tab is actually opened
- added client-side dedupe and TTL caching for several repeated service calls

Main files:

- `client/src/layouts/MainLayout.jsx`
- `client/src/pages/RoomPage.jsx`
- `client/src/services/rooms.js`
- `client/src/services/board.js`
- `server/src/controllers/activityController.js`
- `server/src/controllers/roomController.js`
- `server/src/controllers/boardController.js`

## 8. Security hardening

Reviewed the app from an attacker mindset and closed several immediate release risks.

Changes:

- signup moved away from instant activated accounts toward email verification flow
- tester mode was blocked in production by default
- rate limiting added around room joining, reports, uploads, and location sharing
- friend/social additions were kept campus-only and coarse-grained

Important remaining structural risks noted during the review:

- auth session still uses browser storage instead of httpOnly cookies
- uploads still use memory storage instead of direct-to-storage upload

Main files:

- `server/src/controllers/authController.js`
- `server/src/routes/auth.js`
- `server/src/routes/rooms.js`
- `server/src/routes/reports.js`
- `server/src/routes/files.js`
- `server/src/routes/location.js`
- `server/src/sockets/locationHandler.js`
- `server/src/config.js`

## 9. Mobile web compatibility work

A large part of this cycle focused on making the web app behave more like a polished mobile web product.

Completed:

- softened placeholder styling across forms
- reduced accidental mobile browser zoom on text inputs
- improved keyboard focus behavior for status-message input
- improved modal close button behavior on mobile cards
- simplified several crowded mobile layouts

Main files:

- `client/src/components/ui/input.jsx`
- `client/src/components/ui/dialog.jsx`
- `client/src/components/schedule/EventForm.jsx`
- `client/src/pages/FlindersLifePage.jsx`

## 10. Validation performed

Repeatedly validated during this cycle:

- `npm run build --workspace=client`
- `node --check` on touched server controllers/routes/utilities

Practical limit:

- no full two-device live manual verification was performed from this terminal
- cross-device sync behavior was implemented and validated from code path and build success, but still benefits from one final human check using two active browser sessions

## 11. Notable commits from this cycle

- `7592f4d` secure auth flow and public-release hardening
- `ca57f33` move social experience into Flinders Social
- `06c9c1a` expand flinders social profile flow
- `8fef546` automatic campus sharing and snap-map style UI
- `aaecef9` refine flinders social mobile flow
- `7bf5b50` fix flinders social map rendering
- `0895352` sync flinders social avatars
- `11afab9` relax student id validation
- `5c3d78d` improve mobile input focus
- `8c8bc95` auto-hide flinders social off campus
- `14c8b2c` add campus photos to flinders social map
- `5ab845e` poll profile sync across sessions

## 12. Current status

Current state:

- the app is substantially more mobile-friendly than at the start of this cycle
- Flinders Social is now a real product surface, not a placeholder board
- profile, social, and notification systems are more connected
- release-critical security issues were reduced

Recommended next checks after release:

- verify cross-device profile sync with two live sessions
- monitor map bubble overlap if campus usage grows
- consider httpOnly cookie migration for auth
- consider direct-to-storage uploads for scalability
