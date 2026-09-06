const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'locationshare.db');
const db = new DatabaseSync(DB_PATH);

// Initialize schema
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    user_phone TEXT NOT NULL,
    user_role TEXT NOT NULL,
    content TEXT,
    type TEXT NOT NULL DEFAULT 'text',
    latitude REAL,
    longitude REAL,
    address TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locations (
    user_id INTEGER PRIMARY KEY,
    user_name TEXT NOT NULL,
    user_phone TEXT NOT NULL,
    user_role TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    heading REAL,
    speed REAL,
    is_live INTEGER DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS location_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    user_phone TEXT NOT NULL,
    user_role TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    speed REAL,
    address TEXT,
    created_at TEXT NOT NULL
  );
`);

// Seed default Admin if not exists
function seedInitialData() {
  const findAdmin = db.prepare(`SELECT * FROM users WHERE phone = ?`).get('admin');
  if (!findAdmin) {
    const adminHash = bcrypt.hashSync('admin', 10);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (phone, name, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin', 'System Administrator', adminHash, 'admin', now);
    console.log('✓ Seeded admin user (ID: admin, Pass: admin)');
  }

  // Seed two sample users for immediate testing if no users exist besides admin
  const userCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'user'`).get().count;
  if (userCount === 0) {
    const userPassHash = bcrypt.hashSync('123456', 10);
    const now = new Date().toISOString();
    
    // User 1
    db.prepare(`
      INSERT INTO users (phone, name, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('+1234567890', 'Alex Taylor', userPassHash, 'user', now);

    // User 2
    db.prepare(`
      INSERT INTO users (phone, name, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('+1987654321', 'Sarah Jenkins', userPassHash, 'user', now);

    console.log('✓ Seeded sample users for instant demonstration (+1234567890 / 123456, +1987654321 / 123456)');
  }
}

seedInitialData();

// User Queries
function getUserByPhone(phone) {
  return db.prepare(`SELECT * FROM users WHERE LOWER(phone) = LOWER(?)`).get(phone.trim());
}

function getUserById(id) {
  return db.prepare(`SELECT id, phone, name, role, created_at FROM users WHERE id = ?`).get(id);
}

function createUser({ phone, name, password, role = 'user' }) {
  const existing = getUserByPhone(phone);
  if (existing) {
    throw new Error('A user with this phone number or identifier already exists');
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO users (phone, name, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(phone.trim(), name.trim(), passwordHash, role, now);
  return {
    id: Number(result.lastInsertRowid),
    phone: phone.trim(),
    name: name.trim(),
    role,
    created_at: now
  };
}

function getAllUsers() {
  return db.prepare(`
    SELECT u.id, u.phone, u.name, u.role, u.created_at,
           l.latitude, l.longitude, l.updated_at as last_location_at, l.is_live
    FROM users u
    LEFT JOIN locations l ON u.id = l.user_id
    ORDER BY u.id ASC
  `).all();
}

function deleteUser(id) {
  const user = getUserById(id);
  if (!user) throw new Error('User not found');
  if (user.role === 'admin' && user.phone.toLowerCase() === 'admin') {
    throw new Error('Cannot delete the root admin account');
  }
  db.prepare(`DELETE FROM locations WHERE user_id = ?`).run(id);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  return { success: true, deletedId: id };
}

// Message Queries
function saveMessage({ userId, userName, userPhone, userRole, content = '', type = 'text', latitude = null, longitude = null, address = null }) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO messages (user_id, user_name, user_phone, user_role, content, type, latitude, longitude, address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(userId, userName, userPhone, userRole, content, type, latitude, longitude, address, now);

  // If message has location, also record to location history
  if (type === 'location' && latitude != null && longitude != null) {
    db.prepare(`
      INSERT INTO location_history (user_id, user_name, user_phone, user_role, latitude, longitude, accuracy, speed, address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, userName, userPhone, userRole, latitude, longitude, 10, null, address, now);
  }

  return {
    id: Number(result.lastInsertRowid),
    user_id: userId,
    user_name: userName,
    user_phone: userPhone,
    user_role: userRole,
    content,
    type,
    latitude,
    longitude,
    address,
    created_at: now
  };
}

function getRecentMessages(limit = 100) {
  return db.prepare(`
    SELECT * FROM messages
    ORDER BY id DESC
    LIMIT ?
  `).all(limit).reverse();
}

// Location Queries
function upsertLocation({ userId, userName, userPhone, userRole, latitude, longitude, accuracy = null, heading = null, speed = null, isLive = 1 }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO locations (user_id, user_name, user_phone, user_role, latitude, longitude, accuracy, heading, speed, is_live, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      user_name = excluded.user_name,
      user_phone = excluded.user_phone,
      user_role = excluded.user_role,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      accuracy = excluded.accuracy,
      heading = excluded.heading,
      speed = excluded.speed,
      is_live = excluded.is_live,
      updated_at = excluded.updated_at
  `).run(userId, userName, userPhone, userRole, latitude, longitude, accuracy, heading, speed, isLive ? 1 : 0, now);

  // Also record in location history for time-range reporting
  db.prepare(`
    INSERT INTO location_history (user_id, user_name, user_phone, user_role, latitude, longitude, accuracy, speed, address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, userName, userPhone, userRole, latitude, longitude, accuracy, speed, null, now);

  return {
    user_id: userId,
    user_name: userName,
    user_phone: userPhone,
    user_role: userRole,
    latitude,
    longitude,
    accuracy,
    heading,
    speed,
    is_live: isLive ? 1 : 0,
    updated_at: now
  };
}

function getAllLocations() {
  return db.prepare(`SELECT * FROM locations`).all();
}

function clearUserLocation(userId) {
  db.prepare(`DELETE FROM locations WHERE user_id = ?`).run(userId);
}

// Admin Reporting Query
function getReportData({ userId = 'all', startDate = null, endDate = null }) {
  const now = new Date();
  const endIso = endDate ? new Date(endDate).toISOString() : now.toISOString();
  const startIso = startDate 
    ? new Date(startDate).toISOString() 
    : new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const isSpecificUser = userId && userId !== 'all';
  const targetUserId = isSpecificUser ? Number(userId) : null;

  // 1. Fetch Messages in range
  let messagesQuery = `SELECT * FROM messages WHERE created_at >= ? AND created_at <= ?`;
  const msgParams = [startIso, endIso];
  if (isSpecificUser) {
    messagesQuery += ` AND user_id = ?`;
    msgParams.push(targetUserId);
  }
  messagesQuery += ` ORDER BY created_at ASC`;
  const messages = db.prepare(messagesQuery).all(...msgParams);

  // 2. Fetch Location History in range
  let locationQuery = `SELECT * FROM location_history WHERE created_at >= ? AND created_at <= ?`;
  const locParams = [startIso, endIso];
  if (isSpecificUser) {
    locationQuery += ` AND user_id = ?`;
    locParams.push(targetUserId);
  }
  locationQuery += ` ORDER BY created_at ASC`;
  const locations = db.prepare(locationQuery).all(...locParams);

  // 3. User stats in range
  let allUsers = getAllUsers();
  if (isSpecificUser) {
    allUsers = allUsers.filter(u => u.id === targetUserId);
  }

  const userStats = allUsers.map(u => {
    const userMsgs = messages.filter(m => m.user_id === u.id);
    const userLocs = locations.filter(l => l.user_id === u.id);

    const activities = [
      ...userMsgs.map(m => m.created_at),
      ...userLocs.map(l => l.created_at)
    ].sort();

    const latestLoc = userLocs[userLocs.length - 1] || null;

    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      messageCount: userMsgs.length,
      locationCount: userLocs.length,
      firstActivity: activities[0] || null,
      lastActivity: activities[activities.length - 1] || null,
      latestLocation: latestLoc ? {
        latitude: latestLoc.latitude,
        longitude: latestLoc.longitude,
        address: latestLoc.address,
        updated_at: latestLoc.created_at
      } : (u.latitude != null ? {
        latitude: u.latitude,
        longitude: u.longitude,
        updated_at: u.last_location_at
      } : null)
    };
  });

  // 4. Combined Activity Timeline
  const timeline = [];

  messages.forEach(m => {
    timeline.push({
      id: `msg-${m.id}`,
      type: m.type === 'location' ? 'location_share' : 'chat_message',
      timestamp: m.created_at,
      userId: m.user_id,
      userName: m.user_name,
      userPhone: m.user_phone,
      userRole: m.user_role,
      content: m.content || (m.type === 'location' ? 'Shared location' : ''),
      latitude: m.latitude,
      longitude: m.longitude,
      address: m.address
    });
  });

  locations.forEach(l => {
    timeline.push({
      id: `loc-${l.id}`,
      type: 'location_broadcast',
      timestamp: l.created_at,
      userId: l.user_id,
      userName: l.user_name,
      userPhone: l.user_phone,
      userRole: l.user_role,
      content: l.address || `GPS Position Log`,
      latitude: l.latitude,
      longitude: l.longitude,
      address: l.address,
      accuracy: l.accuracy,
      speed: l.speed
    });
  });

  timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return {
    timeRange: {
      startDate: startIso,
      endDate: endIso
    },
    filter: {
      userId: isSpecificUser ? targetUserId : 'all',
      userName: isSpecificUser && allUsers[0] ? allUsers[0].name : 'All Users'
    },
    summary: {
      totalUsersCount: userStats.length,
      activeUsersInRange: userStats.filter(u => u.messageCount > 0 || u.locationCount > 0).length,
      totalMessages: messages.length,
      totalLocationsLogged: locations.length
    },
    userBreakdown: userStats,
    timeline: timeline.slice(0, 250)
  };
}

module.exports = {
  db,
  getUserByPhone,
  getUserById,
  createUser,
  getAllUsers,
  deleteUser,
  saveMessage,
  getRecentMessages,
  upsertLocation,
  getAllLocations,
  clearUserLocation,
  getReportData
};
