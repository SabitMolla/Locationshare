const { io: ioClient } = require('socket.io-client');

async function verifyE2E() {
  const baseUrl = 'http://localhost:3000';
  console.log('🧪 Starting End-to-End Automated Verification on', baseUrl);

  try {
    // 1. Admin Login
    console.log('\n--- Test 1: Admin Login with ID "admin" and password "admin" ---');
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin', password: 'admin' })
    });
    const adminAuth = await adminLoginRes.json();
    if (!adminAuth.token || adminAuth.user.role !== 'admin') {
      throw new Error(`Admin login failed: ${JSON.stringify(adminAuth)}`);
    }
    console.log('✓ Admin login successful! Token acquired. Role:', adminAuth.user.role);

    // 2. Admin creates a user
    console.log('\n--- Test 2: Admin Creates a New User ---');
    const uniquePhone = '+1555' + Math.floor(1000000 + Math.random() * 9000000);
    const newUserPayload = {
      phone: uniquePhone,
      name: 'Officer Marcus',
      password: 'officerpass123',
      role: 'user'
    };
    const createUserRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminAuth.token}`
      },
      body: JSON.stringify(newUserPayload)
    });
    const createdUserData = await createUserRes.json();
    if (!createdUserData.success) {
      throw new Error(`User creation failed: ${JSON.stringify(createdUserData)}`);
    }
    console.log('✓ User created successfully:', createdUserData.user);

    // 3. User logs in with phone number and password
    console.log('\n--- Test 3: User logs in with phone number and password ---');
    const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: newUserPayload.phone, password: newUserPayload.password })
    });
    const userAuth = await userLoginRes.json();
    if (!userAuth.token || userAuth.user.phone !== newUserPayload.phone) {
      throw new Error(`User login failed: ${JSON.stringify(userAuth)}`);
    }
    console.log('✓ User logged in successfully:', userAuth.user);

    // 4. Connect Admin and User via WebSockets
    console.log('\n--- Test 4: Real-time Socket.IO Connection & Location Sharing ---');
    const adminSocket = ioClient(baseUrl, {
      auth: { token: adminAuth.token }
    });

    const userSocket = ioClient(baseUrl, {
      auth: { token: userAuth.token }
    });

    await new Promise((resolve, reject) => {
      let adminConnected = false;
      let userConnected = false;

      adminSocket.on('connect', () => {
        adminConnected = true;
        if (userConnected) resolve();
      });

      userSocket.on('connect', () => {
        userConnected = true;
        if (adminConnected) resolve();
      });

      setTimeout(() => {
        if (!adminConnected || !userConnected) {
          reject(new Error('Socket connection timed out'));
        }
      }, 5000);
    });
    console.log('✓ Both Admin and User connected to real-time WebSockets');

    // 5. User shares location and chat message
    console.log('\n--- Test 5: User broadcasts location message ---');
    const testLocation = {
      type: 'location',
      content: 'Reporting from Midtown Headquarters',
      latitude: 40.7580,
      longitude: -73.9855,
      address: 'Times Square, New York, NY',
      accuracy: 10
    };

    const locationReceivedPromise = new Promise((resolve) => {
      adminSocket.on('chat_message', (msg) => {
        console.log('  [Admin Socket Received Message]:', msg.user_name, ':', msg.content, `(Type: ${msg.type}, Lat: ${msg.latitude}, Lng: ${msg.longitude})`);
        if (msg.user_id === userAuth.user.id && msg.type === 'location') {
          resolve(msg);
        }
      });
    });

    const mapUpdatePromise = new Promise((resolve) => {
      adminSocket.on('location_updated', (loc) => {
        console.log('  [Admin Socket Received Map Location Update]:', loc.user_name, '-> Lat:', loc.latitude, 'Lng:', loc.longitude);
        if (loc.user_id === userAuth.user.id) {
          resolve(loc);
        }
      });
    });

    userSocket.emit('chat_message', testLocation);

    const receivedMessage = await locationReceivedPromise;
    const receivedLocation = await mapUpdatePromise;

    if (receivedMessage.latitude !== testLocation.latitude || receivedLocation.longitude !== testLocation.longitude) {
      throw new Error('Coordinates mismatch in socket broadcast');
    }
    console.log('✓ Location message and map update successfully received by Admin in real-time!');

    // 6. Verify GET /api/locations returns the user's latest location
    console.log('\n--- Test 6: Verify Persistence of Locations via REST API ---');
    const locsRes = await fetch(`${baseUrl}/api/locations`, {
      headers: { 'Authorization': `Bearer ${adminAuth.token}` }
    });
    const locs = await locsRes.json();
    const foundUserLoc = locs.find(l => l.user_id === userAuth.user.id);
    if (!foundUserLoc) {
      throw new Error('User location not persisted in DB');
    }
    console.log('✓ User location persisted in DB:', foundUserLoc.user_name, foundUserLoc.latitude, foundUserLoc.longitude);

    // Clean up test sockets
    adminSocket.disconnect();
    userSocket.disconnect();

    console.log('\n======================================================');
    console.log('🎉 ALL END-TO-END VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  }
}

verifyE2E();
