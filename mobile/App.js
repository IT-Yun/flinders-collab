import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';
import { supabase } from './src/lib/supabase';

export default function App() {
  const loadSession = useAuthStore((s) => s.loadSession);
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    // Load any persisted session from AsyncStorage on mount
    loadSession();

    // Listen for Supabase auth state changes (e.g. token refresh, sign-out)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, supabaseSession) => {
        if (event === 'SIGNED_OUT' || !supabaseSession) {
          setSession(null, null);
        }
        // SIGNED_IN / TOKEN_REFRESHED are handled by the auth store actions
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#003366" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
