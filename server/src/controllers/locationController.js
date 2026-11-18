const { supabaseAdmin } = require('../services/supabase');
const config = require('../config');

/**
 * Helper: verify event exists and user is a room member.
 * Returns { event, membership } on success or sends an error response and returns null.
 */
async function verifyEventMembership(req, res, eventId, userId) {
  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  const { data: membership } = await supabaseAdmin
    .from('room_members')
    .select('id, role')
    .eq('room_id', event.room_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this room' });
    return null;
  }

  return { event, membership };
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function getStaleCutoff() {
  return new Date(
    Date.now() - config.location.staleSessionMinutes * 60 * 1000
  ).toISOString();
}

function buildSessionResponse(session) {
  return {
    ...session,
    session,
    is_sharing: session.status !== 'stopped',
    stale_after_minutes: config.location.staleSessionMinutes,
  };
}

function validateLocationSharingEnabled(event) {
  return !!event.enable_location_sharing;
}

/**
 * POST /events/:eventId/location/start
 * Start sharing location for an event. Creates a location session.
 */
async function startSharing(req, res, next) {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const result = await verifyEventMembership(req, res, eventId, userId);
    if (!result) return;
    const { event } = result;

    if (!validateLocationSharingEnabled(event)) {
      return res.status(400).json({
        error: 'Location sharing is not enabled for this event',
      });
    }

    const now = getCurrentTimestamp();

    const { data: existingSession } = await supabaseAdmin
      .from('location_sessions')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingSession) {
      const { data, error } = await supabaseAdmin
        .from('location_sessions')
        .update({
          latitude: null,
          longitude: null,
          status: config.location.defaultStatus,
          updated_at: now,
        })
        .eq('id', existingSession.id)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.json(buildSessionResponse(data));
    }

    const { data, error } = await supabaseAdmin
      .from('location_sessions')
      .insert({
        event_id: eventId,
        user_id: userId,
        latitude: null,
        longitude: null,
        status: config.location.defaultStatus,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json(buildSessionResponse(data));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /events/:eventId/location/update
 * Update the user's current location for an event.
 */
async function updateLocation(req, res, next) {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;
    const { latitude, longitude, status } = req.body;

    // Verify membership before allowing update
    const result = await verifyEventMembership(req, res, eventId, userId);
    if (!result) return;
    const { event } = result;

    if (!validateLocationSharingEnabled(event)) {
      return res.status(400).json({
        error: 'Location sharing is not enabled for this event',
      });
    }

    const now = getCurrentTimestamp();

    const updates = {
      latitude,
      longitude,
      updated_at: now,
    };

    if (status) {
      updates.status = status;
    }

    const { data, error } = await supabaseAdmin
      .from('location_sessions')
      .update(updates)
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .neq('status', 'stopped')
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'No active location session found. Start sharing first.',
      });
    }

    res.json(buildSessionResponse(data));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /events/:eventId/location/stop
 * Stop sharing location for an event.
 */
async function stopSharing(req, res, next) {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const result = await verifyEventMembership(req, res, eventId, userId);
    if (!result) return;

    const now = getCurrentTimestamp();

    const { data, error } = await supabaseAdmin
      .from('location_sessions')
      .update({
        status: 'stopped',
        updated_at: now,
      })
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .neq('status', 'stopped')
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'No active location session found',
      });
    }

    res.json({
      message: 'Location sharing stopped',
      ...buildSessionResponse(data),
      is_sharing: false,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /events/:eventId/location-status
 * Get all location sessions for an event (all members sharing).
 */
async function getLocationStatus(req, res, next) {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const result = await verifyEventMembership(req, res, eventId, userId);
    if (!result) return;

    if (!validateLocationSharingEnabled(result.event)) {
      return res.json([]);
    }

    const staleCutoff = getStaleCutoff();

    const { data, error } = await supabaseAdmin
      .from('location_sessions')
      .select(`
        *,
        users:user_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('event_id', eventId)
      .neq('status', 'stopped')
      .gte('updated_at', staleCutoff)
      .order('updated_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(
      (data || []).map((session) => ({
        ...session,
        is_stale: false,
      }))
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  startSharing,
  updateLocation,
  stopSharing,
  getLocationStatus,
};
