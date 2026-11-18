# Mobile Testing Guide

## Overview

This document describes how to verify the Flinders Collab app on web and Android platforms. iOS is planned but not yet implemented.

---

## Test Coverage Summary

| Layer | Location | Runner | Device Required? |
|-------|----------|--------|------------------|
| Android unit tests (JVM) | `client/android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` | `./gradlew test` | No |
| Android instrumented tests | `client/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` | `./gradlew connectedAndroidTest` | Yes (emulator or device) |
| Manual smoke tests (web + Android) | [`docs/qa/web-android-smoke-checklist.md`](qa/web-android-smoke-checklist.md) | Human / manual | Depends on section |

### What is NOT automated

- **Frontend (React) tests:** There is no JS test framework (Jest, Vitest, etc.) configured in the `client/` project. All web UI verification is manual via the smoke checklist.
- **Backend API tests:** No automated API test suite exists. Backend routes are verified manually through the smoke checklist or ad-hoc `curl`/Postman calls.
- **End-to-end tests:** No Cypress, Playwright, or similar E2E framework is set up.

> **Gap note:** Adding Vitest to the client and a test runner for the server would significantly improve automated coverage. This is a future improvement.

---

## Running Android Unit Tests (JVM)

These tests run on the host machine without an emulator. They verify package naming, stable constants, and basic assumptions about the Capacitor shell.

```bash
cd client/android
./gradlew test
```

**What they check:**
- Test package (`com.getcapacitor.myapp`) has not drifted from directory structure
- Capacitor appId matches `au.edu.flinders.collab` (aligned with `build.gradle` and `capacitor.config.json`)
- MainActivity class name convention is stable
- App name is "Flinders Collab"
- Version code is positive
- Capacitor defaults (dev server port 5173, WebView scheme `https`) are consistent
- JUnit infrastructure is operational

### Common Blockers

| Blocker | Symptom | Fix |
|---------|---------|-----|
| Java not installed | `./gradlew: command not found` or `JAVA_HOME is not set` | Install JDK 17+ and set `JAVA_HOME` |
| Android SDK missing | Gradle sync fails with SDK errors | Install Android SDK via Android Studio or `sdkmanager` |
| No `client/android` directory | Path does not exist | Run `npx cap add android && npx cap sync android` from `client/` |
| Missing Capacitor sync artifacts | `Could not read script 'capacitor-cordova-android-plugins/cordova.variables.gradle'` | Run `npx cap sync android` from `client/` before building |

---

## Running Android Instrumented Tests (Device/Emulator)

These tests run on a real Android device or emulator and verify that the APK installs correctly and has expected metadata.

```bash
cd client/android
./gradlew connectedAndroidTest
```

**What they check:**
- App context package name is `au.edu.flinders.collab` (matches Capacitor appId)
- App is resolvable by PackageManager (installed correctly)
- App context is non-null after launch
- ApplicationInfo has valid source directory
- App label contains "Flinders"
- Version code is positive

### Common Blockers

| Blocker | Symptom | Fix |
|---------|---------|-----|
| No emulator or device | `No connected devices` error | Start an AVD via Android Studio or connect a USB device with developer mode |
| APK not built | Test task fails before running tests | Run `./gradlew assembleDebug` first |
| SDK version mismatch | `Unsupported class file major version` | Ensure JDK version matches AGP requirements (JDK 17 for AGP 8.x) |

---

## Manual Smoke Testing

The full feature-by-feature smoke checklist is at:

**[`docs/qa/web-android-smoke-checklist.md`](qa/web-android-smoke-checklist.md)**

It covers all user-facing flows:
1. Signup
2. Login
3. Create Room
4. Join Room
5. Schedule Event
6. Share Location
7. Stop Location Sharing
8. Upload File
9. Download File
10. Delete File
11. Chat (real-time messaging)
12. Logout
13. Android-specific checks (launch, navigation, permissions, file picker, back button)

Each check includes expected behaviour and failure symptoms for quick reproduction.

---

## Environment Blockers (Current)

The following blockers apply to this repo's current CI/dev environment:

| Blocker | Impact | Workaround |
|---------|--------|------------|
| No Android emulator in CI | Instrumented tests cannot run in CI | Run locally with an emulator; unit tests still run in CI |
| No JS test framework in `client/` | Cannot automate React component or service tests | Use manual smoke checklist; consider adding Vitest later |
| No Xcode / iOS target | iOS build and tests are not available | Defer to future sprint; see iOS parity note in smoke checklist |
| Capacitor not yet initialized | `client/android` may not exist until `npx cap add android` is run | Run Capacitor init before first Android test run |

---

## Future: iOS

When iOS support is added (`npx cap add ios`):
1. Mirror the instrumented test structure under `client/ios/AppTests/`
2. Add iOS-specific checks to the smoke checklist (see "Future: iOS Parity" section)
3. Update this guide with `xcodebuild test` instructions
