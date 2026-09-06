const { verifyToken } = require('./auth');
const db = require('./db');

function setupSocketIO(io) {
  // Map of active sockets: userId -> Set of socket IDs
  const activeUsers = new Map();

  // Middleware for socket authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Invalid authentication token'));
    }

    const user = db.getUserById(payload.id);
    if (!user) {
      return next(new Error('User account not found'));
    }

    socket.user = user;
    next();
  });

  function getOnlineUsersList() {
    const online = [];
    for (const [userId, socketIds] of activeUsers.entries()) {
      if (socketIds.size > 0) {
        const user = db.getUserById(userId);
        if (user) {
          online.push({
            id: user.id,
            name: user.name,
            phone: user.phone,
            role: user.role
          });
        }
      }
    }
    return online;
  }

  io.on('connection', (socket) => {
    const user = socket.user;
    const userId = user.id;

    // Track active socket
    if (!activeUsers.has(userId)) {
      activeUsers.set(userId, new Set());
    }
    activeUsers.get(userId).add(socket.id);

    console.log(`[Socket] User connected: ${user.name} (${user.phone}) - Socket ID: ${socket.id}`);

    // Notify all of updated online list
    io.emit('online_users', getOnlineUsersList());

    // Send latest locations to newly connected socket
    socket.emit('initial_locations', db.getAllLocations());

    // Send recent messages to newly connected socket
    socket.emit('initial_messages', db.getRecentMessages(50));

    // Handle incoming chat message
    socket.on('chat_message', (data, callback) => {
      try {
        const { content, type = 'text', latitude, longitude, address } = data;

        let isLoc = type === 'location' && latitude != null && longitude != null;

        const savedMessage = db.saveMessage({
          userId: user.id,
          userName: user.name,
          userPhone: user.phone,
          userRole: user.role,
          content: content || (isLoc ? 'Shared current location' : ''),
          type: isLoc ? 'location' : 'text',
          latitude: isLoc ? Number(latitude) : null,
          longitude: isLoc ? Number(longitude) : null,
          address: address || null
        });

        // If location message, also update user's live position in database & map
        if (isLoc) {
          const locRecord = db.upsertLocation({
            userId: user.id,
            userName: user.name,
            userPhone: user.phone,
            userRole: user.role,
            latitude: Number(latitude),
            longitude: Number(longitude),
            accuracy: data.accuracy || 10,
            heading: data.heading || null,
            speed: data.speed || null,
            isLive: 1
          });
          io.emit('location_updated', locRecord);
        }

        // Broadcast chat message to all connected clients
        io.emit('chat_message', savedMessage);

        if (typeof callback === 'function') {
          callback({ success: true, message: savedMessage });
        }
      } catch (err) {
        console.error('[Socket] Error in chat_message:', err);
        if (typeof callback === 'function') {
          callback({ error: err.message });
        }
      }
    });

    // Handle real-time continuous location broadcast (from watchPosition)
    socket.on('location_update', (data, callback) => {
      try {
        const { latitude, longitude, accuracy, heading, speed, isLive = 1 } = data;
        if (latitude == null || longitude == null) {
          return;
        }

        const locRecord = db.upsertLocation({
          userId: user.id,
          userName: user.name,
          userPhone: user.phone,
          userRole: user.role,
          latitude: Number(latitude),
          longitude: Number(longitude),
          accuracy: accuracy != null ? Number(accuracy) : null,
          heading: heading != null ? Number(heading) : null,
          speed: speed != null ? Number(speed) : null,
          isLive: isLive ? 1 : 0
        });

        // Broadcast to all clients (admin and users)
        io.emit('location_updated', locRecord);

        if (typeof callback === 'function') {
          callback({ success: true, location: locRecord });
        }
      } catch (err) {
        console.error('[Socket] Error in location_update:', err);
        if (typeof callback === 'function') {
          callback({ error: err.message });
        }
      }
    });

    // Typing state
    socket.on('typing', (data) => {
      socket.broadcast.emit('user_typing', {
        userId: user.id,
        userName: user.name,
        isTyping: !!data?.isTyping
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const userSockets = activeUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          activeUsers.delete(userId);
          console.log(`[Socket] User went offline: ${user.name}`);
        }
      }
      io.emit('online_users', getOnlineUsersList());
    });
  });

  return {
    broadcastUserCreated: (newUser) => {
      io.emit('admin_user_created', newUser);
    },
    broadcastUserDeleted: (deletedId) => {
      io.emit('admin_user_deleted', { id: deletedId });
    }
  };
}

module.exports = { setupSocketIO };
