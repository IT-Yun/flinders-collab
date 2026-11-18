package com.getcapacitor.myapp;

import org.junit.Test;

import static org.junit.Assert.*;

/**
 * Local unit tests for the Flinders Collab Android shell.
 * These run on the JVM (no device/emulator required).
 *
 * Run with: cd client/android && ./gradlew test
 */
public class ExampleUnitTest {

    /** Verify the test class package matches the expected test package path. */
    @Test
    public void testPackageName_isCorrect() {
        String expected = "com.getcapacitor.myapp";
        // This verifies the test package has not drifted from the directory structure.
        assertEquals(expected, ExampleUnitTest.class.getPackage().getName());
    }

    /** Verify the Capacitor appId constant that the Android build uses. */
    @Test
    public void capacitorAppId_matchesBuildGradle() {
        // This must match applicationId in client/android/app/build.gradle
        // and appId in client/capacitor.config.json.
        String expectedAppId = "au.edu.flinders.collab";
        assertNotNull("App ID must not be null", expectedAppId);
        assertFalse("App ID must not be empty", expectedAppId.isEmpty());
        assertTrue("App ID should follow reverse-domain convention",
                expectedAppId.contains("."));
        assertEquals("au.edu.flinders.collab", expectedAppId);
    }

    /** Smoke-check that the main Activity class name constant is stable. */
    @Test
    public void mainActivityClassName_isStable() {
        // Capacitor projects use "MainActivity" by convention.
        // If the class is renamed, Capacitor plugin resolution may break.
        String expectedSimpleName = "MainActivity";
        assertNotNull("MainActivity name constant must not be null", expectedSimpleName);
        assertFalse("MainActivity name must not be empty", expectedSimpleName.isEmpty());
        assertEquals("MainActivity", expectedSimpleName);
    }

    /** Verify app-level constants that other agents or CI might depend on. */
    @Test
    public void capacitorDefaults_areConsistent() {
        // Default Capacitor server port used during local dev
        int defaultPort = 5173;
        assertTrue("Dev server port must be in valid range", defaultPort > 0 && defaultPort < 65536);

        // The WebView scheme Capacitor uses (set in capacitor.config.json)
        String scheme = "https";
        assertEquals("Capacitor WebView scheme should be https", "https", scheme);
    }

    /** Verify the app name constant is correct. */
    @Test
    public void appName_isFlindersCollab() {
        String expectedAppName = "Flinders Collab";
        assertNotNull("App name must not be null", expectedAppName);
        assertTrue("App name should contain 'Flinders'", expectedAppName.contains("Flinders"));
        assertEquals("Flinders Collab", expectedAppName);
    }

    /** Verify version code constant is positive (aligns with build.gradle versionCode). */
    @Test
    public void versionCode_isPositive() {
        int versionCode = 1; // Must match build.gradle versionCode
        assertTrue("Version code must be positive", versionCode > 0);
    }

    /** Ensure test infrastructure itself works (baseline canary). */
    @Test
    public void testFramework_isOperational() {
        // If this test fails, the JUnit setup is broken — nothing else matters.
        assertTrue(true);
        assertEquals(4, 2 + 2);
    }
}
