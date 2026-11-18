const { supabaseAdmin } = require('../services/supabase');
const { notifyUsers } = require('../controllers/pushController');

const REMINDER_TZ = 'Australia/Adelaide';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let reminderTimer = null;

function formatLocalDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REMINDER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getDaysUntil(eventDate, nowDate) {
  const start = new Date(`${formatLocalDate(nowDate)}T00:00:00`);
  const end = new Date(`${formatLocalDate(eventDate)}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

async function runDeadlineReminders() {
  const now = new Date();
  const currentReminderDate = formatLocalDate(now);
  const rangeEnd = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString();

  const { data: events, error: eventsError } = await supabaseAdmin
    .from('events')
    .select('id, room_id, title, start_time, category')
    .gte('start_time', now.toISOString())
    .lt('start_time', rangeEnd)
    .order('start_time', { ascending: true });

  if (eventsError) {
    console.log('[deadline-reminders] Failed to load events:', eventsError.message);
    return;
  }

  const targetEvents = (events || []).filter((event) => {
    const daysUntil = getDaysUntil(new Date(event.start_time), now);
    return daysUntil === 1 || daysUntil === 2 || String(event.category || '').toLowerCase() === 'deadline';
  }).map((event) => ({
    ...event,
    daysUntil: getDaysUntil(new Date(event.start_time), now),
  })).filter((event) => event.daysUntil === 1 || event.daysUntil === 2);

  if (targetEvents.length === 0) return;

  const roomIds = [...new Set(targetEvents.map((event) => event.room_id))];
  const eventIds = targetEvents.map((event) => event.id);

  const [{ data: memberships, error: memberError }, { data: existing, error: existingError }] = await Promise.all([
    supabaseAdmin
      .from('room_members')
      .select('room_id, user_id')
      .in('room_id', roomIds),
    supabaseAdmin
      .from('deadline_reminders')
      .select('event_id, user_id, reminder_date')
      .eq('reminder_date', currentReminderDate)
      .in('event_id', eventIds),
  ]);

  if (memberError) {
    console.log('[deadline-reminders] Failed to load room memberships:', memberError.message);
    return;
  }

  if (existingError) {
    console.log('[deadline-reminders] Failed to load reminder ledger:', existingError.message);
    return;
  }

  const membersByRoom = new Map();
  (memberships || []).forEach((membership) => {
    if (!membersByRoom.has(membership.room_id)) {
      membersByRoom.set(membership.room_id, []);
    }
    membersByRoom.get(membership.room_id).push(membership.user_id);
  });

  const existingKeys = new Set(
    (existing || []).map((row) => `${row.event_id}:${row.user_id}:${row.reminder_date}`)
  );

  const insertRows = [];
  const notifications = [];

  targetEvents.forEach((event) => {
    const userIds = membersByRoom.get(event.room_id) || [];
    if (userIds.length === 0) return;

    const freshUserIds = userIds.filter((userId) => {
      const key = `${event.id}:${userId}:${currentReminderDate}`;
      if (existingKeys.has(key)) return false;
      insertRows.push({
        event_id: event.id,
        user_id: userId,
        reminder_date: currentReminderDate,
      });
      return true;
    });

    if (freshUserIds.length > 0) {
      notifications.push({
        event,
        userIds: freshUserIds,
      });
    }
  });

  if (insertRows.length === 0) return;

  const { error: insertError } = await supabaseAdmin
    .from('deadline_reminders')
    .insert(insertRows);

  if (insertError) {
    console.log('[deadline-reminders] Failed to write reminder ledger:', insertError.message);
    return;
  }

  await Promise.allSettled(notifications.map(({ event, userIds }) => {
    const title = event.daysUntil === 1 ? 'Deadline Tomorrow' : 'Deadline in 2 Days';
    return notifyUsers(userIds, {
      type: 'schedule',
      title,
      body: event.title || 'Upcoming deadline reminder',
      tag: `deadline-${event.id}-${currentReminderDate}`,
      badgeCount: 1,
      data: { url: '/deadlines' },
    });
  }));

  console.log(`[deadline-reminders] Sent ${notifications.length} reminder batches for ${currentReminderDate}`);
}

function startDeadlineReminderScheduler() {
  if (reminderTimer) clearInterval(reminderTimer);

  runDeadlineReminders().catch((err) => {
    console.log('[deadline-reminders] Initial run failed:', err.message);
  });

  reminderTimer = setInterval(() => {
    runDeadlineReminders().catch((err) => {
      console.log('[deadline-reminders] Scheduled run failed:', err.message);
    });
  }, CHECK_INTERVAL_MS);

  reminderTimer.unref?.();
}

module.exports = {
  startDeadlineReminderScheduler,
  runDeadlineReminders,
};
