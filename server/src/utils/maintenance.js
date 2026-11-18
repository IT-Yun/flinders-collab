const { supabaseAdmin } = require('../services/supabase');

// Adelaide time is UTC+10:30 (ACDT during daylight saving)
// Schedule maintenance at 3:00 AM ACDT = 16:30 UTC (previous day)
const MAINTENANCE_HOUR_UTC = 16;
const MAINTENANCE_MINUTE_UTC = 30;
const NOTIFY_MINUTES_BEFORE = 10;

let io = null;
let maintenanceTimer = null;
let notifyTimer = null;
let nextMaintenanceTime = null;

function setIO(socketIO) {
  io = socketIO;
}

function getNextMaintenanceTime() {
  return nextMaintenanceTime;
}

/**
 * Clean up stale/old data from the database.
 */
async function runOptimization() {
  const results = [];
  const start = Date.now();

  try {
    // 1. Clean up expired location sessions (older than 24h)
    const { count: locationCount } = await supabaseAdmin
      .from('location_sessions')
      .delete({ count: 'exact' })
      .eq('status', 'stopped')
      .lt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    results.push(`Stale location sessions: ${locationCount || 0} removed`);
  } catch (err) {
    results.push(`Location cleanup failed: ${err.message}`);
  }

  try {
    // 2. Hide stale campus presence (older than 8 hours) — don't delete, just disable
    const { count: presenceCount } = await supabaseAdmin
      .from('flinders_campus_presence')
      .update({ sharing_enabled: false })
      .eq('sharing_enabled', true)
      .lt('updated_at', new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString());
    results.push(`Stale campus presence hidden: ${presenceCount || 0}`);
  } catch (err) {
    results.push(`Presence cleanup failed: ${err.message}`);
  }

  // System messages (join/leave/upload history) are kept permanently — they're part of room history

  try {
    // 3. Clean up resolved alerts from monitor (in-memory, no DB)
    // This is handled by monitor.js already
    results.push('Monitor alerts: auto-managed');
  } catch {
    // skip
  }

  try {
    // 4. Vacuum analyze via direct SQL if available
    const config = require('../config');
    if (config.databaseUrl) {
      try {
        const { Client } = require('pg');
        const client = new Client({
          connectionString: config.databaseUrl,
          ssl: { rejectUnauthorized: false },
        });
        await client.connect();
        await client.query('ANALYZE');
        await client.end();
        results.push('DB ANALYZE: completed');
      } catch (err) {
        results.push(`DB ANALYZE skipped: ${err.message}`);
      }
    }
  } catch {
    // skip
  }

  const duration = Date.now() - start;
  console.log(`[maintenance] Optimization completed in ${duration}ms:`, results);

  // Notify clients that maintenance is done
  if (io) {
    io.emit('maintenance:done', {
      duration,
      results,
      timestamp: new Date().toISOString(),
    });
  }

  return { duration, results };
}

/**
 * Schedule the next maintenance window.
 */
function scheduleNext() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(MAINTENANCE_HOUR_UTC, MAINTENANCE_MINUTE_UTC, 0, 0);

  // If we've already passed today's time, schedule for tomorrow
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  nextMaintenanceTime = next;

  const msUntilMaintenance = next.getTime() - now.getTime();
  const msUntilNotify = msUntilMaintenance - (NOTIFY_MINUTES_BEFORE * 60 * 1000);

  // Clear existing timers
  if (maintenanceTimer) clearTimeout(maintenanceTimer);
  if (notifyTimer) clearTimeout(notifyTimer);

  // Schedule notification before maintenance
  if (msUntilNotify > 0) {
    notifyTimer = setTimeout(() => {
      if (io) {
        io.emit('maintenance:upcoming', {
          startsAt: next.toISOString(),
          minutesUntil: NOTIFY_MINUTES_BEFORE,
          estimatedDuration: '1-2 minutes',
        });
      }
      console.log(`[maintenance] Notified users: maintenance in ${NOTIFY_MINUTES_BEFORE} minutes`);
    }, msUntilNotify);
  }

  // Schedule the actual maintenance
  maintenanceTimer = setTimeout(async () => {
    if (io) {
      io.emit('maintenance:started', {
        timestamp: new Date().toISOString(),
        estimatedDuration: '1-2 minutes',
      });
    }
    console.log('[maintenance] Starting scheduled optimization...');

    try {
      await runOptimization();
    } catch (err) {
      console.error('[maintenance] Optimization failed:', err.message);
    }

    // Schedule the next one
    scheduleNext();
  }, msUntilMaintenance);

  console.log(`[maintenance] Next optimization scheduled for ${next.toISOString()} (in ${Math.round(msUntilMaintenance / 60000)} minutes)`);
}

/**
 * Start the maintenance scheduler.
 */
function startMaintenance(socketIO) {
  setIO(socketIO);
  scheduleNext();
}

module.exports = {
  startMaintenance,
  runOptimization,
  getNextMaintenanceTime,
};
