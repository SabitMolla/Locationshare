// =========================================================
// Admin Management & Reporting Controller
// =========================================================

const AdminManager = (function() {
  const userTableBody = document.getElementById('userTableBody');
  const createUserForm = document.getElementById('createUserForm');
  let currentUsersList = [];
  let currentReportData = null;

  function initAdmin() {
    if (createUserForm) {
      createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleCreateUser();
      });
    }

    // Set default custom dates (now and 24h ago)
    const startInput = document.getElementById('reportCustomStart');
    const endInput = document.getElementById('reportCustomEnd');
    if (startInput && endInput) {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      endInput.value = now.toISOString().slice(0, 16);
      startInput.value = yesterday.toISOString().slice(0, 16);
    }
  }

  function switchTab(tab) {
    const tabUsers = document.getElementById('tabAdminUsers');
    const tabReports = document.getElementById('tabAdminReports');
    const sectionUsers = document.getElementById('adminUsersSection');
    const sectionReports = document.getElementById('adminReportsSection');

    if (tab === 'reports') {
      tabReports?.classList.add('active');
      tabUsers?.classList.remove('active');
      if (sectionUsers) sectionUsers.style.display = 'none';
      if (sectionReports) sectionReports.style.display = 'block';

      // Ensure user dropdown is populated and generate initial 24h report if empty
      populateUserDropdown(currentUsersList);
      if (!currentReportData) {
        generateReport();
      }
    } else {
      tabUsers?.classList.add('active');
      tabReports?.classList.remove('active');
      if (sectionUsers) sectionUsers.style.display = 'block';
      if (sectionReports) sectionReports.style.display = 'none';
    }
  }

  function onTimeRangeChange(val) {
    const customRow = document.getElementById('customDateRangeRow');
    if (customRow) {
      customRow.style.display = val === 'custom' ? 'grid' : 'none';
    }
  }

  async function loadAdminData() {
    const token = App.getToken();
    if (!token) return;

    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error(`Failed to load users (${res.status})`);
      }

      const users = await res.json();
      currentUsersList = users;
      renderUserTable(users);
      updateMetrics(users);
      populateUserDropdown(users);
    } catch (err) {
      console.error('Error loading admin data:', err);
      App.showToast(err.message, 'error');
    }
  }

  function populateUserDropdown(users) {
    const select = document.getElementById('reportUserSelect');
    if (!select) return;

    const currentVal = select.value || 'all';
    select.innerHTML = '<option value="all">🌐 All Users (System Overview)</option>';

    if (Array.isArray(users)) {
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `👤 ${u.name} (${u.phone})${u.role === 'admin' ? ' [Admin]' : ''}`;
        select.appendChild(opt);
      });
    }

    select.value = currentVal;
  }

  async function handleCreateUser() {
    const phone = document.getElementById('newUserPhone')?.value?.trim();
    const name = document.getElementById('newUserName')?.value?.trim();
    const password = document.getElementById('newUserPassword')?.value;
    const role = document.getElementById('newUserRole')?.value || 'user';
    const submitBtn = document.getElementById('btnSubmitCreateUser');

    if (!phone || !name || !password) {
      App.showToast('Please fill in all required fields.', 'error');
      return;
    }

    try {
      if (submitBtn) submitBtn.disabled = true;

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${App.getToken()}`
        },
        body: JSON.stringify({ phone, name, password, role })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      App.showToast(`✓ User "${data.user.name}" created successfully!`, 'success');
      createUserForm.reset();
      await loadAdminData();
    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function deleteUser(id, name) {
    if (!confirm(`Are you sure you want to permanently delete user "${name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${App.getToken()}` }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      App.showToast(`User "${name}" deleted.`, 'success');
      MapManager.removeMarker(id);
      await loadAdminData();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  }

  function renderUserTable(users) {
    if (!userTableBody) return;
    userTableBody.innerHTML = '';

    if (!users || users.length === 0) {
      userTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No users found.</td></tr>`;
      return;
    }

    users.forEach(u => {
      const tr = document.createElement('tr');
      const isRootAdmin = u.phone.toLowerCase() === 'admin';
      const createdDate = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A';

      let locationText = '<span style="color: var(--text-muted);">No location yet</span>';
      if (u.latitude != null && u.longitude != null) {
        locationText = `
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.72rem;" onclick="AdminManager.viewUserOnMap(${u.latitude}, ${u.longitude}, ${u.id})">
            📍 ${Number(u.latitude).toFixed(3)}, ${Number(u.longitude).toFixed(3)}
          </button>
        `;
      }

      tr.innerHTML = `
        <td>#${u.id}</td>
        <td><strong>${escapeHTML(u.name)}</strong></td>
        <td><code>${escapeHTML(u.phone)}</code></td>
        <td>
          <span class="message-role-tag ${u.role === 'admin' ? 'admin' : ''}">
            ${u.role}
          </span>
        </td>
        <td>${locationText}</td>
        <td style="color: var(--text-muted); font-size: 0.75rem;">${createdDate}</td>
        <td>
          ${isRootAdmin ? '<span style="color: var(--text-muted); font-size: 0.72rem;">Protected</span>' : `
            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="AdminManager.deleteUser(${u.id}, '${escapeHTML(u.name)}')">
              Delete
            </button>
          `}
        </td>
      `;

      userTableBody.appendChild(tr);
    });
  }

  function updateMetrics(users) {
    const totalUsersEl = document.getElementById('metricTotalUsers');
    const activeLocsEl = document.getElementById('metricActiveLocations');

    if (totalUsersEl) totalUsersEl.textContent = users.length;

    let locCount = 0;
    users.forEach(u => {
      if (u.latitude != null && u.longitude != null) locCount++;
    });
    if (activeLocsEl) activeLocsEl.textContent = locCount;
  }

  function viewUserOnMap(lat, lng, userId) {
    closeModal('adminModal');
    if (window.innerWidth <= 900) {
      setMobileView('map');
    }
    MapManager.centerOnUser(userId);
  }

  // =========================================================
  // Report Generation & Print Functions
  // =========================================================
  async function generateReport() {
    const token = App.getToken();
    if (!token) return;

    const userSelect = document.getElementById('reportUserSelect');
    const timeSelect = document.getElementById('reportTimeRangeSelect');
    const customStart = document.getElementById('reportCustomStart');
    const customEnd = document.getElementById('reportCustomEnd');
    const docContainer = document.getElementById('reportDocumentContent');

    const userId = userSelect?.value || 'all';
    const timeRange = timeSelect?.value || '24h';

    let startDate = null;
    let endDate = null;
    const now = new Date();

    if (timeRange === '1h') {
      startDate = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      endDate = now.toISOString();
    } else if (timeRange === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      endDate = now.toISOString();
    } else if (timeRange === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      endDate = now.toISOString();
    } else if (timeRange === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      endDate = now.toISOString();
    } else if (timeRange === 'custom') {
      if (customStart?.value) startDate = new Date(customStart.value).toISOString();
      if (customEnd?.value) endDate = new Date(customEnd.value).toISOString();
    }

    if (docContainer) {
      docContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-secondary);">⏳ Generating report data...</div>`;
    }

    try {
      const queryParams = new URLSearchParams();
      if (userId) queryParams.set('userId', userId);
      if (startDate) queryParams.set('startDate', startDate);
      if (endDate) queryParams.set('endDate', endDate);

      const res = await fetch(`/api/admin/reports?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error(`Failed to generate report (${res.status})`);
      }

      const data = await res.json();
      currentReportData = data;
      renderReportDocument(data);
      App.showToast('✓ Activity report generated successfully!', 'success');
    } catch (err) {
      console.error('Error generating report:', err);
      if (docContainer) {
        docContainer.innerHTML = `<div style="color: #ef4444; padding: 20px;">Failed to generate report: ${escapeHTML(err.message)}</div>`;
      }
      App.showToast(err.message, 'error');
    }
  }

  function renderReportDocument(data) {
    const docContainer = document.getElementById('reportDocumentContent');
    if (!docContainer || !data) return;

    const startStr = new Date(data.timeRange.startDate).toLocaleString();
    const endStr = new Date(data.timeRange.endDate).toLocaleString();
    const generatedStr = new Date().toLocaleString();
    const isSingleUser = data.filter.userId !== 'all';

    let userBreakdownHTML = '';
    if (!isSingleUser && Array.isArray(data.userBreakdown)) {
      userBreakdownHTML = `
        <div class="report-table-section">
          <div class="report-table-title">👥 User Activity Summary (${data.userBreakdown.length} Accounts)</div>
          <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
            <table class="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Messages</th>
                  <th>Locations</th>
                  <th>First Activity</th>
                  <th>Last Activity</th>
                  <th>Latest Location</th>
                </tr>
              </thead>
              <tbody>
                ${data.userBreakdown.map(u => `
                  <tr>
                    <td><strong>${escapeHTML(u.name)}</strong></td>
                    <td><code>${escapeHTML(u.phone)}</code></td>
                    <td><span class="message-role-tag ${u.role === 'admin' ? 'admin' : ''}">${u.role}</span></td>
                    <td><strong>${u.messageCount}</strong></td>
                    <td><strong>${u.locationCount}</strong></td>
                    <td>${u.firstActivity ? new Date(u.firstActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None'}</td>
                    <td>${u.lastActivity ? new Date(u.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None'}</td>
                    <td>
                      ${u.latestLocation ? `📍 ${Number(u.latestLocation.latitude).toFixed(3)}, ${Number(u.latestLocation.longitude).toFixed(3)}` : '<span style="color:var(--text-muted)">None</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    let timelineHTML = '';
    if (Array.isArray(data.timeline) && data.timeline.length > 0) {
      timelineHTML = `
        <div class="report-table-section">
          <div class="report-table-title">📍 Activity & Movement Trail (${data.timeline.length} Events)</div>
          <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Event Type</th>
                  <th>Coordinates</th>
                  <th>Location / Address</th>
                  <th>Message Content</th>
                </tr>
              </thead>
              <tbody>
                ${data.timeline.map(item => {
                  const itemTime = new Date(item.timestamp).toLocaleString();
                  const isLoc = item.latitude != null && item.longitude != null;
                  return `
                    <tr>
                      <td style="white-space: nowrap; font-size: 0.75rem;">${itemTime}</td>
                      <td><strong>${escapeHTML(item.userName)}</strong></td>
                      <td>
                        <span class="report-pill" style="color: ${item.type.includes('location') ? '#38bdf8' : '#a5b4fc'};">
                          ${item.type === 'location_share' ? '📍 Shared Pin' : (item.type === 'location_broadcast' ? '🛰️ Live GPS' : '💬 Chat Message')}
                        </span>
                      </td>
                      <td style="font-family: monospace; font-size: 0.75rem;">
                        ${isLoc ? `${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}` : '—'}
                      </td>
                      <td style="font-size: 0.78rem;">${escapeHTML(item.address || '—')}</td>
                      <td style="font-size: 0.8rem;">${escapeHTML(item.content || '—')}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      timelineHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted); background: var(--bg-surface-elevated); border-radius: var(--radius-sm);">
          No activity logs or messages recorded in this selected time range.
        </div>
      `;
    }

    docContainer.innerHTML = `
      <div class="report-doc-container">
        <!-- Document Header -->
        <div class="report-doc-header">
          <div>
            <div class="report-doc-title">LOCATIONPULSE • ACTIVITY & AUDIT REPORT</div>
            <div class="report-doc-subtitle">Official tracking and communication report</div>
            <div class="report-badge-meta">
              <span class="report-pill"><strong>Scope:</strong> ${escapeHTML(data.filter.userName)}</span>
              <span class="report-pill"><strong>Time Window:</strong> ${startStr} — ${endStr}</span>
              <span class="report-pill"><strong>Generated:</strong> ${generatedStr}</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Confidential Report</div>
            <div style="font-size: 0.78rem; font-weight: 600; color: var(--accent-secondary);">Generated by Administrator</div>
          </div>
        </div>

        <!-- Metrics Strip -->
        <div class="report-metrics-strip">
          <div class="report-metric-box">
            <div class="val">${data.summary.totalUsersCount}</div>
            <div class="lbl">Users in Scope</div>
          </div>
          <div class="report-metric-box">
            <div class="val">${data.summary.activeUsersInRange}</div>
            <div class="lbl">Active Users</div>
          </div>
          <div class="report-metric-box">
            <div class="val">${data.summary.totalMessages}</div>
            <div class="lbl">Messages Sent</div>
          </div>
          <div class="report-metric-box">
            <div class="val">${data.summary.totalLocationsLogged}</div>
            <div class="lbl">Locations Logged</div>
          </div>
        </div>

        <!-- Tables -->
        ${userBreakdownHTML}
        ${timelineHTML}
      </div>
    `;
  }

  function printReport() {
    if (!currentReportData) {
      App.showToast('Generating report before printing...');
      generateReport().then(() => {
        setTimeout(() => window.print(), 300);
      });
    } else {
      window.print();
    }
  }

  function exportReportCSV() {
    if (!currentReportData || !Array.isArray(currentReportData.timeline) || currentReportData.timeline.length === 0) {
      App.showToast('No report data available to export.', 'error');
      return;
    }

    const headers = ['Timestamp', 'User ID', 'User Name', 'Phone', 'Role', 'Event Type', 'Latitude', 'Longitude', 'Address', 'Content'];
    const rows = currentReportData.timeline.map(item => [
      `"${item.timestamp}"`,
      item.userId,
      `"${escapeCSV(item.userName)}"`,
      `"${escapeCSV(item.userPhone)}"`,
      `"${escapeCSV(item.userRole)}"`,
      `"${escapeCSV(item.type)}"`,
      item.latitude != null ? item.latitude : '',
      item.longitude != null ? item.longitude : '',
      `"${escapeCSV(item.address || '')}"`,
      `"${escapeCSV(item.content || '')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    const scopeSlug = (currentReportData.filter.userName || 'report').toLowerCase().replace(/[^a-z0-9]/g, '_');
    a.download = `LocationPulse_Report_${scopeSlug}_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    App.showToast('📥 Report exported as CSV file!', 'success');
  }

  function escapeCSV(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '""');
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  return {
    initAdmin,
    loadAdminData,
    deleteUser,
    viewUserOnMap,
    switchTab,
    onTimeRangeChange,
    generateReport,
    printReport,
    exportReportCSV
  };
})();
