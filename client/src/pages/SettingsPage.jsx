import React from 'react';
import { Settings } from 'lucide-react';
import ProfileSettings from '@/components/settings/ProfileSettings';
import PreferenceSettings from '@/components/settings/PreferenceSettings';
import PageTour from '@/components/PageTour';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
      <PageTour
        tourId="settings"
        steps={[
          {
            target: '[data-tour="settings-header"]',
            title: 'Settings',
            desc: 'This page controls your profile details and notification preferences.',
            position: 'bottom',
          },
          {
            target: '[data-tour="settings-profile"]',
            title: 'Profile',
            desc: 'Update your photo, academic info, and identity details here.',
            position: 'bottom',
          },
          {
            target: '[data-tour="settings-preferences"]',
            title: 'Preferences',
            desc: 'Choose what alerts and badges you want across desktop web and the PWA app.',
            position: 'top',
          },
        ]}
      />
      <div data-tour="settings-header" className="mb-5 flex items-center gap-2.5 sm:mb-6">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      <div className="space-y-4 sm:space-y-5">
        <div data-tour="settings-profile">
          <ProfileSettings />
        </div>
        <div data-tour="settings-preferences">
          <PreferenceSettings />
        </div>
      </div>
    </div>
  );
}
