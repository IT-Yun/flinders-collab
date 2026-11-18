import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { MapPin, MapPinOff, Loader2 } from 'lucide-react';
import { startSharing, stopSharing, updateLocation } from '@/services/location';
import { requestLocationPermission, watchPosition, clearLocationWatch } from '@/lib/native';

const UPDATE_INTERVAL_MS = 10_000; // throttle location updates to every 10s

function LocationHelp() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-left">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">If location is blocked</p>
      <div className="mt-2 space-y-2 text-xs leading-relaxed text-amber-900">
        <p><span className="font-semibold">MacBook + Safari/Chrome:</span> turn on System Settings &gt; Privacy &amp; Security &gt; Location Services, then allow location for your browser.</p>
        <p><span className="font-semibold">Samsung/Windows laptops:</span> turn on Windows Settings &gt; Privacy &amp; security &gt; Location, then allow location access for your browser.</p>
        <p><span className="font-semibold">Browser blocked it before:</span> click the lock icon next to the address bar, set Location to Allow, then refresh and try again.</p>
        <p><span className="font-semibold">Still not working:</span> some laptops do not have reliable GPS. Try Wi-Fi on, reload the page, or use manual status updates instead.</p>
      </div>
    </div>
  );
}

export default function LocationToggle({ roomId, eventId, isSharing, onToggle }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);

  // Send location updates to the backend (throttled)
  const sendUpdate = useCallback(
    async (coords) => {
      const now = Date.now();
      if (now - lastSentRef.current < UPDATE_INTERVAL_MS) return;
      lastSentRef.current = now;
      try {
        await updateLocation(eventId, {
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      } catch {
        // non-critical — next update will retry
      }
    },
    [eventId],
  );

  // Start / stop the geolocation watcher when sharing state changes
  useEffect(() => {
    if (!isSharing || !eventId) return;

    const id = watchPosition(
      (coords) => sendUpdate(coords),
      () => {
        // watcher error — stop gracefully rather than leave stale state
      },
    );
    watchIdRef.current = id;

    return () => {
      clearLocationWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [isSharing, eventId, sendUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearLocationWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, []);

  const handleStart = async () => {
    setError('');
    setLoading(true);
    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        setError('Location permission denied. Please allow access in your settings.');
        setShowHelp(true);
        return;
      }
      await startSharing(eventId);
      onToggle?.(true);
    } catch (err) {
      setError(err.message || 'Failed to start sharing location.');
      setShowHelp(true);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setError('');
    setLoading(true);
    try {
      clearLocationWatch(watchIdRef.current);
      watchIdRef.current = null;
      await stopSharing(eventId);
      onToggle?.(false);
    } catch (err) {
      setError(err.message || 'Failed to stop sharing.');
    } finally {
      setLoading(false);
    }
  };

  if (isSharing) {
    return (
      <div className="space-y-1">
        <Button variant="outline" size="sm" onClick={handleStop} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPinOff className="mr-2 h-4 w-4" />}
          Stop Sharing
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {showHelp && <LocationHelp />}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
            Share My Location
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share Your Location?</AlertDialogTitle>
            <AlertDialogDescription>
              Your location will be visible to other room members for this event. You can stop sharing at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <LocationHelp />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStart}>Share Location</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="button"
        onClick={() => setShowHelp((prev) => !prev)}
        className="text-xs font-medium text-amber-700 underline-offset-2 hover:underline"
      >
        {showHelp ? 'Hide location help' : 'Location not working on your laptop?'}
      </button>
      {showHelp && <LocationHelp />}
    </div>
  );
}
