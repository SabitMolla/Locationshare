// =========================================================
// Main Application Controller & Orchestration
// =========================================================

const App = (function() {
  let token = localStorage.getItem('locationshare_token') || null;
  let currentUser = null;
  let socket = null;
  let totalMessagesCount = 0;

  function init() {
    // Check existing authentication
    if (token) {
      verifyStoredToken();
    } else {
      openModal('authModal');
    }

    // Attach form and button listeners
    setupEventListeners();

    // Initialize subsystems
    MapManager.initMap();
    ChatManager.initChat();
    AdminManager.initAdmin();
  }

  function setupEventListeners() {
    // Login Form Submit
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin();
      });
    }

    // Helper to prompt user choice modal
    const openShareLocationPrompt = () => {
      const chatInputText = document.getElementById('chatInput')?.value?.trim() || '';
      const modalMsgInput = document.getElementById('shareLocationMsgInput');
      if (modalMsgInput) {
        modalMsgInput.value = chatInputText;
      }
      openModal('shareLocationModal');
    };

    // Nav: Share Location
    document.getElementById('btnShareLocationNav')?.addEventListener('click', openShareLocationPrompt);

    // Chat: Share Location button
    document.getElementById('btnShareLocationChat')?.addEventListener('click', openShareLocationPrompt);

    // Mobile Bottom Nav Center Share Button
    document.getElementById('btnMobileCenterShare')?.addEventListener('click', openShareLocationPrompt);

    // Mobile User Menu: Live Tracking Toggle
    document.getElementById('btnMobileLiveTracking')?.addEventListener('click', () => {
      LocationManager.toggleLiveTracking();
      const isLive = document.getElementById('btnLiveTracking')?.classList.contains('active');
      const mobileLiveText = document.getElementById('mobileLiveText');
      if (mobileLiveText) {
        mobileLiveText.textContent = isLive ? 'Disable Live GPS Tracking' : 'Enable Live GPS Tracking';
      }
    });

    // Mobile User Menu: Admin Console
    document.getElementById('btnMobileAdmin')?.addEventListener('click', () => {
      closeModal('userMenuModal');
      AdminManager.loadAdminData();
      openModal('adminModal');
    });

    // Share Location Option 1: Just Share
    document.getElementById('btnOptJustShare')?.addEventListener('click', () => {
      closeModal('shareLocationModal');
      LocationManager.fetchAndShare(true, '');
    });

    // Share Location Option 2: Share with Message
    document.getElementById('shareWithMessageForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = document.getElementById('shareLocationMsgInput')?.value?.trim() || '';
      closeModal('shareLocationModal');
      LocationManager.fetchAndShare(true, msg);
    });

    // Remove attached location button
    document.getElementById('btnRemoveAttachedLoc')?.addEventListener('click', () => {
      LocationManager.clearAttachedLocation();
    });



    // Nav: Live Tracking Toggle
    document.getElementById('btnLiveTracking')?.addEventListener('click', () => {
      LocationManager.toggleLiveTracking();
    });

    // Nav: Admin Panel
    document.getElementById('btnAdminPanel')?.addEventListener('click', () => {
      AdminManager.loadAdminData();
      openModal('adminModal');
    });

    // Nav: Logout
    document.getElementById('btnLogout')?.addEventListener('click', () => {
      logout();
    });

    // Map Controls
    document.getElementById('btnCenterMe')?.addEventListener('click', () => {
      MapManager.centerOnMe();
    });

    document.getElementById('btnFitAll')?.addEventListener('click', () => {
      MapManager.fitAll();
    });

    document.getElementById('btnToggleLayer')?.addEventListener('click', () => {
      MapManager.toggleLayer();
    });


  }

  async function handleLogin() {
    const identifier = document.getElementById('loginIdentifier')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;
    const submitBtn = document.getElementById('btnLoginSubmit');

    if (!identifier || !password) {
      showToast('Please enter your phone number and password.', 'error');
      return;
    }

    try {
      if (submitBtn) submitBtn.disabled = true;

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Successful login
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('locationshare_token', token);

      showToast(`Welcome back, ${currentUser.name}!`, 'success');
      closeModal('authModal');
      updateUserUI();
      connectSocket();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function verifyStoredToken() {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        closeModal('authModal');
        updateUserUI();
        connectSocket();
      } else {
        // Token expired/invalid
        logout(false);
      }
    } catch (e) {
      logout(false);
    }
  }

  function updateUserUI() {
    if (!currentUser) return;

    // Display Name and Phone/Role
    const nameEl = document.getElementById('userNameDisplay');
    const roleEl = document.getElementById('userRoleBadge');
    const avatarEl = document.getElementById('userAvatarInitial');
    const adminBtn = document.getElementById('btnAdminPanel');

    if (nameEl) nameEl.textContent = currentUser.name;
    if (avatarEl) avatarEl.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();

    if (roleEl) {
      if (currentUser.role === 'admin') {
        roleEl.textContent = '👑 Administrator';
        roleEl.classList.add('admin-badge');
      } else {
        roleEl.textContent = `📞 ${currentUser.phone}`;
        roleEl.classList.remove('admin-badge');
      }
    }

    // Toggle Admin Button visibility (Desktop and Mobile)
    if (adminBtn) {
      adminBtn.style.display = currentUser.role === 'admin' ? 'inline-flex' : 'none';
    }

    // Sync Mobile Profile & Menu elements
    const modalNameEl = document.getElementById('modalUserName');
    const modalPhoneEl = document.getElementById('modalUserPhone');
    const modalAvatarEl = document.getElementById('modalUserAvatar');
    const navMobileAvatarEl = document.getElementById('navMobileAvatar');
    const mobileAdminBtn = document.getElementById('btnMobileAdmin');

    const initialLetter = (currentUser.name || 'U').charAt(0).toUpperCase();
    if (modalNameEl) modalNameEl.textContent = currentUser.name;
    if (modalPhoneEl) modalPhoneEl.textContent = currentUser.role === 'admin' ? 'System Administrator' : currentUser.phone;
    if (modalAvatarEl) modalAvatarEl.textContent = initialLetter;
    if (navMobileAvatarEl) navMobileAvatarEl.textContent = initialLetter;

    if (mobileAdminBtn) {
      mobileAdminBtn.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
    }
  }

  function connectSocket() {
    if (socket) {
      socket.disconnect();
    }

    socket = io({
      auth: { token: token }
    });

    socket.on('connect', () => {
      console.log('✓ Connected to real-time server via Socket.IO');
      updateOnlineStatus(true);
    });

    socket.on('disconnect', () => {
      console.warn('Socket disconnected');
      updateOnlineStatus(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      if (err.message.includes('Authentication') || err.message.includes('token')) {
        logout(false);
      }
    });

    // Real-time events
    socket.on('online_users', (users) => {
      renderOnlineUsers(users);
    });

    socket.on('initial_locations', (locations) => {
      MapManager.setInitialLocations(locations);
    });

    socket.on('initial_messages', (messages) => {
      totalMessagesCount = messages.length;
      updateMessageCountMetric();
      ChatManager.setInitialMessages(messages);
    });

    socket.on('chat_message', (message) => {
      totalMessagesCount++;
      updateMessageCountMetric();
      ChatManager.renderMessage(message);
    });

    socket.on('location_updated', (location) => {
      MapManager.updateUserMarker(location);
    });

    socket.on('user_typing', (data) => {
      ChatManager.setTyping(data);
    });

    socket.on('admin_user_created', (newUser) => {
      showToast(`📢 User account "${newUser.name}" registered in system.`);
      if (currentUser?.role === 'admin') {
        AdminManager.loadAdminData();
      }
    });

    socket.on('admin_user_deleted', (data) => {
      MapManager.removeMarker(data.id);
      if (currentUser?.role === 'admin') {
        AdminManager.loadAdminData();
      }
    });
  }

  function renderOnlineUsers(users) {
    const bar = document.getElementById('onlineUsersBar');
    const subtitle = document.getElementById('onlineStatusSubtitle');
    const metricOnline = document.getElementById('metricOnlineUsers');

    if (metricOnline) metricOnline.textContent = users.length;
    if (subtitle) {
      subtitle.textContent = `${users.length} ${users.length === 1 ? 'member' : 'members'} online now`;
    }

    if (!bar) return;
    bar.innerHTML = `<span class="online-tag">Online (${users.length}):</span>`;

    users.forEach(u => {
      const chip = document.createElement('div');
      chip.className = 'online-user-chip';
      const isSelf = u.id === currentUser?.id;
      chip.innerHTML = `
        <div class="online-dot"></div>
        <span>${escapeHTML(u.name)}${isSelf ? ' (You)' : ''}</span>
      `;
      chip.style.cursor = 'pointer';
      chip.title = `Click to view ${u.name} on map`;
      chip.addEventListener('click', () => {
        MapManager.centerOnUser(u.id);
      });
      bar.appendChild(chip);
    });
  }

  function updateOnlineStatus(connected) {
    const indicator = document.querySelector('.room-status-indicator');
    const subtitle = document.getElementById('onlineStatusSubtitle');
    if (indicator) {
      indicator.style.background = connected ? 'var(--status-online)' : 'var(--status-offline)';
      indicator.style.boxShadow = connected ? '0 0 8px var(--status-online)' : 'none';
    }
    if (!connected && subtitle) {
      subtitle.textContent = 'Reconnecting to network...';
    }
  }

  function updateMessageCountMetric() {
    const el = document.getElementById('metricTotalMessages');
    if (el) el.textContent = totalMessagesCount;
  }

  function logout(showNotice = true) {
    LocationManager.stopLiveTracking();
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    token = null;
    currentUser = null;
    localStorage.removeItem('locationshare_token');

    openModal('authModal');
    if (showNotice) {
      showToast('Logged out successfully.');
    }
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  return {
    init,
    getToken: () => token,
    getCurrentUser: () => currentUser,
    getSocket: () => socket,
    showToast,
    logout
  };
})();

// =========================================================
// Global Helper Functions (Accessible to HTML attributes)
// =========================================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}





function setMobileView(view) {
  const chat = document.getElementById('chatContainer');
  const btnChat = document.getElementById('btnToggleChat');
  const btnMap = document.getElementById('btnToggleMap');

  // Update bottom nav items
  const navTabs = document.querySelectorAll('.mobile-nav-item');
  navTabs.forEach(tab => {
    if (tab.getAttribute('data-view') === view) {
      tab.classList.add('active');
    } else if (tab.hasAttribute('data-view')) {
      tab.classList.remove('active');
    }
  });

  if (view === 'map') {
    chat?.classList.add('hide-mobile');
    btnMap?.classList.add('active');
    btnChat?.classList.remove('active');
    // Ensure Leaflet map recalculates its dimensions smoothly
    setTimeout(() => {
      MapManager.invalidateSize();
    }, 120);
  } else {
    chat?.classList.remove('hide-mobile');
    btnChat?.classList.add('active');
    btnMap?.classList.remove('active');
  }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
