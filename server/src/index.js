const express = require('express');
const http = require('http');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const { initSockets } = require('./sockets');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const monitorMiddleware = require('./middleware/monitorMiddleware');
const monitor = require('./utils/monitor');

// Import routes
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const eventRoutes = require('./routes/events');
const fileRoutes = require('./routes/files');
const locationRoutes = require('./routes/location');
const messageRoutes = require('./routes/messages');
const taskRoutes = require('./routes/tasks');
const reportRoutes = require('./routes/reports');
const boardRoutes = require('./routes/board');
const flindersRoutes = require('./routes/flinders');
const announcementRoutes = require('./routes/announcements');
const adminRoutes = require('./routes/admin');
const pushRoutes = require('./routes/push');
const timetableRoutes = require('./routes/timetable');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = initSockets(server);

// Make io accessible in routes if needed
app.set('io', io);

// Trust proxy — required on Render so rate limiters see real client IPs
app.set('trust proxy', 1);

// Global middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
    },
  },
}));
app.use(cors({
  origin: config.clientUrl.includes(',')
    ? config.clientUrl.split(',').map(url => url.trim())
    : config.clientUrl,
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Monitor middleware — must be before route handlers
app.use(monitorMiddleware);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public active announcements endpoint (no auth required)
app.get('/api/announcements/active', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./services/supabase');
    const { data, error } = await supabaseAdmin
      .from('admin_announcements')
      .select('id, title, content, type, created_at, expires_at')
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) return res.json([]);
    res.json(data || []);
  } catch { res.json([]); }
});

// Public maintenance schedule endpoint
app.get('/api/maintenance/schedule', (req, res) => {
  const { getNextMaintenanceTime } = require('./utils/maintenance');
  const next = getNextMaintenanceTime();
  res.json({ nextMaintenanceTime: next ? next.toISOString() : null });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api', eventRoutes);
app.use('/api', fileRoutes);
app.use('/api', locationRoutes);
app.use('/api', messageRoutes);
app.use('/api', taskRoutes);
app.use('/api', reportRoutes);
app.use('/api', boardRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api', flindersRoutes);
app.use('/api', announcementRoutes);
app.use('/api/admin', adminRoutes);

// Serve built client in production
const path = require('path');
const clientDist = path.resolve(__dirname, '../../client/dist');
if (config.nodeEnv === 'production') {
  app.use(
    '/assets',
    express.static(path.join(clientDist, 'assets'), {
      maxAge: '1y',
      immutable: true,
    })
  );
  app.get('/sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(clientDist, 'sw.js'));
  });
  app.get('/manifest.json', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDist, 'manifest.json'));
  });
  app.use(
    express.static(clientDist, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    })
  );
  // SPA fallback — any non-API route serves index.html
  app.get(/^\/(?!api).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Run migrations on startup
const { runMigration } = require('./utils/migrate');
runMigration().catch(() => {});

// Start server
const PORT = config.port;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${config.nodeEnv} mode`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  // Start 24/7 server monitoring (health checks, memory alerts, error rate tracking)
  monitor.startHealthChecks();

  // Start nightly DB maintenance scheduler
  const { startMaintenance } = require('./utils/maintenance');
  startMaintenance(io);

  // Start daily Flinders event crawler (runs immediately, then every 24h)
  const { startEventCrawler } = require('./utils/eventCrawler');
  startEventCrawler();

  // Start weekly Flinders topic crawler (handbook → DB, runs on boot + weekly)
  const { startTopicCrawler } = require('./utils/topicCrawler');
  startTopicCrawler();

  // Start deadline reminder scheduler (runs immediately, then hourly with per-day dedupe)
  const { startDeadlineReminderScheduler } = require('./utils/deadlineReminders');
  startDeadlineReminderScheduler();

  // Keep-alive ping to prevent Render free tier from sleeping
  if (config.nodeEnv === 'production') {
    const PING_URL = process.env.RENDER_EXTERNAL_URL || 'https://flinders-collab-id3a.onrender.com';
    setInterval(() => {
      const https = require('https');
      https.get(`${PING_URL}/api/health`, () => {}).on('error', () => {});
    }, 14 * 60 * 1000); // every 14 minutes
  }
});

module.exports = { app, server, io };
