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

    // 3. Query Per-User Report for User ID 2 (Alex Taylor)
    const perUserReportRes = await fetch(`${baseUrl}/api/admin/reports?userId=2`, {
      headers: { 'Authorization': `Bearer ${adminAuth.token}` }
    });
    const userReport = await perUserReportRes.json();
    console.log('3. Per-User Report for Alex Taylor (ID 2):', perUserReportRes.status);
    console.log('   - Filter target:', userReport.filter.userName);
    console.log('   - User summary:', userReport.summary);

    if (userReport.filter.userId !== 2) {
      throw new Error('Per-user report filter mismatch');
    }

    // 4. Test unauthorized access (Regular user cannot access reports)
    const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+1234567890', password: '123456' })
    });
    const userAuth = await userLoginRes.json();
    const forbiddenRes = await fetch(`${baseUrl}/api/admin/reports?userId=all`, {
      headers: { 'Authorization': `Bearer ${userAuth.token}` }
    });
    console.log('4. Regular User access to reports (expected 403 Forbidden):', forbiddenRes.status);
    if (forbiddenRes.status !== 403) {
      throw new Error('Security check failed: regular user accessed admin reports');
    }

    console.log('\n🎉 ALL ADMIN REPORT GENERATION CHECKS PASSED PERFECTLY!');
  } catch (err) {
    console.error('❌ Report test failed:', err);
    process.exit(1);
  }
}

testReports();
