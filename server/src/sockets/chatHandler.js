const { saveMessage } = require('../controllers/messageController');
const { supabaseAdmin } = require('../services/supabase');
const { notifyRoom } = require('../controllers/pushController');

// Cache room membership checks for 60 seconds to avoid per-message DB queries
const membershipCache = new Map();
const MEMBERSHIP_CACHE_TTL = 60_000;

async function isRoomMember(roomId, userId) {
  const cacheKey = `${roomId}:${userId}`;
  const cached = membershipCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MEMBERSHIP_CACHE_TTL) {
    return cached.result;
  }

  const { data } = await supabaseAdmin
    .from('room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .limit(1);

  const result = Boolean(data?.[0]);
  membershipCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

// Prune stale entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of membershipCache) {
    if (now - entry.ts > MEMBERSHIP_CACHE_TTL) membershipCache.delete(key);
  }
}, 120_000).unref();

/**
 * Handle chat-related socket events for a connected user.
 */
function chatHandler(io, socket) {
  const userId = socket.userId;

  /**
   * Join a room's chat channel.
   * Client emits: 'chat:join' { roomId }
   */
  socket.on('chat:join', async ({ roomId }) => {
    if (!roomId) return;
    let effectiveRoomId = roomId;
    try {
      let member = await isRoomMember(roomId, userId);
      if (!member) {
        // Auto-join if this is a topic room and user has the topic in their timetable
        const { data: topicRoom } = await supabaseAdmin
          .from('topic_rooms')
          .select('topic_id')
          .eq('room_id', roomId)
          .limit(1);

        const topicRoomEntry = topicRoom?.[0] || null;

        if (topicRoomEntry) {
          // Find canonical (oldest) room for this topic
          const { data: canonicalRoom } = await supabaseAdmin
            .from('topic_rooms')
            .select('room_id')
            .eq('topic_id', topicRoomEntry.topic_id)
            .order('room_id', { ascending: true })
            .limit(1);

          const canonicalRoomEntry = canonicalRoom?.[0] || null;

          if (canonicalRoomEntry && canonicalRoomEntry.room_id !== roomId) {
            effectiveRoomId = canonicalRoomEntry.room_id;
            member = await isRoomMember(effectiveRoomId, userId);
          }

          if (!member) {
            const { data: hasTopic } = await supabaseAdmin
              .from('user_timetable')
              .select('id')
              .eq('user_id', userId)
              .eq('topic_id', topicRoomEntry.topic_id)
              .limit(1);

            if (hasTopic?.[0]) {
              await supabaseAdmin
                .from('room_members')
                .insert({ room_id: effectiveRoomId, user_id: userId, role: 'member' });
              membershipCache.delete(`${effectiveRoomId}:${userId}`);
              member = true;
            }
          }
        }

        if (!member) {
          return socket.emit('chat:error', { error: 'Not a room member' });
        }
      }
    } catch (err) {
      return socket.emit('chat:error', { error: 'Failed to verify room access' });
    }
    socket.join(`room:${effectiveRoomId}`);
    console.log(`User ${userId} joined chat room:${effectiveRoomId}`);
  });

  /**
   * Leave a room's chat channel.
   * Client emits: 'chat:leave' { roomId }
   */
  socket.on('chat:leave', ({ roomId }) => {
    if (!roomId) return;
    socket.leave(`room:${roomId}`);
    console.log(`User ${userId} left chat room:${roomId}`);
  });

  /**
   * Send a message to a room.
   * Client emits: 'chat:message' { roomId, content, message_type? }
   * Server emits to room: 'chat:message' { message object }
   */
  socket.on('chat:message', async ({ roomId, content, message_type }) => {
    if (!roomId || !content) return;

    try {
      // Verify user is a member of the room
      if (!(await isRoomMember(roomId, userId))) {
        return socket.emit('chat:error', { error: 'Not a room member' });
      }

      const message = await saveMessage({
        room_id: roomId,
        user_id: userId,
        content: content.trim().substring(0, 5000),
        message_type: message_type || 'text',
      });

      // Broadcast to all users in the room (including sender)
      io.to(`room:${roomId}`).emit('chat:message', message);

      // Push notification to offline members
      notifyRoom(roomId, userId, {
        type: 'chat',
        title: message.sender_name || 'New message',
        body: content.trim().substring(0, 100),
        tag: `msg-${roomId}`,
        data: { url: `/rooms/${roomId}` },
      }).catch(() => {});
    } catch (err) {
      console.error('Error saving message:', err.message);
      socket.emit('chat:error', { error: 'Failed to send message' });
    }
  });

  /**
   * Typing indicator.
   * Client emits: 'chat:typing' { roomId, isTyping }
   * Server broadcasts to room (except sender): 'chat:typing' { userId, isTyping }
   */
  socket.on('chat:typing', async ({ roomId, isTyping }) => {
    if (!roomId) return;
    try {
      if (!(await isRoomMember(roomId, userId))) {
        return;
      }
    } catch {
      return;
    }
    socket.to(`room:${roomId}`).emit('chat:typing', {
      userId,
      isTyping: !!isTyping,
    });
  });
}

module.exports = chatHandler;
