const { supabaseAdmin } = require('../services/supabase');
const { fetchSingleTopic } = require('../utils/topicCrawler');

/**
 * GET /timetable/topics/search?q=COMP&year=current
 * Search topics by code or title.
 */
async function searchTopics(req, res, next) {
  try {
    const { q, year = new Date().getFullYear() } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const search = q.trim().toUpperCase();

    // Search by topic_code prefix first, then by title
    const { data, error } = await supabaseAdmin
      .from('flinders_topics')
      .select('id, topic_code, title, credit_points, level, school, semesters, campuses, delivery_modes, offerings')
      .eq('year', parseInt(year))
      .or(`topic_code.ilike.%${search}%,title.ilike.%${search}%`)
      .order('topic_code')
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });

    // If no results and query looks like a topic code, try fetching from handbook on-demand
    if ((!data || data.length === 0) && /^[A-Z]{3,4}\d{3,4}/i.test(search)) {
      try {
        const fetched = await fetchSingleTopic(search);
        if (fetched) {
          const { data: retryData } = await supabaseAdmin
            .from('flinders_topics')
            .select('id, topic_code, title, credit_points, level, school, semesters, campuses, delivery_modes, offerings')
            .eq('topic_code', fetched.topic_code)
            .eq('year', parseInt(year))
            .limit(1);
          if (retryData?.length > 0) return res.json(retryData);
        }
      } catch {
        // fall through to empty results
      }
    }

    res.json(data || []);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /timetable/my
 * Get the current user's timetable entries with topic + room info.
 */
async function getMyTimetable(req, res, next) {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('user_timetable')
      .select(`
        id, day_of_week, start_time, end_time, class_type, location, added_at,
        topic:flinders_topics(id, topic_code, title, credit_points, level, school, semesters, campuses),
        room_id
      `)
      .eq('user_id', userId)
      .order('day_of_week')
      .order('start_time');

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /timetable/add
 * Add a topic to the user's timetable + auto-create/join chat room.
 * Body: { topicId, dayOfWeek, startTime, endTime, classType, location }
 */
async function addToTimetable(req, res, next) {
  try {
    const userId = req.user.id;
    const { topicId, dayOfWeek, startTime, endTime, classType, location } = req.body;

    if (!topicId) return res.status(400).json({ error: 'topicId is required' });

    // 1. Check topic exists
    const { data: topic, error: topicError } = await supabaseAdmin
      .from('flinders_topics')
      .select('id, topic_code, title')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) return res.status(404).json({ error: 'Topic not found' });

    // 2. Find or create the topic room
    let roomId;
    const { data: existingTopicRoomRows, error: topicRoomLookupError } = await supabaseAdmin
      .from('topic_rooms')
      .select('room_id')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (topicRoomLookupError) {
      return res.status(500).json({ error: 'Failed to look up topic room: ' + topicRoomLookupError.message });
    }

    const existingTopicRoom = existingTopicRoomRows?.[0] || null;

    if (existingTopicRoom?.room_id) {
      roomId = existingTopicRoom.room_id;
    } else {
      // Create a new room for this topic
      const inviteCode = generateInviteCode();
      const { data: newRoom, error: roomError } = await supabaseAdmin
        .from('rooms')
        .insert({
          name: `${topic.topic_code} — ${topic.title}`,
          course_name: topic.topic_code,
          description: `Auto-created chat room for ${topic.topic_code} ${topic.title}`,
          owner_id: null,
          invite_code: inviteCode,
          room_type: 'topic',
        })
        .select()
        .single();

      if (roomError) return res.status(500).json({ error: 'Failed to create topic room: ' + roomError.message });

      roomId = newRoom.id;

      // Link topic → room. If another request linked first, fall back to the canonical room.
      const { error: topicLinkError } = await supabaseAdmin
        .from('topic_rooms')
        .insert({ topic_id: topicId, room_id: roomId });

      if (topicLinkError) {
        const { data: canonicalRows, error: canonicalLookupError } = await supabaseAdmin
          .from('topic_rooms')
          .select('room_id')
          .eq('topic_id', topicId)
          .order('created_at', { ascending: true })
          .limit(1);

        const canonicalRoomId = canonicalRows?.[0]?.room_id || null;
        if (canonicalLookupError || !canonicalRoomId) {
          return res.status(500).json({ error: 'Failed to link topic room: ' + topicLinkError.message });
        }

        roomId = canonicalRoomId;
      }
    }

    // 3. Auto-join the room (if not already a member)
    const { data: existingMemberRows } = await supabaseAdmin
      .from('room_members')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .limit(1);

    const existingMember = existingMemberRows?.[0] || null;

    if (!existingMember) {
      await supabaseAdmin
        .from('room_members')
        .insert({ room_id: roomId, user_id: userId, role: 'member' });
    }

    // 4. Add timetable entry
    const entry = {
      user_id: userId,
      topic_id: topicId,
      room_id: roomId,
      day_of_week: dayOfWeek != null ? parseInt(dayOfWeek) : null,
      start_time: startTime || null,
      end_time: endTime || null,
      class_type: classType || null,
      location: location || null,
    };

    const { data: timetableEntry, error: insertError } = await supabaseAdmin
      .from('user_timetable')
      .upsert(entry, { onConflict: 'user_id,topic_id,day_of_week,start_time' })
      .select(`
        id, day_of_week, start_time, end_time, class_type, location, added_at,
        topic:flinders_topics(id, topic_code, title, credit_points, level, school, semesters, campuses),
        room_id
      `)
      .single();

    if (insertError) return res.status(500).json({ error: insertError.message });

    res.status(201).json(timetableEntry);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /timetable/:entryId
 * Remove a timetable entry. Does NOT leave the room (user may have other classes for the same topic).
 */
async function removeFromTimetable(req, res, next) {
  try {
    const userId = req.user.id;
    const { entryId } = req.params;

    // Get the entry first to know the topic
    const { data: entry } = await supabaseAdmin
      .from('user_timetable')
      .select('id, topic_id, room_id')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (!entry) return res.status(404).json({ error: 'Timetable entry not found' });

    // Delete the entry
    const { error } = await supabaseAdmin
      .from('user_timetable')
      .delete()
      .eq('id', entryId)
      .eq('user_id', userId);

    if (error) return res.status(500).json({ error: error.message });

    // Check if user has other entries for the same topic
    const { count } = await supabaseAdmin
      .from('user_timetable')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('topic_id', entry.topic_id);

    // If no more entries for this topic, leave the room
    if (count === 0 && entry.room_id) {
      await supabaseAdmin
        .from('room_members')
        .delete()
        .eq('room_id', entry.room_id)
        .eq('user_id', userId);
    }

    res.json({ success: true, leftRoom: count === 0 });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /timetable/topic/:topicId
 * Remove all timetable entries for a topic + leave the room.
 */
async function removeTopic(req, res, next) {
  try {
    const userId = req.user.id;
    const { topicId } = req.params;

    // Get the room for this topic
    const { data: entries } = await supabaseAdmin
      .from('user_timetable')
      .select('room_id')
      .eq('user_id', userId)
      .eq('topic_id', topicId)
      .limit(1);

    const roomId = entries?.[0]?.room_id;

    // Delete all entries for this topic
    const { error } = await supabaseAdmin
      .from('user_timetable')
      .delete()
      .eq('user_id', userId)
      .eq('topic_id', topicId);

    if (error) return res.status(500).json({ error: error.message });

    // Leave the room
    if (roomId) {
      await supabaseAdmin
        .from('room_members')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', userId);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /timetable/topic/:topicId/members
 * Get count of members in a topic's chat room.
 */
async function getTopicMembers(req, res, next) {
  try {
    const { topicId } = req.params;

    const { data: topicRoomRows } = await supabaseAdmin
      .from('topic_rooms')
      .select('room_id')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true })
      .limit(1);

    const topicRoom = topicRoomRows?.[0] || null;

    if (!topicRoom) return res.json({ count: 0 });

    const { count } = await supabaseAdmin
      .from('room_members')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', topicRoom.room_id);

    res.json({ count: count || 0 });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /timetable/topic/:topicId/popular-times
 * Get aggregated class times from other students for the same topic (for recommendations).
 */
async function getPopularTimes(req, res, next) {
  try {
    const { topicId } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('user_timetable')
      .select('day_of_week, start_time, end_time, class_type, location')
      .eq('topic_id', topicId)
      .neq('user_id', userId);

    if (error) return res.status(500).json({ error: error.message });

    // Aggregate: count how many students have each day+time combo
    const counts = {};
    for (const entry of (data || [])) {
      const key = `${entry.day_of_week}-${entry.start_time}-${entry.end_time}`;
      if (!counts[key]) {
        counts[key] = { ...entry, count: 0 };
      }
      counts[key].count++;
    }

    const popular = Object.values(counts).sort((a, b) => b.count - a.count);
    res.json(popular);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /timetable/room/:roomId/ensure-member
 * Ensure the user is a member of a topic room (auto-join if they have the topic in timetable).
 * Returns the member list.
 */
async function ensureTopicRoomMember(req, res, next) {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    // Find the topic for this room. Historical duplicates should not break chat opening.
    const { data: topicRoomRows, error: topicRoomError } = await supabaseAdmin
      .from('topic_rooms')
      .select('topic_id')
      .eq('room_id', roomId)
      .limit(1);

    if (topicRoomError) {
      console.error('ensure-member topic lookup error:', topicRoomError.message);
      return res.status(200).json({ members: [], canonicalRoomId: roomId });
    }

    const topicRoom = topicRoomRows?.[0] || null;
    if (!topicRoom?.topic_id) {
      return res.status(200).json({ members: [], canonicalRoomId: roomId });
    }

    // Find the canonical (oldest) room for this topic — fixes duplicate room issues
    const { data: canonicalRoomRows, error: canonicalRoomError } = await supabaseAdmin
      .from('topic_rooms')
      .select('room_id')
      .eq('topic_id', topicRoom.topic_id)
      .order('room_id', { ascending: true })
      .limit(1);

    if (canonicalRoomError) {
      console.error('ensure-member canonical room lookup error:', canonicalRoomError.message);
    }

    const canonicalRoomId = canonicalRoomRows?.[0]?.room_id || roomId;

    // Check user has this topic in their timetable
    const { data: hasTopicRows, error: hasTopicError } = await supabaseAdmin
      .from('user_timetable')
      .select('id')
      .eq('user_id', userId)
      .eq('topic_id', topicRoom.topic_id)
      .limit(1);

    if (hasTopicError) {
      console.error('ensure-member timetable lookup error:', hasTopicError.message);
      return res.status(200).json({ members: [], canonicalRoomId });
    }

    const hasTopic = hasTopicRows?.[0] || null;
    if (!hasTopic) return res.status(403).json({ error: 'Topic not in your timetable' });

    // If user's timetable points to a different room, update it to canonical
    if (canonicalRoomId !== roomId) {
      await supabaseAdmin
        .from('user_timetable')
        .update({ room_id: canonicalRoomId })
        .eq('user_id', userId)
        .eq('topic_id', topicRoom.topic_id);
    }

    // Auto-join canonical room if not already a member
    const { data: existingMemberRows, error: existingMemberError } = await supabaseAdmin
      .from('room_members')
      .select('id')
      .eq('room_id', canonicalRoomId)
      .eq('user_id', userId)
      .limit(1);

    if (existingMemberError) {
      console.error('ensure-member existing member lookup error:', existingMemberError.message);
    }

    const existingMember = existingMemberRows?.[0] || null;

    if (!existingMember) {
      const { error: joinError } = await supabaseAdmin
        .from('room_members')
        .insert({ room_id: canonicalRoomId, user_id: userId, role: 'member' });
      if (joinError) console.error('ensure-member insert error:', joinError.message);
    }

    // Return member list + the canonical room id so client can use the right one
    const { data: members, error: memberError } = await supabaseAdmin
      .from('room_members')
      .select(`
        id, role, joined_at,
        users (id, full_name, university_email, avatar_url, major)
      `)
      .eq('room_id', canonicalRoomId)
      .order('joined_at', { ascending: true });

    if (memberError) console.error('ensure-member query error:', memberError.message);

    const result = (members || []).map((entry) => ({
      ...(entry.users || {}),
      role: entry.role,
      joined_at: entry.joined_at,
    }));

    res.json({ members: result, canonicalRoomId });
  } catch (err) {
    console.error('ensure-member fatal error:', err.message);
    next(err);
  }
}

/**
 * POST /timetable/topic/:topicId/open-chat
 * Resolve a topic to its canonical chat room, ensure the user is joined, and return members.
 */
async function openTopicChat(req, res, next) {
  try {
    const userId = req.user.id;
    const { topicId } = req.params;

    if (!topicId) {
      return res.status(400).json({ error: 'topicId is required' });
    }

    const { data: hasTopicRows, error: hasTopicError } = await supabaseAdmin
      .from('user_timetable')
      .select('room_id')
      .eq('user_id', userId)
      .eq('topic_id', topicId)
      .order('added_at', { ascending: true })
      .limit(1);

    if (hasTopicError) {
      console.error('open-topic-chat timetable lookup error:', hasTopicError.message);
      return res.status(500).json({ error: 'Failed to verify topic membership' });
    }

    const timetableRow = hasTopicRows?.[0] || null;
    if (!timetableRow) {
      return res.status(403).json({ error: 'Topic not in your timetable' });
    }

    const { data: canonicalRoomRows, error: canonicalRoomError } = await supabaseAdmin
      .from('topic_rooms')
      .select('room_id')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (canonicalRoomError) {
      console.error('open-topic-chat canonical room lookup error:', canonicalRoomError.message);
      return res.status(500).json({ error: 'Failed to resolve topic room' });
    }

    const canonicalRoomId = canonicalRoomRows?.[0]?.room_id || timetableRow.room_id || null;
    if (!canonicalRoomId) {
      return res.status(404).json({ error: 'Topic room not found' });
    }

    if (timetableRow.room_id !== canonicalRoomId) {
      await supabaseAdmin
        .from('user_timetable')
        .update({ room_id: canonicalRoomId })
        .eq('user_id', userId)
        .eq('topic_id', topicId);
    }

    const { data: existingMemberRows, error: memberLookupError } = await supabaseAdmin
      .from('room_members')
      .select('id')
      .eq('room_id', canonicalRoomId)
      .eq('user_id', userId)
      .limit(1);

    if (memberLookupError) {
      console.error('open-topic-chat member lookup error:', memberLookupError.message);
      return res.status(500).json({ error: 'Failed to verify chat membership' });
    }

    if (!existingMemberRows?.[0]) {
      const { error: joinError } = await supabaseAdmin
        .from('room_members')
        .insert({ room_id: canonicalRoomId, user_id: userId, role: 'member' });

      if (joinError) {
        console.error('open-topic-chat join error:', joinError.message);
        return res.status(500).json({ error: 'Failed to join topic chat' });
      }
    }

    const { data: members, error: membersError } = await supabaseAdmin
      .from('room_members')
      .select(`
        id, role, joined_at,
        users (id, full_name, university_email, avatar_url, major)
      `)
      .eq('room_id', canonicalRoomId)
      .order('joined_at', { ascending: true });

    if (membersError) {
      console.error('open-topic-chat members query error:', membersError.message);
      return res.status(500).json({ error: 'Failed to load topic chat members' });
    }

    const result = (members || []).map((entry) => ({
      ...(entry.users || {}),
      role: entry.role,
      joined_at: entry.joined_at,
    }));

    res.json({ canonicalRoomId, members: result });
  } catch (err) {
    console.error('open-topic-chat fatal error:', err.message);
    next(err);
  }
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * POST /timetable/room/:roomId/ensure-member
 * Re-join a topic room if the user has timetable entries for it but left the room.
 */
async function ensureRoomMember(req, res, next) {
  try {
    const userId = req.user.id;
    const { roomId } = req.params;

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('id, room_type')
      .eq('id', roomId)
      .single();

    if (!room || room.room_type !== 'topic') {
      return res.status(400).json({ error: 'Not a topic room' });
    }

    const { data: existing } = await supabaseAdmin
      .from('room_members')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    if (existing) return res.json({ joined: false, already_member: true });

    await supabaseAdmin
      .from('room_members')
      .insert({ room_id: roomId, user_id: userId, role: 'member' });

    res.json({ joined: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchTopics,
  getMyTimetable,
  addToTimetable,
  removeFromTimetable,
  removeTopic,
  getTopicMembers,
  getPopularTimes,
  ensureTopicRoomMember,
  openTopicChat,
};
