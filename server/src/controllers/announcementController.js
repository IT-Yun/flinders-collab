const { supabaseAdmin } = require('../services/supabase');
const { notifyRoom } = require('./pushController');

// GET /rooms/:roomId/announcements
async function getAnnouncements(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('room_announcements')
      .select('*, users:author_id(full_name, avatar_url)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return res.status(400).json({ error: error.message });

    // Check which ones the user has read
    const ids = (data || []).map(a => a.id);
    let readSet = new Set();
    if (ids.length > 0) {
      const { data: reads } = await supabaseAdmin
        .from('announcement_reads')
        .select('announcement_id')
        .eq('user_id', userId)
        .in('announcement_id', ids);
      readSet = new Set((reads || []).map(r => r.announcement_id));
    }

    const enriched = (data || []).map(a => ({
      ...a,
      is_read: readSet.has(a.id),
    }));

    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

// POST /rooms/:roomId/announcements
async function createAnnouncement(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    // Check if user is admin/owner
    const { data: member } = await supabaseAdmin
      .from('room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only admins can create announcements' });
    }

    const { data, error } = await supabaseAdmin
      .from('room_announcements')
      .insert({ room_id: roomId, author_id: userId, content: content.trim() })
      .select('*, users:author_id(full_name, avatar_url)')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ ...data, is_read: false });

    notifyRoom(req.params.roomId, req.user.id, {
      type: 'announcements',
      title: 'Announcement',
      body: data.content?.substring(0, 100) || 'New announcement',
      tag: `announce-${req.params.roomId}`,
      data: { url: `/rooms/${req.params.roomId}` },
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
}

// DELETE /announcements/:announcementId
async function deleteAnnouncement(req, res, next) {
  try {
    const { announcementId } = req.params;
    const userId = req.user.id;

    const { data: ann } = await supabaseAdmin
      .from('room_announcements')
      .select('id, room_id, author_id')
      .eq('id', announcementId)
      .maybeSingle();

    if (!ann) return res.status(404).json({ error: 'Announcement not found' });

    // Author or room admin/owner can delete
    const isAuthor = ann.author_id === userId;
    if (!isAuthor) {
      const { data: member } = await supabaseAdmin
        .from('room_members')
        .select('role')
        .eq('room_id', ann.room_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    await supabaseAdmin.from('room_announcements').delete().eq('id', announcementId);
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}

// POST /announcements/:announcementId/read
async function markRead(req, res, next) {
  try {
    const { announcementId } = req.params;
    const userId = req.user.id;

    await supabaseAdmin
      .from('announcement_reads')
      .upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: 'announcement_id,user_id' });

    res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
}

// POST /rooms/:roomId/announcements/read-all
async function markAllRead(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    // Get all unread announcement IDs for this room
    const { data: announcements } = await supabaseAdmin
      .from('room_announcements')
      .select('id')
      .eq('room_id', roomId);

    if (!announcements || announcements.length === 0) {
      return res.json({ message: 'No announcements' });
    }

    const ids = announcements.map(a => a.id);

    // Get already read ones
    const { data: reads } = await supabaseAdmin
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', userId)
      .in('announcement_id', ids);

    const readSet = new Set((reads || []).map(r => r.announcement_id));
    const unread = ids.filter(id => !readSet.has(id));

    if (unread.length > 0) {
      const inserts = unread.map(id => ({ announcement_id: id, user_id: userId }));
      await supabaseAdmin.from('announcement_reads').insert(inserts);
    }

    res.json({ message: 'All marked as read', count: unread.length });
  } catch (err) {
    next(err);
  }
}

// GET /announcements/unread-counts
async function getUnreadCounts(req, res, next) {
  try {
    const userId = req.user.id;

    // Get all rooms the user is a member of
    const { data: memberships } = await supabaseAdmin
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) {
      return res.json({});
    }

    const roomIds = memberships.map(m => m.room_id);

    // Get all announcements in those rooms
    const { data: announcements } = await supabaseAdmin
      .from('room_announcements')
      .select('id, room_id')
      .in('room_id', roomIds);

    if (!announcements || announcements.length === 0) {
      return res.json({});
    }

    const annIds = announcements.map(a => a.id);

    // Get user's reads
    const { data: reads } = await supabaseAdmin
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', userId)
      .in('announcement_id', annIds);

    const readSet = new Set((reads || []).map(r => r.announcement_id));

    // Count unread per room
    const counts = {};
    for (const ann of announcements) {
      if (!readSet.has(ann.id)) {
        counts[ann.room_id] = (counts[ann.room_id] || 0) + 1;
      }
    }

    res.json(counts);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  markRead,
  markAllRead,
  getUnreadCounts,
};
