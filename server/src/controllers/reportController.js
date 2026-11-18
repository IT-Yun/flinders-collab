const { supabaseAdmin } = require('../services/supabase');

/**
 * POST /api/reports
 * Create a new report (any authenticated user).
 */
async function createReport(req, res, next) {
  try {
    const userId = req.user.id;
    const { room_id, section, subject, description } = req.body;

    if (!section || !subject || !description) {
      return res.status(400).json({ error: 'section, subject, and description are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('reports')
      .insert({
        user_id: userId,
        room_id: room_id || null,
        section,
        subject,
        description,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports
 * Get all reports (admin only).
 * Query params: ?status=open&section=schedule
 */
async function getReports(req, res, next) {
  try {
    // Admin check
    const { data: profile } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { status, section } = req.query;

    let query = supabaseAdmin
      .from('reports')
      .select(`
        *,
        reporter:user_id ( id, full_name, university_email )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (section) {
      query = query.eq('section', section);
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
 * PATCH /api/reports/:reportId
 * Update report status (admin only).
 */
async function updateReport(req, res, next) {
  try {
    // Admin check
    const { data: profile } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { reportId } = req.params;
    const { status } = req.body;
    const allowedStatuses = ['open', 'in_progress', 'resolved', 'closed'];

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowedStatuses.join(', ')}` });
    }

    const updates = { status };

    if (status === 'resolved' || status === 'closed') {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = req.user.id;
    }

    const { data, error } = await supabaseAdmin
      .from('reports')
      .update(updates)
      .eq('id', reportId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/users
 * Get all users (admin only).
 */
async function getUsers(req, res, next) {
  try {
    // Admin check
    const { data: profile } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, university_email, student_id, major, is_admin, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:userId/admin
 * Toggle admin status for a user (admin only).
 */
async function toggleAdmin(req, res, next) {
  try {
    // Admin check
    const { data: profile } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { userId } = req.params;

    // Get current admin status
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, is_admin')
      .eq('id', userId)
      .single();

    if (fetchError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Toggle
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ is_admin: !targetUser.is_admin })
      .eq('id', userId)
      .select('id, full_name, university_email, is_admin')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/users/:userId
 * Delete a user (admin only). Cannot delete yourself.
 */
async function deleteUser(req, res, next) {
  try {
    const { data: profile } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Delete from users table first so dependent public data is removed cleanly
    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      return res.status(500).json({ error: 'User profile was removed, but auth account deletion failed' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createReport,
  getReports,
  updateReport,
  getUsers,
  toggleAdmin,
  deleteUser,
};
