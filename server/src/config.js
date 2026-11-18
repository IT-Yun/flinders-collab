const dotenv = require('dotenv');
const path = require('path');

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  databaseUrl: process.env.DATABASE_URL,
  supabaseAccessToken: process.env.SUPABASE_ACCESS_TOKEN,
  supabaseProjectRef: process.env.SUPABASE_PROJECT_REF,
  jwtSecret: process.env.JWT_SECRET,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  security: {
    allowTesterMode: process.env.ALLOW_TESTER_MODE === 'true' || (process.env.NODE_ENV || 'development') !== 'production',
  },
  upload: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
      'application/zip',
      'application/x-zip-compressed',
      'text/plain',
    ],
    storageBucket: 'room-files',
    backupBucket: 'room-files-backup',
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'https://github.com/IT-Yun/flinders-collab',
  },
  location: {
    // Sessions older than this (in minutes) are considered stale
    staleSessionMinutes: 30,
    defaultStatus: 'on_the_way',
  },
};

module.exports = config;
