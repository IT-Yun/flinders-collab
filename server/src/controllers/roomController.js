const { supabaseAdmin } = require('../services/supabase');

const QUICK_LINKS_TTL_MS = 60 * 1000;
const quickLinksCache = new Map();

function getFreshQuickLinks(roomId) {
  const entry = quickLinksCache.get(roomId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > QUICK_LINKS_TTL_MS) {
    quickLinksCache.delete(roomId);
    return null;
  }
  return entry.value;
}

function setQuickLinksCache(roomId, value) {
  quickLinksCache.set(roomId, { value, timestamp: Date.now() });
}
const { notifyRoom } = require('./pushController');

function normalizeInviteCode(inviteCode) {
  return String(inviteCode || '').trim().toUpperCase();
}

async function getRoomMemberCount(roomId) {
  const { count } = await supabaseAdmin
    .from('room_members')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId);

  return count || 0;
}

async function buildRoomResponse(room, userId, membership = null) {
  const memberCount = await getRoomMemberCount(room.id);
  const role = membership?.role || (room.owner_id === userId ? 'owner' : 'member');
  const joinedAt = membership?.joined_at || room.created_at;
  const lastVisitedAt = membership?.last_visited_at || null;

  return {
    ...room,
    my_role: role,
    joined_at: joinedAt,
    last_visited_at: lastVisitedAt,
    member_count: memberCount,
  };
}

/**
 * Generate a short invite code for room joining.
 * Uses an alphanumeric charset excluding visually ambiguous characters (0, O, 1, I).
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * POST /rooms
 * Create a new room and add the creator as owner.
 * Retries up to 3 times if invite code collides with an existing one.
 */
async function createRoom(req, res, next) {
  try {
    const { name, course_name, description } = req.body;
    const userId = req.user.id;

    const MAX_RETRIES = 3;
    let room = null;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const inviteCode = generateInviteCode();

      const { data, error: roomError } = await supabaseAdmin
        .from('rooms')
        .insert({
          name,
          course_name: course_name || null,
          description: description || null,
          owner_id: userId,
          invite_code: inviteCode,
        })
        .select()
        .single();

      if (roomError) {
        // Check for unique constraint violation on invite_code
        if (
          roomError.code === '23505' &&
          roomError.message.includes('invite_code')
        ) {
          lastError = roomError;
          continue; // retry with a new code
        }
        return res.status(400).json({ error: roomError.message });
      }

      room = data;
      break;
    }

    if (!room) {
      return res.status(500).json({
        error: 'Failed to generate a unique invite code. Please try again.',
      });
    }

    // Add creator as owner member
    const { error: memberError } = await supabaseAdmin
      .from('room_members')
      .insert({
        room_id: room.id,
        user_id: userId,
        role: 'owner',
        last_visited_at: new Date().toISOString(),
      });

    if (memberError) {
      console.error('Failed to add owner as member:', memberError.message);
    }

    res.status(201).json(await buildRoomResponse(room, userId, {
      role: 'owner',
      joined_at: room.created_at,
      last_visited_at: new Date().toISOString(),
    }));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /rooms
 * List all rooms the authenticated user is a member of.
 */
async function getRooms(req, res, next) {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('room_members')
      .select(`
        role,
        joined_at,
        last_visited_at,
        rooms (
          id,
          name,
          course_name,
          description,
          owner_id,
          invite_code,
          room_type,
          created_at
        )
      `)
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Get member counts for all rooms in a single query instead of N separate queries
    const roomIds = data.map((entry) => entry.rooms.id);
    const countMap = {};
    if (roomIds.length > 0) {
      const { data: memberRows } = await supabaseAdmin
        .from('room_members')
        .select('room_id')
        .in('room_id', roomIds);
      if (memberRows) {
        for (const row of memberRows) {
          countMap[row.room_id] = (countMap[row.room_id] || 0) + 1;
        }
      }
    }

    const topicLinkedRoomIds = new Set();
    if (roomIds.length > 0) {
      const { data: topicRoomRows } = await supabaseAdmin
        .from('topic_rooms')
        .select('room_id')
        .in('room_id', roomIds);
      (topicRoomRows || []).forEach((row) => {
        if (row?.room_id) topicLinkedRoomIds.add(row.room_id);
      });
    }

    const rooms = data.map((entry) => ({
      ...entry.rooms,
      my_role: entry.role,
      joined_at: entry.joined_at,
      last_visited_at: entry.last_visited_at || null,
      member_count: countMap[entry.rooms.id] || 0,
    })).filter((room) => {
      const isTopicRoom = room.room_type === 'topic'
        || topicLinkedRoomIds.has(room.id)
        || (
          room.owner_id == null
          && typeof room.description === 'string'
          && room.description.startsWith('Auto-created chat room for ')
        );

      return !isTopicRoom;
    });

    res.json(rooms);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /rooms/:roomId
 * Get details of a specific room.
 */
async function getRoom(req, res, next) {
  try {
    const { roomId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const memberCount = await getRoomMemberCount(roomId);
    res.json({ ...data, my_role: req.memberRole, member_count: memberCount });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /rooms/join
 * Join a room using only an invite code (no roomId required).
 */
async function joinRoomByCode(req, res, next) {
  try {
    const inviteCode = normalizeInviteCode(req.body.invite_code);
    const userId = req.user.id;

    // Look up room by invite code
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, name, course_name, description, owner_id, invite_code, created_at')
      .eq('invite_code', inviteCode)
      .maybeSingle();

    if (roomError || !room) {
      return res.status(404).json({ error: 'This invite code is invalid or has expired.' });
    }

    // Check if already a member
    const { data: existing } = await supabaseAdmin
      .from('room_members')
      .select('id, role, joined_at')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: 'You have already used this invite and are already in the room.',
        room: await buildRoomResponse(room, userId, existing),
      });
    }

    // Add as member
    const { data: membership, error: joinError } = await supabaseAdmin
      .from('room_members')
      .insert({
        room_id: room.id,
        user_id: userId,
        role: 'member',
        last_visited_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (joinError) {
      return res.status(400).json({ error: joinError.message });
    }

    res.status(201).json({
      message: 'Joined room successfully',
      room: await buildRoomResponse(room, userId, membership),
      membership,
    });

    notifyRoom(room.id, userId, {
      type: 'room_updates',
      title: room.name || 'Room',
      body: 'A new member joined the room',
      tag: `member-${room.id}`,
      data: { url: `/rooms/${room.id}` },
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
}

/**
 * POST /rooms/:roomId/join
 * Join a room using an invite code (legacy route requiring roomId).
 */
async function joinRoom(req, res, next) {
  try {
    const { roomId } = req.params;
    const inviteCode = normalizeInviteCode(req.body.invite_code);
    const userId = req.user.id;

    // Verify invite code
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, invite_code')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.invite_code !== inviteCode) {
      return res.status(400).json({ error: 'This invite code is invalid or has expired.' });
    }

    // Check if already a member
    const { data: existing } = await supabaseAdmin
      .from('room_members')
      .select('id, role, joined_at')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: 'You have already used this invite and are already in the room.',
      });
    }

    // Add as member
    const { data: membership, error: joinError } = await supabaseAdmin
      .from('room_members')
      .insert({
        room_id: roomId,
        user_id: userId,
        role: 'member',
        last_visited_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (joinError) {
      return res.status(400).json({ error: joinError.message });
    }

    const { data: joinedRoom } = await supabaseAdmin
      .from('rooms')
      .select('id, name, course_name, description, owner_id, invite_code, created_at')
      .eq('id', roomId)
      .maybeSingle();

    res.status(201).json({
      message: 'Joined room successfully',
      room: joinedRoom ? await buildRoomResponse(joinedRoom, userId, membership) : null,
      membership,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /rooms/:roomId/members
 * List all members of a room.
 */
async function getMembers(req, res, next) {
  try {
    const { roomId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('room_members')
      .select(`
        id,
        role,
        joined_at,
        users (
          id,
          full_name,
          university_email,
          avatar_url,
          major
        )
      `)
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const members = data.map((entry) => ({
      ...entry.users,
      role: entry.role,
      joined_at: entry.joined_at,
      membership_id: entry.id,
    }));

    res.json(members);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /rooms/:roomId
 * Delete a room. Only the room owner may delete it.
 */
async function deleteRoom(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    // Verify the room exists and the user is the owner
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, owner_id')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the room owner can delete this room' });
    }

    // Delete room members first (foreign key constraint)
    const { error: membersDeleteError } = await supabaseAdmin
      .from('room_members')
      .delete()
      .eq('room_id', roomId);

    if (membersDeleteError) {
      console.error('Failed to delete room members:', membersDeleteError.message);
    }

    // Delete the room
    const { error: deleteError } = await supabaseAdmin
      .from('rooms')
      .delete()
      .eq('id', roomId);

    if (deleteError) {
      return res.status(400).json({ error: deleteError.message });
    }

    res.json({ message: 'Room deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /rooms/:roomId
 * Update room details. Only owner can update.
 */
async function updateRoom(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('owner_id')
      .eq('id', roomId)
      .single();

    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner_id !== userId) return res.status(403).json({ error: 'Only the room owner can edit this room' });

    const { name, description, course_name } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (course_name !== undefined) updates.course_name = course_name;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabaseAdmin
      .from('rooms')
      .update(updates)
      .eq('id', roomId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /rooms/:roomId/leave
 * Leave a room. Owners cannot leave (must delete or transfer ownership).
 */
async function leaveRoom(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    // Check if user is the owner
    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('owner_id')
      .eq('id', roomId)
      .single();

    if (room && room.owner_id === userId) {
      return res.status(400).json({ error: 'Room owner cannot leave. Delete the room instead.' });
    }

    // Remove membership
    const { error } = await supabaseAdmin
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Left room successfully' });
  } catch (err) {
    next(err);
  }
}

async function markVisited(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const visitedAt = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('room_members')
      .update({ last_visited_at: visitedAt })
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .select('last_visited_at')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ last_visited_at: data?.last_visited_at || visitedAt });
  } catch (err) {
    next(err);
  }
}

async function getQuickLinks(req, res, next) {
  try {
    const { roomId } = req.params;
    const cached = getFreshQuickLinks(roomId);
    if (cached) {
      return res.json(cached);
    }

    const { data, error } = await supabaseAdmin
      .from('room_quick_links')
      .select('id, room_id, created_by, tool, label, url, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const result = data || [];
    setQuickLinksCache(roomId, result);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function createQuickLink(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const tool = String(req.body.tool || 'Other').trim() || 'Other';
    const label = String(req.body.label || '').trim();
    const url = String(req.body.url || '').trim();

    const { data, error } = await supabaseAdmin
      .from('room_quick_links')
      .insert({
        room_id: roomId,
        created_by: userId,
        tool,
        label,
        url,
      })
      .select('id, room_id, created_by, tool, label, url, created_at')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    quickLinksCache.delete(roomId);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

async function deleteQuickLink(req, res, next) {
  try {
    const { roomId, linkId } = req.params;
    const userId = req.user.id;

    const { data: link, error: fetchError } = await supabaseAdmin
      .from('room_quick_links')
      .select('id, created_by')
      .eq('id', linkId)
      .eq('room_id', roomId)
      .maybeSingle();

    if (fetchError) {
      return res.status(400).json({ error: fetchError.message });
    }
    if (!link) {
      return res.status(404).json({ error: 'Quick link not found' });
    }

    if (link.created_by !== userId && req.memberRole !== 'owner' && req.memberRole !== 'admin') {
      return res.status(403).json({ error: 'Not allowed to delete this quick link' });
    }

    const { error } = await supabaseAdmin
      .from('room_quick_links')
      .delete()
      .eq('id', linkId)
      .eq('room_id', roomId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    quickLinksCache.delete(roomId);
    res.json({ message: 'Quick link deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRoom,
  getRooms,
  getRoom,
  updateRoom,
  joinRoom,
  joinRoomByCode,
  getMembers,
  markVisited,
  getQuickLinks,
  createQuickLink,
  deleteQuickLink,
  deleteRoom,
  leaveRoom,
};
