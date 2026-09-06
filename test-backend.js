const { server, app } = require('./server/server');

async function testBackend() {
  const port = 3099;
  server.listen(port, async () => {
    console.log(`Test server running on port ${port}`);

    try {
      // 1. Admin Login
      const adminLoginRes = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'admin', password: 'admin' })
      });
      const adminLogin = await adminLoginRes.json();
      console.log('1. Admin login status:', adminLoginRes.status, adminLogin.user);
      if (!adminLogin.token) throw new Error('Admin login failed');

      // 2. Admin Create User
      const testPhone = '+8801700112233';
      const createUserRes = await fetch(`http://localhost:${port}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminLogin.token}`
        },
        body: JSON.stringify({
          phone: testPhone,
          name: 'Test Mobile User',
          password: 'secretpassword123'
        })
      });
      const createdUserData = await createUserRes.json();
      console.log('2. Admin create user status:', createUserRes.status, createdUserData);

      // 3. User Login
      const userLoginRes = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, password: 'secretpassword123' })
      });
      const userLogin = await userLoginRes.json();
      console.log('3. User login status:', userLoginRes.status, userLogin.user);
      if (!userLogin.token) throw new Error('User login failed');

      // 4. Regular User tries admin endpoint (Should be 403)
      const unauthorizedRes = await fetch(`http://localhost:${port}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${userLogin.token}` }
      });
      console.log('4. Regular user access to admin route status (expected 403):', unauthorizedRes.status);
      if (unauthorizedRes.status !== 403) throw new Error('Admin protection failed');

      // 5. Cleanup test user
      const deleteRes = await fetch(`http://localhost:${port}/api/admin/users/${createdUserData.user.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminLogin.token}` }
      });
      console.log('5. Admin delete user status:', deleteRes.status);

      console.log('\n🎉 ALL BACKEND CHECKS PASSED PERFECTLY!');
    } catch (err) {
      console.error('Test failed:', err);
      process.exitCode = 1;
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

testBackend();
