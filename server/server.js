const express = require('express');
const http = require('node:http');
const path = require('node:path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');

const db = require('./db');
const { signToken, authMiddleware, adminMiddleware } = require('./auth');
const { setupSocketIO } = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Real-time Socket Setup
const socketHandlers = setupSocketIO(io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API Routes ---

// 1. Auth: Login (supports phone number OR 'admin')
app.post('/api/auth/login', (req, res) => {
  try {
    const identifier = req.body.identifier || req.body.phone;
    const password = req.body.password;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Phone number/Identifier and password are required' });
    }

    const user = db.getUserByPhone(identifier);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials. Incorrect password.' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[API] Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// 2. Auth: Get Current User Session
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      phone: req.user.phone,
      name: req.user.name,
      role: req.user.role,
      created_at: req.user.created_at
    }
  });
});

// 3. Chat: Get Recent Messages
app.get('/api/messages', authMiddleware, (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const messages = db.getRecentMessages(limit);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// 4. Locations: Get all current user locations
app.get('/api/locations', authMiddleware, (req, res) => {
  try {
    const locations = db.getAllLocations();
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// 5. Admin: List all registered users
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const users = db.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// 6. Admin: Create a new user (Phone + Name + Password)
app.post('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { phone, name, password, role = 'user' } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number or ID is required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'User display name is required' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    const newUser = db.createUser({
      phone: phone.trim(),
      name: name.trim(),
      password,
      role: role === 'admin' ? 'admin' : 'user'
    });

    // Notify connected clients
    socketHandlers.broadcastUserCreated(newUser);

    res.status(201).json({
      success: true,
      user: newUser
    });
  } catch (err) {
    console.error('[API] Create user error:', err);
    res.status(400).json({ error: err.message || 'Failed to create user' });
  }
});

// 7. Admin: Delete a user
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const result = db.deleteUser(targetId);
    socketHandlers.broadcastUserDeleted(targetId);
    res.json(result);
  } catch (err) {
    console.error('[API] Delete user error:', err);
    res.status(400).json({ error: err.message || 'Failed to delete user' });
  }
});

// 8. Admin: Generate Activity & Location Report (with time range and per-user filtering)
app.get('/api/admin/reports', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    const report = db.getReportData({ userId, startDate, endDate });
    res.json(report);
  } catch (err) {
    console.error('[API] Generate report error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// 9. Helper: Lightweight reverse geocoding proxy
app.get('/api/geocode/reverse', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=16&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'LocationShareApp/1.0 (internal-demo)'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return res.json({
        display_name: data.display_name,
        address: data.address
      });
    }
  } catch (e) {
    // Graceful fallback if network is unreachable
  }

  res.json({
    display_name: `Coordinates: ${Number(lat).toFixed(4)}°, ${Number(lon).toFixed(4)}°`
  });
});

// Fallback to index.html for client side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const os = require('node:os');
const PORT = process.env.PORT || 3000;

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log(`======================================================`);
    console.log(`🚀 LocationShare is accessible on your local network:`);
    console.log(`📱 Mobile Network URL:  http://${localIp}:${PORT}`);
    console.log(`💻 Local Desktop URL:   http://localhost:${PORT}`);
    console.log(`------------------------------------------------------`);
    console.log(`🔑 Admin Login: ID "admin" / Password "admin"`);
    console.log(`======================================================`);
  });
}

module.exports = { app, server, PORT };
