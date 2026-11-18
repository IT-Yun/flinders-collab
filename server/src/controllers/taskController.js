const { supabaseAdmin } = require('../services/supabase');
const { notifyRoom } = require('./pushController');

/**
 * POST /rooms/:roomId/tasks
 * Create a new task with multiple assignees.
 */
async function createTask(req, res, next) {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const { title, description, assigned_to, assignees, due_date, priority } = req.body;

    // Build assignee list: support both old single `assigned_to` and new `assignees` array
    const assigneeIds = assignees && assignees.length > 0
      ? assignees
      : assigned_to
        ? [assigned_to]
        : [];

    if (assigneeIds.length === 0) {
      return res.status(400).json({ error: 'At least one assignee is required' });
    }

    // Verify all assignees are room members
    const { data: memberRows } = await supabaseAdmin
      .from('room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .in('user_id', assigneeIds);

    const validIds = new Set((memberRows || []).map((m) => m.user_id));
    const invalidIds = assigneeIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: 'Some assigned users are not members of this room' });
    }

    // Create the task
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .insert({
        room_id: roomId,
        assigned_to: assigneeIds[0], // keep backward compat
        assigned_by: userId,
        title,
        description: description || null,
        due_date: due_date || null,
        priority: priority || 'medium',
        status: 'pending',
      })
      .select()
      .single();

    if (taskError) {
      return res.status(400).json({ error: taskError.message });
    }

    // Insert task_assignees rows
    const assigneeRows = assigneeIds.map((uid) => ({
      task_id: task.id,
      user_id: uid,
      status: 'pending',
    }));

    const { error: assigneeError } = await supabaseAdmin
      .from('task_assignees')
      .insert(assigneeRows);

    if (assigneeError) {
      console.error('[tasks] Failed to insert assignees:', assigneeError.message);
    }

    // Fetch the full task with assignees for response
    const fullTask = await fetchTaskWithAssignees(task.id);
    res.status(201).json(fullTask || task);

    notifyRoom(req.params.roomId, req.user.id, {
      type: 'tasks',
      title: 'New Task',
      body: (fullTask || task).title || 'A new task was created',
      tag: `task-${req.params.roomId}`,
      data: { url: `/rooms/${req.params.roomId}` },
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
}

/**
 * GET /rooms/:roomId/tasks
 * List all tasks with their assignees.
 */
async function getTasks(req, res, next) {
  try {
    const { roomId } = req.params;
    const { status, assigned_to } = req.query;

    let query = supabaseAdmin
      .from('tasks')
      .select(`
        *,
        assignee:assigned_to ( id, full_name, university_email, avatar_url ),
        assigner:assigned_by ( id, full_name, university_email, avatar_url ),
        task_assignees (
          id,
          user_id,
          status,
          completed_at,
          users:user_id ( id, full_name, university_email, avatar_url )
        )
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (assigned_to) {
      query = query.eq('assigned_to', assigned_to);
    }

    const { data, error } = await query;

    if (error) {
      // If task_assignees table doesn't exist yet, fall back
      if (error.message.includes('task_assignees')) {
        const fallback = await supabaseAdmin
          .from('tasks')
          .select(`
            *,
            assignee:assigned_to ( id, full_name, university_email, avatar_url ),
            assigner:assigned_by ( id, full_name, university_email, avatar_url )
          `)
          .eq('room_id', roomId)
          .order('created_at', { ascending: false });

        if (fallback.error) {
          return res.status(400).json({ error: fallback.error.message });
        }
        return res.json(fallback.data);
      }
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /rooms/:roomId/tasks/:taskId
 * Update a task.
 */
async function updateTask(req, res, next) {
  try {
    const { roomId, taskId } = req.params;
    const userId = req.user.id;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('room_id', roomId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const isAssigner = existing.assigned_by === userId;
    const isAdmin = req.memberRole === 'owner' || req.memberRole === 'admin';

    const allowedFields =
      isAdmin || isAssigner
        ? ['title', 'description', 'assigned_to', 'due_date', 'status', 'priority']
        : ['title', 'status', 'due_date', 'priority'];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .select('*')
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
 * PATCH /rooms/:roomId/tasks/:taskId/assignees/:userId
 * Update an assignee's status (pending → in_progress → completed, or set explicitly).
 */
async function toggleAssignee(req, res, next) {
  try {
    const { roomId, taskId, userId: assigneeUserId } = req.params;
    const currentUserId = req.user.id;

    // Verify task exists in room
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .select('id, assigned_by')
      .eq('id', taskId)
      .eq('room_id', roomId)
      .single();

    if (taskError || !task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Only the assignee themselves, task creator, or admin can update
    const isAssignee = currentUserId === assigneeUserId;
    const isAssigner = currentUserId === task.assigned_by;
    const isAdmin = req.memberRole === 'owner' || req.memberRole === 'admin';

    if (!isAssignee && !isAssigner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this assignment' });
    }

    // Get current state
    const { data: existing } = await supabaseAdmin
      .from('task_assignees')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', assigneeUserId)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Assignee not found for this task' });
    }

    // If status is provided in body, use it; otherwise cycle: pending → in_progress → completed → pending
    const statusCycle = { pending: 'in_progress', in_progress: 'completed', completed: 'pending' };
    const newStatus = req.body.status || statusCycle[existing.status] || 'pending';

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('task_assignees')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Auto-update task status based on all assignees
    const { data: allAssignees } = await supabaseAdmin
      .from('task_assignees')
      .select('status')
      .eq('task_id', taskId);

    if (allAssignees && allAssignees.length > 0) {
      const allDone = allAssignees.every((a) => a.status === 'completed');
      const anyInProgress = allAssignees.some((a) => a.status === 'in_progress' || a.status === 'completed');
      const taskStatus = allDone ? 'completed' : anyInProgress ? 'in_progress' : 'pending';

      await supabaseAdmin
        .from('tasks')
        .update({ status: taskStatus, updated_at: new Date().toISOString() })
        .eq('id', taskId);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /rooms/:roomId/tasks/:taskId/assignees
 * Add assignees to an existing task.
 */
async function addAssignees(req, res, next) {
  try {
    const { roomId, taskId } = req.params;
    const { assignees } = req.body;

    if (!assignees || assignees.length === 0) {
      return res.status(400).json({ error: 'At least one assignee is required' });
    }

    // Verify task exists
    const { data: task } = await supabaseAdmin
      .from('tasks')
      .select('id, assigned_by')
      .eq('id', taskId)
      .eq('room_id', roomId)
      .single();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify assignees are room members
    const { data: memberRows } = await supabaseAdmin
      .from('room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .in('user_id', assignees);

    const validIds = new Set((memberRows || []).map((m) => m.user_id));
    const rows = assignees
      .filter((id) => validIds.has(id))
      .map((uid) => ({
        task_id: taskId,
        user_id: uid,
        status: 'pending',
      }));

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid room members in assignee list' });
    }

    const { error } = await supabaseAdmin
      .from('task_assignees')
      .upsert(rows, { onConflict: 'task_id,user_id' });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const fullTask = await fetchTaskWithAssignees(taskId);
    res.json(fullTask);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /rooms/:roomId/tasks/:taskId
 */
async function deleteTask(req, res, next) {
  try {
    const { roomId, taskId } = req.params;
    const userId = req.user.id;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('room_id', roomId)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const isAssigner = existing.assigned_by === userId;
    const isAssignee = existing.assigned_to === userId;
    const isAdmin = req.memberRole === 'owner' || req.memberRole === 'admin';

    if (!isAssigner && !isAssignee && !isAdmin) {
      return res.status(403).json({
        error: 'Only the task creator, assignee, or room admin can delete tasks',
      });
    }

    const { error } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/* Helper: fetch a single task with its assignees */
async function fetchTaskWithAssignees(taskId) {
  const { data } = await supabaseAdmin
    .from('tasks')
    .select(`
      *,
      assignee:assigned_to ( id, full_name, university_email, avatar_url ),
      assigner:assigned_by ( id, full_name, university_email, avatar_url ),
      task_assignees (
        id,
        user_id,
        status,
        completed_at,
        users:user_id ( id, full_name, university_email, avatar_url )
      )
    `)
    .eq('id', taskId)
    .single();

  return data;
}

module.exports = {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  toggleAssignee,
  addAssignees,
};
