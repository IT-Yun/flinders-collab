// API and Supabase configuration
// In production, these would be set via EAS secrets / Expo env vars

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  'https://flinders-collab-id3a.onrender.com';

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://hxofymycvvnouevcfsxn.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_roO7QTtZ-PaFYj7XXTAbFw_wBMFnqge';
