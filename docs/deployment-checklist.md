# Flinders Collab - Deployment Checklist

## 1. Environment Variables

Create a `.env` file in the project root with the following variables:

```
PORT=3001
NODE_ENV=production
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
JWT_SECRET=<your-supabase-jwt-secret>
CLIENT_URL=https://<your-production-domain>
```

- [ ] All environment variables are set
- [ ] No placeholder values remain
- [ ] `.env` is listed in `.gitignore` (never commit secrets)

## 2. Supabase Setup

- [ ] Create a Supabase project at https://supabase.com
- [ ] Copy the project URL, anon key, and service role key to `.env`
- [ ] Copy the JWT secret from Supabase Dashboard > Settings > API > JWT Secret
- [ ] Run migration `001_initial_schema.sql` in the Supabase SQL Editor
- [ ] Run migration `002_file_metadata.sql` in the Supabase SQL Editor
- [ ] Run migration `003_fix_rls_policies.sql` in the Supabase SQL Editor
- [ ] Verify Row Level Security (RLS) policies are active on all tables
- [ ] Enable Supabase Auth with the desired providers (email, Google, etc.)
- [ ] Configure auth redirect URLs to include your production domain

## 3. Client Build

```bash
cd client
npm install
npm run build
```

- [ ] `npm install` completes without errors
- [ ] `npm run build` completes without errors
- [ ] The `client/dist/` directory is generated with `index.html` and assets
- [ ] Update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if the client reads them at build time

## 4. Server Deployment

### Option A: Traditional Node.js Hosting (VPS / VM)

```bash
cd server
npm install --production
NODE_ENV=production node src/index.js
```

- [ ] Use a process manager (pm2, systemd) to keep the server running
- [ ] Example: `pm2 start src/index.js --name flinders-collab`

### Option B: Platform-as-a-Service (Railway, Render, Fly.io)

- [ ] Connect your Git repository
- [ ] Set the root directory to `server/`
- [ ] Set build command: `npm install`
- [ ] Set start command: `node src/index.js`
- [ ] Add all environment variables from Section 1
- [ ] Ensure WebSocket support is enabled (needed for Socket.IO)

### Option C: Docker

- [ ] Create a Dockerfile for the server
- [ ] Build and push the image
- [ ] Deploy to your container hosting platform

### Verification

- [ ] Server starts without errors
- [ ] `GET /api/health` returns `200 OK`
- [ ] WebSocket connections are accepted on `/socket.io`

## 5. Android Build (Capacitor)

```bash
cd client
npm run build
npx cap sync android
npx cap open android
```

- [ ] Update `capacitor.config.json` server URL to point to production backend
- [ ] Open in Android Studio and verify the project builds
- [ ] Set the app signing key for release builds
- [ ] Update `app/build.gradle` version code and version name
- [ ] Build a signed APK or AAB: Build > Generate Signed Bundle / APK
- [ ] Test the APK on a physical device or emulator
- [ ] If publishing to Play Store: prepare store listing, screenshots, and privacy policy

## 6. iOS Build (Capacitor)

```bash
cd client
npm run build
npx cap sync ios
npx cap open ios
```

- [ ] Open in Xcode and configure the signing team
- [ ] Set the Bundle Identifier to `au.edu.flinders.collab`
- [ ] Update the version and build number
- [ ] Test on a physical iOS device or simulator
- [ ] Archive the build: Product > Archive
- [ ] If publishing to App Store: prepare App Store Connect listing
- [ ] Submit for App Review

## 7. Domain and SSL Setup

- [ ] Register or configure your production domain
- [ ] Point DNS A/CNAME records to your server
- [ ] Set up SSL/TLS certificates (Let's Encrypt with certbot, or platform-managed)
- [ ] Verify HTTPS is working: `curl -I https://your-domain.com/api/health`
- [ ] Update `CLIENT_URL` in `.env` to the HTTPS domain
- [ ] Update CORS settings if the client and server are on different domains
- [ ] Update Supabase Auth redirect URLs to use the HTTPS domain

## 8. Post-Deployment Verification

- [ ] Health check: `curl https://your-domain.com/api/health` returns 200
- [ ] Client loads in a browser without console errors
- [ ] User registration and login work
- [ ] Creating a room succeeds
- [ ] Joining a room succeeds
- [ ] Real-time messaging via Socket.IO works
- [ ] File uploads work and files are stored in Supabase Storage
- [ ] Location sharing updates appear on the map
- [ ] Notifications are delivered
- [ ] Run the smoke test: `bash scripts/smoke-test.sh https://your-domain.com`
- [ ] Check server logs for any startup warnings or errors
- [ ] Monitor error rates for the first 24 hours
