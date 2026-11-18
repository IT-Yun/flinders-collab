const { supabaseAdmin } = require('../services/supabase');

// Map API paths + methods to human-readable action descriptions
const ACTION_MAP = {
  'POST /api/rooms/:roomId/tasks': 'Create task',
  'PATCH /api/rooms/:roomId/tasks/:taskId': 'Update task',
  'DELETE /api/rooms/:roomId/tasks/:taskId': 'Delete task',
  'PATCH /api/rooms/:roomId/tasks/:taskId/assignees/:userId': 'Update task status',
  'POST /api/rooms/:roomId/tasks/:taskId/assignees': 'Add task assignee',
  'GET /api/rooms/:roomId/tasks': 'List tasks',
  'POST /api/rooms/:roomId/files': 'Upload file',
  'DELETE /api/rooms/:roomId/files/:fileId': 'Delete file',
  'GET /api/rooms/:roomId/files': 'List files',
  'POST /api/rooms': 'Create room',
  'DELETE /api/rooms/:roomId': 'Delete room',
  'PATCH /api/rooms/:roomId': 'Update room',
  'POST /api/rooms/:roomId/join': 'Join room',
  'POST /api/rooms/:roomId/events': 'Create event',
  'PATCH /api/rooms/:roomId/events/:eventId': 'Update event',
  'DELETE /api/rooms/:roomId/events/:eventId': 'Delete event',
  'GET /api/rooms/:roomId/events': 'List events',
  'POST /api/auth/signup': 'Sign up',
  'POST /api/auth/login': 'Log in',
  'POST /api/rooms/:roomId/chat': 'Send message',
  'POST /api/reports': 'Submit report',
  'POST /api/rooms/:roomId/location': 'Share location',
  'GET /api/rooms/:roomId/members': 'List members',
};

// Pre-compile regexes at module load time (avoid re-creating on every request)
const COMPILED_ACTIONS = Object.entries(ACTION_MAP).map(([pattern, label]) => {
  const [method, path] = pattern.split(' ');
  const regex = new RegExp('^' + path.replace(/:[^/]+/g, '[^/]+') + '(\\?.*)?$');
  return { method, regex, label };
});

function matchAction(method, path) {
  for (const entry of COMPILED_ACTIONS) {
    if (method !== entry.method) continue;
    if (entry.regex.test(path)) return entry.label;
  }
  return null;
}

class ServerMonitor {
  constructor() {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.recentErrors = []; // last 50
    this.userErrors = []; // last 50 user-friendly error log
    this.slowRequests = []; // last 20, >2s response time
    this.statusCodes = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.responseTimes = []; // last 1000 entries {time, duration, path}
    this.requestsPerMinute = []; // last 10 minutes [{minute, count}]
    this.alerts = []; // active alerts
    this.healthChecks = { supabase: null, lastCheck: null };
    this.storageUsage = null; // { used, total, buckets, lastCheck }
    this.requestLog = []; // last 100 requests for activity feed
    this._alertIdCounter = 0;
  }

  /**
   * Record a completed request with its response info and duration.
   */
  recordRequest(req, res, duration) {
    this.totalRequests++;

    // Status code distribution
    const status = res.statusCode;
    if (status >= 200 && status < 300) this.statusCodes['2xx']++;
    else if (status >= 300 && status < 400) this.statusCodes['3xx']++;
    else if (status >= 400 && status < 500) this.statusCodes['4xx']++;
    else if (status >= 500) this.statusCodes['5xx']++;

    // Count errors
    if (status >= 400) {
      this.totalErrors++;
    }

    // Response time tracking (keep last 1000)
    const now = Date.now();
    this.responseTimes.push({
      time: now,
      duration,
      path: req.originalUrl || req.url,
      method: req.method,
      status,
    });
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }

    // Slow requests (>2s, keep last 20)
    if (duration > 2000) {
      this.slowRequests.push({
        path: req.originalUrl || req.url,
        method: req.method,
        duration,
        status,
        timestamp: new Date(now).toISOString(),
      });
      if (this.slowRequests.length > 20) {
        this.slowRequests = this.slowRequests.slice(-20);
      }
    }

    // Request log (keep last 100)
    const userName = req.user?.full_name || req.user?.email || null;
    const userId = req.user?.id || null;
    this.requestLog.push({
      method: req.method,
      path: req.originalUrl || req.url,
      status,
      duration,
      timestamp: new Date(now).toISOString(),
      ip: req.ip,
      userName,
    });
    if (this.requestLog.length > 100) {
      this.requestLog = this.requestLog.slice(-100);
    }

    // Track user-facing errors (4xx/5xx) with friendly descriptions
    if (status >= 400 && userName) {
      const action = matchAction(req.method, req.originalUrl || req.url);
      if (action) {
        this.userErrors.push({
          userName,
          userId,
          action,
          statusCode: status,
          errorMessage: res._responseBody?.error || null,
          path: req.originalUrl || req.url,
          method: req.method,
          timestamp: new Date(now).toISOString(),
        });
        if (this.userErrors.length > 50) {
          this.userErrors = this.userErrors.slice(-50);
        }
      }
    }

    // Requests per minute tracking (rolling 10 minutes)
    this._updateRequestsPerMinute(now);
  }

  /**
   * Update the requests-per-minute rolling window.
   */
  _updateRequestsPerMinute(now) {
    const currentMinute = Math.floor(now / 60000);

    // Find or create entry for current minute
    const last = this.requestsPerMinute[this.requestsPerMinute.length - 1];
    if (last && last.minute === currentMinute) {
      last.count++;
    } else {
      this.requestsPerMinute.push({ minute: currentMinute, count: 1 });
    }

    // Keep only last 10 minutes
    const cutoff = currentMinute - 10;
    this.requestsPerMinute = this.requestsPerMinute.filter(
      (entry) => entry.minute >= cutoff
    );
  }

  /**
   * Record an error that occurred during request processing.
   */
  recordError(err, req) {
    const userName = req?.user?.full_name || req?.user?.email || null;
    const userId = req?.user?.id || null;
    const path = req ? (req.originalUrl || req.url) : 'unknown';
    const method = req ? req.method : 'unknown';

    this.recentErrors.push({
      message: err.message || 'Unknown error',
      stack: err.stack || '',
      path,
      method,
      statusCode: err.statusCode || 500,
      timestamp: new Date().toISOString(),
      userName,
      userId,
    });

    // Keep only last 50 errors
    if (this.recentErrors.length > 50) {
      this.recentErrors = this.recentErrors.slice(-50);
    }

    // Also add to user-friendly error log
    if (userName) {
      const action = matchAction(method, path);
      this.userErrors.push({
        userName,
        userId,
        action: action || `${method} ${path}`,
        statusCode: err.statusCode || 500,
        errorMessage: err.message || 'Unknown error',
        path,
        method,
        timestamp: new Date().toISOString(),
      });
      if (this.userErrors.length > 50) {
        this.userErrors = this.userErrors.slice(-50);
      }
    }
  }

  /**
   * Add an alert.
   * @param {string} type - Alert type (e.g., 'memory', 'error_rate', 'health')
   * @param {string} message - Human-readable alert message
   * @param {'info'|'warning'|'critical'} severity
   */
  addAlert(type, message, severity = 'info') {
    // Don't duplicate active alerts of the same type
    const existing = this.alerts.find(
      (a) => a.type === type && !a.resolved
    );
    if (existing) {
      existing.message = message;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }

    this._alertIdCounter++;
    const alert = {
      id: this._alertIdCounter,
      type,
      message,
      severity,
      resolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.alerts.push(alert);

    // Keep alerts list manageable (last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    return alert;
  }

  /**
   * Resolve an alert by its ID.
   */
  resolveAlert(id) {
    const alert = this.alerts.find((a) => a.id === id);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      return alert;
    }
    return null;
  }

  /**
   * Check Supabase connectivity (DB and storage).
   */
  async checkSupabaseHealth() {
    const result = { status: 'unhealthy', db: false, timestamp: new Date().toISOString() };
    const start = Date.now();

    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .limit(1);

      result.responseTime = Date.now() - start;

      if (error) {
        result.db = false;
        result.error = error.message;
      } else {
        result.db = true;
        result.status = 'healthy';
      }
    } catch (err) {
      result.responseTime = Date.now() - start;
      result.db = false;
      result.error = err.message;
    }

    this.healthChecks.supabase = result;
    this.healthChecks.lastCheck = result.timestamp;

    // Alert if DB is down
    if (!result.db) {
      this.addAlert(
        'health_supabase',
        `Supabase DB check failed: ${result.dbError || 'Unknown error'}`,
        'critical'
      );
    } else {
      // Auto-resolve health alerts if everything is ok
      const existing = this.alerts.find(
        (a) => a.type === 'health_supabase' && !a.resolved
      );
      if (existing) {
        this.resolveAlert(existing.id);
      }
    }

    return result;
  }

  /**
   * Check Supabase storage usage via Management API or storage API.
   */
  async checkStorageUsage() {
    const result = { used: 0, total: 100 * 1024 * 1024 * 1024, buckets: [], lastCheck: new Date().toISOString() }; // 100GB Pro

    try {
      // List buckets
      const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();
      if (bucketsError || !buckets) {
        this.storageUsage = result;
        return result;
      }

      let totalUsed = 0;
      for (const bucket of buckets) {
        let bucketSize = 0;
        try {
          // List files in root
          const { data: files } = await supabaseAdmin.storage.from(bucket.name).list('', { limit: 1000 });
          if (files) {
            for (const file of files) {
              if (file.metadata?.size) {
                bucketSize += file.metadata.size;
              }
            }
            // Also check subdirectories (room folders)
            const folders = files.filter(f => !f.metadata);
            for (const folder of folders) {
              const { data: subFiles } = await supabaseAdmin.storage.from(bucket.name).list(folder.name, { limit: 1000 });
              if (subFiles) {
                for (const sf of subFiles) {
                  if (sf.metadata?.size) {
                    bucketSize += sf.metadata.size;
                  }
                }
              }
            }
          }
        } catch { /* skip bucket */ }

        totalUsed += bucketSize;
        result.buckets.push({
          name: bucket.name,
          size: bucketSize,
          public: bucket.public,
        });
      }

      result.used = totalUsed;
    } catch (err) {
      console.log('[monitor] Storage check failed:', err.message);
    }

    this.storageUsage = result;
    return result;
  }

  /**
   * Get all monitoring stats for the admin panel.
   */
  getStats() {
    const mem = process.memoryUsage();

    // Calculate average response time from last 100 entries
    const recentTimes = this.responseTimes.slice(-100);
    const avgResponseTime =
      recentTimes.length > 0
        ? recentTimes.reduce((sum, r) => sum + r.duration, 0) / recentTimes.length
        : 0;

    // Calculate error rate
    const errorRate =
      this.totalRequests > 0
        ? (this.totalErrors / this.totalRequests) * 100
        : 0;

    // Active alerts only
    const activeAlerts = this.alerts.filter((a) => !a.resolved);

    return {
      uptime: process.uptime(),
      uptimeFormatted: this._formatUptime(process.uptime()),
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers || 0,
        heapUsedPercent: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1),
      },
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      errorRate: errorRate.toFixed(2),
      avgResponseTime: Math.round(avgResponseTime),
      statusCodes: { ...this.statusCodes },
      recentErrors: this.recentErrors.slice(-10).reverse(),
      slowRequests: this.slowRequests.slice(-10).reverse(),
      requestsPerMinute: this.requestsPerMinute.slice(-10),
      alerts: activeAlerts,
      allAlerts: this.alerts.slice(-20).reverse(),
      health: { ...this.healthChecks },
      requestLog: this.requestLog.slice(-50).reverse(),
      serverStartTime: new Date(this.startTime).toISOString(),
      storage: this.storageUsage,
      userErrors: this.userErrors.slice(-20).reverse(),
    };
  }

  /**
   * Format uptime in human-readable form.
   */
  _formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Start periodic health checks and resource monitoring.
   */
  startHealthChecks() {
    // Initial Supabase health check + storage check
    this.checkSupabaseHealth();
    this.checkStorageUsage();

    // Check Supabase every 5 minutes
    this._healthInterval = setInterval(() => {
      this.checkSupabaseHealth();
    }, 5 * 60 * 1000);

    // Check storage every 30 minutes
    this._storageInterval = setInterval(() => {
      this.checkStorageUsage();
    }, 30 * 60 * 1000);

    // Check memory and error rate every minute
    this._memoryInterval = setInterval(() => {
      const mem = process.memoryUsage();
      const heapUsedPercent = (mem.heapUsed / mem.heapTotal) * 100;

      if (heapUsedPercent > 80) {
        this.addAlert(
          'memory',
          `High memory usage: ${heapUsedPercent.toFixed(1)}% heap used`,
          'warning'
        );
      } else {
        // Auto-resolve memory alert if usage dropped
        const existing = this.alerts.find(
          (a) => a.type === 'memory' && !a.resolved
        );
        if (existing) {
          this.resolveAlert(existing.id);
        }
      }

      // Check error rate in recent window (last 100 requests)
      if (this.totalRequests > 100) {
        const recentTimes = this.responseTimes.slice(-100);
        const recentErrors = recentTimes.filter((r) => r.status >= 500).length;
        const recentErrorRate = (recentErrors / recentTimes.length) * 100;

        if (recentErrorRate > 10) {
          this.addAlert(
            'error_rate',
            `High error rate: ${recentErrorRate.toFixed(1)}% of last 100 requests returned 5xx`,
            'critical'
          );
        } else {
          const existing = this.alerts.find(
            (a) => a.type === 'error_rate' && !a.resolved
          );
          if (existing) {
            this.resolveAlert(existing.id);
          }
        }
      }
    }, 60 * 1000);

    console.log('Server monitoring started (health checks every 5 min, resource checks every 1 min)');
  }

  /**
   * Stop all monitoring intervals (useful for testing).
   */
  stopHealthChecks() {
    if (this._healthInterval) clearInterval(this._healthInterval);
    if (this._memoryInterval) clearInterval(this._memoryInterval);
    if (this._storageInterval) clearInterval(this._storageInterval);
  }
}

// Singleton instance
const monitor = new ServerMonitor();

module.exports = monitor;
