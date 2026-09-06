async function testReports() {
  const baseUrl = 'http://localhost:3000';
  console.log('🧪 Testing Admin Report Generation on', baseUrl);

  try {
    // 1. Admin Login
    const adminRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin', password: 'admin' })
    });
    const adminAuth = await adminRes.json();
    console.log('1. Admin authenticated:', adminAuth.user.name);

    // 2. Query All Users Report (Last 24 Hours)
    const allUsersReportRes = await fetch(`${baseUrl}/api/admin/reports?userId=all`, {
      headers: { 'Authorization': `Bearer ${adminAuth.token}` }
    });
    const allReport = await allUsersReportRes.json();
    console.log('2. All Users Report Status:', allUsersReportRes.status);
    console.log('   - Time window:', allReport.timeRange.startDate, 'to', allReport.timeRange.endDate);
    console.log('   - Summary:', allReport.summary);
    console.log('   - Users in scope:', allReport.userBreakdown.length);
    console.log('   - Timeline events found:', allReport.timeline.length);

    if (!allReport.summary || !Array.isArray(allReport.userBreakdown)) {
      throw new Error('Invalid all-users report structure');
    }

    // 2b. Create a temporary user for report testing
    const tempPhone = '+1555' + Math.floor(1000000 + Math.random() * 9000000);
    const createUserRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminAuth.token}`
      },
      body: JSON.stringify({
        phone: tempPhone,
        name: 'Report Test User',
        password: 'reportpass123'
      })
    });
    const createdUserData = await createUserRes.json();
    const testUserId = createdUserData.user.id;

    // 3. Query Per-User Report for Created User
    const perUserReportRes = await fetch(`${baseUrl}/api/admin/reports?userId=${testUserId}`, {
      headers: { 'Authorization': `Bearer ${adminAuth.token}` }
    });
    const userReport = await perUserReportRes.json();
    console.log(`3. Per-User Report for ${createdUserData.user.name} (ID ${testUserId}):`, perUserReportRes.status);
    console.log('   - Filter target:', userReport.filter.userName);
    console.log('   - User summary:', userReport.summary);

    if (userReport.filter.userId !== testUserId) {
      throw new Error('Per-user report filter mismatch');
    }

    // 4. Test unauthorized access (Regular user cannot access reports)
    const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: tempPhone, password: 'reportpass123' })
    });
    const userAuth = await userLoginRes.json();
    const forbiddenRes = await fetch(`${baseUrl}/api/admin/reports?userId=all`, {
      headers: { 'Authorization': `Bearer ${userAuth.token}` }
    });
    console.log('4. Regular User access to reports (expected 403 Forbidden):', forbiddenRes.status);
    if (forbiddenRes.status !== 403) {
      throw new Error('Security check failed: regular user accessed admin reports');
    }

    // Cleanup temporary user
    await fetch(`${baseUrl}/api/admin/users/${testUserId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminAuth.token}` }
    });

    console.log('\n🎉 ALL ADMIN REPORT GENERATION CHECKS PASSED PERFECTLY!');
  } catch (err) {
    console.error('❌ Report test failed:', err);
    process.exit(1);
  }
}

testReports();
