const { Server } = require('socket.io');
const { supabaseAdmin } = require('../services/supabase');
const config = require('../config');
const chatHandler = require('./chatHandler');
const locationHandler = require('./locationHandler');

/**
 * Initialize Socket.IO server and attach event handlers.
 */
function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl.includes(',')
        ? config.clientUrl.split(',').map(url => url.trim())
        : config.clientUrl,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const { data, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !data.user) {
        return next(new Error('Invalid or expired token'));
      }

      socket.userId = data.user.id;
      socket.userEmail = data.user.email;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);
    socket.join(`user:${socket.userId}`);

    // Register handlers
    chatHandler(io, socket);
    locationHandler(io, socket);

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      console.log(`User disconnected: ${socket.userId} (${reason})`);
      try {
        // Only stop location sharing if user has no other active sockets
        const userRoom = `user:${socket.userId}`;
        const remaining = await io.in(userRoom).fetchSockets();
        if (remaining.length === 0) {
          await supabaseAdmin
            .from('location_sessions')
            .update({ status: 'stopped', updated_at: new Date().toISOString() })
            .eq('user_id', socket.userId)
            .in('status', ['sharing', 'on_the_way', 'arrived', 'late']);
        }
      } catch (err) {
        console.error('Disconnect cleanup error:', err.message);
      }
    });
  });

  return io;
}

module.exports = { initSockets };
