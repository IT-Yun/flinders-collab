const { supabaseAdmin } = require('../services/supabase');
const { notifyRoom } = require('./pushController');

function normalizeOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeOptionalBoolean(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function validateEventPayload({ startTime, endTime, enableLocationSharing, locationName }) {
  const start = new Date(startTime);

  if (Number.isNaN(start.getTime())) {
    return 'Valid start time is required';
  }

  if (endTime !== undefined && endTime !== null && endTime !== '') {
    const end = new Date(endTime);

    if (Number.isNaN(end.getTime())) {
      return 'Valid end time is required';
    }

    if (end <= start) {
      return 'End time must be after start time';
    }
  }

  if (enableLocationSharing === null) {
    return 'enable_location_sharing must be true or false';
  }

  if (enableLocationSharing && !locationName) {
    return 'Location name is required when location sharing is enabled';
  }

  return null;
}

/**
 * POST /rooms/:roomId/events
 * Create a new event in a room.
 */
async function createEvent(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const {
      title,
      description,
      category,
      location_name,
      start_time,
      end_time,
      enable_location_sharing,
    } = req.body;

    const normalizedLocationName = normalizeOptionalText(location_name);
    const normalizedDescription = normalizeOptionalText(description);
    const normalizedCategory = normalizeOptionalText(category);
    const normalizedLocationSharing = normalizeOptionalBoolean(enable_location_sharing);
    const validationError = validateEventPayload({
      startTime: start_time,
      endTime: end_time,
      enableLocationSharing: normalizedLocationSharing === undefined ? false : normalizedLocationSharing,
      locationName: normalizedLocationName,
    });

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const insertObj = {
      room_id: roomId,
      title,
      description: normalizedDescription || null,
      location_name: normalizedLocationName || null,
      start_time,
      end_time,
      created_by: userId,
      enable_location_sharing: normalizedLocationSharing === undefined
        ? false
        : normalizedLocationSharing,
    };
    if (normalizedCategory) insertObj.category = normalizedCategory;

    let { data, error } = await supabaseAdmin
      .from('events')
      .insert(insertObj)
      .select()
      .single();

    // If category column doesn't exist yet, retry without it
    if (error && error.message?.includes('category')) {
      delete insertObj.category;
      const retry = await supabaseAdmin
        .from('events')
        .insert(insertObj)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
      if (data) data.category = normalizedCategory || 'other';
    }

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json(data);

    notifyRoom(req.params.roomId, req.user.id, {
      type: 'schedule',
      title: 'New Event',
      body: data.title || 'A new event was created',
      tag: `event-${req.params.roomId}`,
      data: { url: `/rooms/${req.params.roomId}` },
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
}

/**
 * GET /rooms/:roomId/events
 * List all events in a room, optionally filtered by date range.
 */
async function getEvents(req, res, next) {
  try {
    const { roomId } = req.params;
    const { from, to } = req.query;

    let query = supabaseAdmin
      .from('events')
      .select('*')
      .eq('room_id', roomId)
      .order('start_time', { ascending: true });

    if (from) {
      query = query.gte('start_time', from);
    }
    if (to) {
      query = query.lte('start_time', to);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /events/upcoming-count
 * Count upcoming events across all rooms the current user belongs to.
 */
async function getUpcomingEventCount(req, res, next) {
  try {
    const userId = req.user.id;
    const now = new Date().toISOString();

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId);

    if (membershipError) {
      return res.status(400).json({ error: membershipError.message });
    }

    const roomIds = (memberships || []).map((membership) => membership.room_id).filter(Boolean);
    if (roomIds.length === 0) {
      return res.json({ count: 0 });
    }

    const { count, error } = await supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .in('room_id', roomIds)
      .gt('start_time', now);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ count: count || 0 });
  } catch (err) {
    next(err);
  }
}

async function getUpcomingEvents(req, res, next) {
  try {
    const userId = req.user.id;
    const now = new Date().toISOString();
    const normalizedCategory = String(req.query.category || '').trim().toLowerCase();
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 200;

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from('room_members')
      .select('room_id, rooms(name)')
      .eq('user_id', userId);

    if (membershipError) {
      return res.status(400).json({ error: membershipError.message });
    }

    const rooms = memberships || [];
    const roomIds = rooms.map((membership) => membership.room_id).filter(Boolean);
    if (roomIds.length === 0) {
      return res.json({ events: [] });
    }

    let query = supabaseAdmin
      .from('events')
      .select('id, room_id, title, description, category, location_name, start_time, end_time, enable_location_sharing')
      .in('room_id', roomIds)
      .gt('start_time', now)
      .order('start_time', { ascending: true })
      .limit(limit);

    if (normalizedCategory) {
      query = query.eq('category', normalizedCategory);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const roomNameById = new Map(
      rooms.map((membership) => [membership.room_id, membership.rooms?.name || 'Room'])
    );

    res.json({
      events: (data || []).map((event) => ({
        ...event,
        room_name: roomNameById.get(event.room_id) || 'Room',
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /events/:eventId
 * Update an existing event. Only owner/admin or event creator can update.
 */
async function updateEvent(req, res, next) {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Fetch the event to check ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is the creator or has admin/owner role on the room
    const { data: membership } = await supabaseAdmin
      .from('room_members')
      .select('role')
      .eq('room_id', existing.room_id)
      .eq('user_id', userId)
      .single();

    const isCreator = existing.created_by === userId;
    const isAdmin =
      membership && (membership.role === 'owner' || membership.role === 'admin');

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        error: 'Only the event creator or room admin can update this event',
      });
    }

    // Build update object from allowed fields
    const updates = {};
    const normalizedBoolean = normalizeOptionalBoolean(req.body.enable_location_sharing);
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.description !== undefined) {
      updates.description = normalizeOptionalText(req.body.description);
    }
    if (req.body.category !== undefined) {
      updates.category = normalizeOptionalText(req.body.category);
    }
    if (req.body.location_name !== undefined) {
      updates.location_name = normalizeOptionalText(req.body.location_name);
    }
    if (req.body.start_time !== undefined) updates.start_time = req.body.start_time;
    if (req.body.end_time !== undefined) updates.end_time = req.body.end_time || null;
    if (req.body.enable_location_sharing !== undefined) {
      updates.enable_location_sharing = normalizedBoolean;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid event fields were provided for update',
      });
    }

    const effectiveStart = updates.start_time || existing.start_time;
    const effectiveEnd = updates.end_time !== undefined ? updates.end_time : existing.end_time;
    const effectiveLocationSharing =
      updates.enable_location_sharing !== undefined
        ? updates.enable_location_sharing
        : existing.enable_location_sharing;
    const effectiveLocationName =
      updates.location_name !== undefined
        ? updates.location_name
        : existing.location_name;
    const validationError = validateEventPayload({
      startTime: effectiveStart,
      endTime: effectiveEnd,
      enableLocationSharing: effectiveLocationSharing,
      locationName: effectiveLocationName,
    });

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    let { data, error } = await supabaseAdmin
      .from('events')
      .update(updates)
      .eq('id', eventId)
      .select()
      .single();

    // If category column doesn't exist yet, retry without it
    if (error && error.message?.includes('category')) {
      const savedCat = updates.category;
      delete updates.category;
      const retry = await supabaseAdmin
        .from('events')
        .update(updates)
        .eq('id', eventId)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
      if (data && savedCat) data.category = savedCat;
    }

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /events/:eventId
 * Delete an event. Only owner/admin or event creator can delete.
 */
async function deleteEvent(req, res, next) {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check permissions
    const { data: membership } = await supabaseAdmin
      .from('room_members')
      .select('role')
      .eq('room_id', existing.room_id)
      .eq('user_id', userId)
      .single();

    const isCreator = existing.created_by === userId;
    const isAdmin =
      membership && (membership.role === 'owner' || membership.role === 'admin');

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        error: 'Only the event creator or room admin can delete this event',
      });
    }

    const { error } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('id', eventId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createEvent,
  getEvents,
  getUpcomingEventCount,
  getUpcomingEvents,
  updateEvent,
  deleteEvent,
};
