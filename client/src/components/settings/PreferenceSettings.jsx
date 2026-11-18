import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { getCachedPreferences, hydratePreferences, updatePreferences } from '@/lib/preferences';

const PREF_NOTIFICATION_SOUNDS = 'pref-notification-sounds';
const NOTIFICATION_OPTIONS = [
  {
    key: 'chat',
    label: 'Chat Messages',
    description: 'Push alerts for new room messages.',
  },
  {
    key: 'tasks',
    label: 'Tasks',
    description: 'Alerts when tasks are created or assigned.',
  },
  {
    key: 'schedule',
    label: 'Schedule & Deadlines',
    description: 'Event alerts and deadline reminders.',
  },
  {
    key: 'files',
    label: 'Files',
    description: 'Alerts when new files are uploaded.',
  },
  {
    key: 'announcements',
    label: 'Announcements',
    description: 'Owner and admin announcement alerts.',
  },
  {
    key: 'room_updates',
    label: 'Room Updates',
    description: 'Membership and general room activity alerts.',
  },
  {
    key: 'friend_requests',
    label: 'Friend Requests',
    description: 'Alerts when someone adds you or accepts your request.',
  },
  {
    key: 'board',
    label: 'Flinders Social',
    description: 'General social activity alerts.',
  },
];

function readBool(key, defaultValue = false) {
  const stored = localStorage.getItem(key);
  if (stored === null) return defaultValue;
  return stored === 'true';
}

function Toggle({ checked, onChange, id, disabled }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

function PreferenceRow({ id, label, description, checked, onChange, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="space-y-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Toggle id={id} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function PreferenceSettings() {
  const { addToast } = useToast();

  const [notificationSounds, setNotificationSounds] = useState(
    () => readBool(PREF_NOTIFICATION_SOUNDS, true)
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [savingNotificationKey, setSavingNotificationKey] = useState('');
  const [notificationPreferences, setNotificationPreferences] = useState(
    () => getCachedPreferences().notification_preferences
  );

  useEffect(() => {
    let active = true;

    hydratePreferences().then((preferences) => {
      if (!active) return;
      setNotificationPreferences(preferences.notification_preferences);
      setPreferencesReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  const handleNotificationSounds = (value) => {
    localStorage.setItem(PREF_NOTIFICATION_SOUNDS, String(value));
    setNotificationSounds(value);
  };

  const handleNotificationPreferenceChange = async (key, value) => {
    const nextPreferences = {
      ...notificationPreferences,
      [key]: value,
    };

    setNotificationPreferences(nextPreferences);
    setSavingNotificationKey(key);

    try {
      const saved = await updatePreferences({
        notification_preferences: nextPreferences,
      });
      setNotificationPreferences(saved.notification_preferences);
    } catch (error) {
      setNotificationPreferences(getCachedPreferences().notification_preferences);
      addToast(error.message || 'Failed to update notification settings.', 'error');
    } finally {
      setSavingNotificationKey('');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Push Notifications</CardTitle>
          <CardDescription>Choose which alerts should reach your mobile app.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border/50 px-4 pb-4 sm:px-6 sm:pb-6">
          {!preferencesReady ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading notification settings...
            </div>
          ) : (
            NOTIFICATION_OPTIONS.map((option) => (
              <PreferenceRow
                key={option.key}
                id={`pref-notify-${option.key}`}
                label={option.label}
                description={option.description}
                checked={notificationPreferences?.[option.key] !== false}
                onChange={(value) => handleNotificationPreferenceChange(option.key, value)}
                disabled={savingNotificationKey === option.key}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Notifications</CardTitle>
          <CardDescription>Control sound and alert preferences.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border/50 px-4 pb-4 sm:px-6 sm:pb-6">
          <PreferenceRow
            id="pref-notification-sounds"
            label="Notification Sounds"
            description="Play a sound when you receive new messages."
            checked={notificationSounds}
            onChange={handleNotificationSounds}
          />
        </CardContent>
      </Card>

    </div>
  );
}
