/**
 * Android-safe native helpers.
 * Wraps browser APIs so they work inside Capacitor WebView and on plain web.
 *
 * Capacitor plugins (if installed) are accessed via window.Capacitor.Plugins
 * to avoid static/dynamic import errors during Vite builds.
 */

const isCapacitor = () =>
  typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

function getCapPlugin(name) {
  return isCapacitor() ? window.Capacitor?.Plugins?.[name] : null;
}

export function isNativeApp() {
  return isCapacitor();
}

/**
 * Request geolocation permission (no-op on web; Capacitor handles via plugin).
 * Returns true if permission is available.
 */
export async function requestLocationPermission() {
  const geo = getCapPlugin('Geolocation');
  if (geo) {
    try {
      const status = await geo.requestPermissions();
      return status.location === 'granted';
    } catch {
      // plugin not available — fall through to web
    }
  }

  if (navigator.permissions) {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state !== 'denied';
    } catch {
      // query not supported for geolocation in some browsers
    }
  }
  return !!navigator.geolocation;
}

/**
 * Get current position. Returns { latitude, longitude, accuracy }.
 * Throws with a user-friendly message on failure.
 */
export async function getCurrentPosition(options = {}) {
  const opts = { enableHighAccuracy: true, timeout: 15000, ...options };

  const geo = getCapPlugin('Geolocation');
  if (geo) {
    try {
      const pos = await geo.getCurrentPosition(opts);
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch {
      // fall through to web
    }
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by this browser.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        const messages = {
          1: 'Location permission denied. Please allow location access in your device settings.',
          2: 'Unable to determine your location. Please try again.',
          3: 'Location request timed out. Please try again.',
        };
        reject(new Error(messages[err.code] || 'Failed to get location.'));
      },
      opts,
    );
  });
}

/**
 * Watch position continuously. Returns a watchId that can be passed to clearLocationWatch().
 * On Capacitor native, uses the Geolocation plugin callback if available.
 */
export function watchPosition(onUpdate, onError, options = {}) {
  const opts = { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000, ...options };

  const geo = getCapPlugin('Geolocation');
  if (geo && typeof geo.watchPosition === 'function') {
    // Capacitor watchPosition returns a callback ID string
    let callbackId = null;
    geo
      .watchPosition(opts, (pos, err) => {
        if (err) {
          onError?.(new Error(err.message || 'Location watch failed.'));
          return;
        }
        if (pos) {
          onUpdate({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        }
      })
      .then((id) => {
        callbackId = id;
      })
      .catch(() => {
        // plugin error — fall through handled by web below
      });
    // Return a wrapper object so clearLocationWatch can handle both types
    return { _capacitor: true, _geoPlugin: geo, get id() { return callbackId; } };
  }

  if (!navigator.geolocation) {
    onError?.(new Error('Geolocation is not supported by this browser.'));
    return null;
  }

  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onUpdate({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
    (err) => {
      const messages = {
        1: 'Location permission denied.',
        2: 'Unable to determine your location.',
        3: 'Location request timed out.',
      };
      onError?.(new Error(messages[err.code] || 'Location watch failed.'));
    },
    opts,
  );

  return id;
}

/**
 * Clear a location watch by its id.
 * Accepts either a numeric web watchId or a Capacitor wrapper object.
 */
export function clearLocationWatch(watchId) {
  if (watchId == null) return;
  if (typeof watchId === 'object' && watchId._capacitor) {
    // Capacitor plugin clearWatch
    const plugin = watchId._geoPlugin;
    if (plugin && watchId.id != null) {
      plugin.clearWatch({ id: watchId.id }).catch(() => {});
    }
    return;
  }
  if (navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
}

// Legacy alias
export const clearWatch = clearLocationWatch;

/**
 * Copy text to clipboard (Android-safe).
 */
export async function copyToClipboard(text) {
  const clip = getCapPlugin('Clipboard');
  if (clip) {
    try {
      await clip.write({ string: text });
      return;
    } catch {
      // fall through
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// Legacy alias
export const writeClipboardText = copyToClipboard;

/**
 * Set the status bar style ('DARK' or 'LIGHT').
 * No-op on web.
 */
export async function setStatusBarStyle(style) {
  const statusBar = getCapPlugin('StatusBar');
  if (statusBar) {
    try {
      await statusBar.setStyle({ style });
    } catch {
      // plugin not available
    }
  }
}

/**
 * Hide the status bar. No-op on web.
 */
export async function hideStatusBar() {
  const statusBar = getCapPlugin('StatusBar');
  if (statusBar) {
    try {
      await statusBar.hide();
    } catch {
      // plugin not available
    }
  }
}

/**
 * Show the status bar. No-op on web.
 */
export async function showStatusBar() {
  const statusBar = getCapPlugin('StatusBar');
  if (statusBar) {
    try {
      await statusBar.show();
    } catch {
      // plugin not available
    }
  }
}

/**
 * Hide the splash screen. No-op on web.
 */
export async function hideSplashScreen() {
  const splashScreen = getCapPlugin('SplashScreen');
  if (splashScreen) {
    try {
      await splashScreen.hide();
    } catch {
      // plugin not available
    }
  }
}

/**
 * Trigger haptic feedback. No-op on web.
 * @param {'impact'|'notification'|'vibrate'} type - Type of haptic feedback.
 */
export async function triggerHaptic(type = 'impact') {
  const haptics = getCapPlugin('Haptics');
  if (haptics) {
    try {
      if (type === 'impact') {
        await haptics.impact({ style: 'medium' });
      } else if (type === 'notification') {
        await haptics.notification({ type: 'SUCCESS' });
      } else if (type === 'vibrate') {
        await haptics.vibrate();
      }
    } catch {
      // plugin not available
    }
  }
}

/**
 * Listen for app state changes (foreground/background).
 * No-op on web. Returns a remove listener handle if available.
 */
export async function onAppStateChange(callback) {
  const app = getCapPlugin('App');
  if (app) {
    try {
      return await app.addListener('appStateChange', callback);
    } catch {
      // plugin not available
    }
  }
  return null;
}
