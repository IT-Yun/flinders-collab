# Mobile Quick-Start Guide

Get the Flinders Collab app running on web first, then Android via Capacitor. The current delivery target is web plus Android, with iOS support planned next.

## Prerequisites

- Node.js 18+
- npm 9+
- Android Studio (for Android builds only)

## 1. Install Dependencies

From the project root:

```bash
npm install
```

This installs both `client` and `server` workspaces.

## 2. Start the Backend

```bash
npm run dev:server
```

The Express server starts on `http://localhost:3001` (default) with Socket.IO for real-time features. For a production-style launch you can also run:

```bash
npm run start:server
```

## 3. Start the Web Client

```bash
npm run dev:client
```

Vite serves the React app at `http://localhost:5173`. The dev proxy forwards `/api` requests to the backend.

## 4. Core Flows to Verify

1. **Sign up / Log in** — use a `@flinders.edu.au` email.
2. **Create a room** — use "Create Room" on the dashboard and fill in the room name plus optional course name.
3. **Copy the invite code** — every room returns a shareable invite code after creation.
4. **Join a room** — use "Join Room" on the dashboard and paste the invite code. The join flow is invite-code only; users do not need a room UUID.
5. **Check refresh behavior** — after creating or joining, the room should appear on the dashboard cards and in the sidebar without a manual reload.
6. **Open the room** — tap/click the card or sidebar entry and confirm protected room content loads for members only.

## 5. Android (Capacitor)

The project uses Capacitor for native Android builds.

```bash
cd client
npx cap sync android
npx cap open android
```

Build and run from Android Studio. The web app runs inside a WebView. All API calls route through the same backend, so make sure the device or emulator can reach your dev server.

> **Tip:** On an emulator, use `10.0.2.2` instead of `localhost` to reach the host machine.

## 6. iOS (Future)

iOS support is planned but not yet part of the current delivery scope. The Capacitor setup is expected to extend to iOS later without changing the room or dashboard flows.

## Troubleshooting

| Issue | Fix |
|---|---|
| "Failed to fetch rooms" on dashboard | Ensure the backend is running and the Vite proxy is configured. |
| Invalid invite code | Codes are case-insensitive and currently 6 characters (for example `Q7K9LM`). Check for trailing spaces or ask the room owner to resend the latest code. |
| Android WebView blank screen | Run `npx cap sync android` after any client build to copy assets. |
| CORS errors in browser | The Vite dev server proxies `/api` — don't call the backend directly from the browser. |
