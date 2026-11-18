package com.getcapacitor.myapp;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.*;

/**
 * Instrumented tests for the Flinders Collab Android shell.
 * These run on an Android device or emulator.
 *
 * Run with: cd client/android && ./gradlew connectedAndroidTest
 *
 * Prerequisites:
 *   - A running Android emulator or connected device
 *   - Android SDK with platform matching the project's compileSdk
 *   - Java 17+ (required by AGP 8.x)
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    /** The Capacitor appId defined in capacitor.config.json and build.gradle. */
    private static final String EXPECTED_APP_ID = "au.edu.flinders.collab";

    /** Verify the app's package name matches the expected Capacitor appId. */
    @Test
    public void useAppContext_packageNameIsCorrect() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals(EXPECTED_APP_ID, appContext.getPackageName());
    }

    /** Verify the app can be resolved by the PackageManager (i.e. it is installed). */
    @Test
    public void app_isInstalled() throws PackageManager.NameNotFoundException {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageManager pm = appContext.getPackageManager();
        PackageInfo info = pm.getPackageInfo(EXPECTED_APP_ID, 0);
        assertNotNull("PackageInfo should not be null for installed app", info);
        assertNotNull("Version name should be set", info.versionName);
    }

    /** Verify the target context is not null (basic launch assumption). */
    @Test
    public void appContext_isNotNull() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertNotNull("App context must not be null after launch", appContext);
    }

    /** Verify that the app has a valid application info entry. */
    @Test
    public void applicationInfo_isValid() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertNotNull("ApplicationInfo must not be null", appContext.getApplicationInfo());
        assertNotNull("Source dir must be set", appContext.getApplicationInfo().sourceDir);
    }

    /** Verify the app name is set correctly for user-visible contexts. */
    @Test
    public void appLabel_isFlindersCollab() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageManager pm = appContext.getPackageManager();
        CharSequence label = appContext.getApplicationInfo().loadLabel(pm);
        assertNotNull("App label must not be null", label);
        assertTrue("App label should contain 'Flinders'",
                label.toString().contains("Flinders"));
    }

    /** Verify the app's version code is a positive integer. */
    @Test
    public void versionCode_isPositive() throws PackageManager.NameNotFoundException {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageManager pm = appContext.getPackageManager();
        PackageInfo info = pm.getPackageInfo(EXPECTED_APP_ID, 0);
        assertTrue("versionCode must be > 0", info.versionCode > 0);
    }
}
