// =========================================================
// Chat Room & Real-Time Messaging Controller
// =========================================================

const ChatManager = (function() {
  const chatMessagesEl = document.getElementById('chatMessages');
  const chatInputEl = document.getElementById('chatInput');
  const typingIndicatorEl = document.getElementById('typingIndicator');
  let typingTimeout = null;
  let audioCtx = null;

  // Synthesized notification chime (no external audio assets needed!)
  function playNotificationSound() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  }

  function initChat() {
    // Typing listener
    if (chatInputEl) {
      chatInputEl.addEventListener('input', () => {
        App.getSocket().emit('typing', { isTyping: true });

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          App.getSocket().emit('typing', { isTyping: false });
        }, 1500);
      });
    }

    // Form submit
    const chatForm = document.getElementById('chatForm');
    if (chatForm) {
      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
      });
    }
  }

  function sendMessage() {
    const text = chatInputEl?.value?.trim();
    const attachedLoc = LocationManager.getAttachedLocation();

    if (!text && !attachedLoc) return;

    if (attachedLoc) {
      // Broadcast location accompanied with user's typed message
      App.getSocket().emit('chat_message', {
        type: 'location',
        content: text && text.length > 0 ? text : 'Shared current location',
        latitude: attachedLoc.latitude,
        longitude: attachedLoc.longitude,
        address: attachedLoc.address,
        accuracy: attachedLoc.accuracy,
        heading: attachedLoc.heading,
        speed: attachedLoc.speed
      }, (res) => {
        if (res?.error) {
          App.showToast(res.error, 'error');
        }
      });
      LocationManager.clearAttachedLocation();
    } else {
      // Broadcast standard text message
      App.getSocket().emit('chat_message', {
        type: 'text',
        content: text
      }, (res) => {
        if (res?.error) {
          App.showToast(res.error, 'error');
        }
      });
    }

    if (chatInputEl) chatInputEl.value = '';
    clearTimeout(typingTimeout);
    App.getSocket().emit('typing', { isTyping: false });
  }

  function renderMessage(msg, isInitial = false) {
    if (!chatMessagesEl) return;

    const currentUserId = App.getCurrentUser()?.id;
    const isOutgoing = msg.user_id === currentUserId;
    const isAdmin = msg.user_role === 'admin';
    const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    const item = document.createElement('div');
    item.className = `message-item ${isOutgoing ? 'outgoing' : 'incoming'}`;

    let locationCardHTML = '';
    if (msg.type === 'location' && msg.latitude != null && msg.longitude != null) {
      locationCardHTML = `
        <div class="location-card">
          <div class="location-card-header">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Live Location Pin</span>
          </div>
          ${msg.address ? `<div class="location-card-address">${escapeHTML(msg.address)}</div>` : ''}
          <div class="location-card-coords">Lat: ${Number(msg.latitude).toFixed(5)}, Lng: ${Number(msg.longitude).toFixed(5)}</div>
          <button class="location-card-btn" onclick="ChatManager.focusMap(${msg.latitude}, ${msg.longitude}, ${msg.user_id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/></svg>
            Focus on Map
          </button>
        </div>
      `;
    }

    item.innerHTML = `
      <div class="message-meta">
        <span class="message-sender">${isOutgoing ? 'You' : escapeHTML(msg.user_name)}</span>
        <span class="message-role-tag ${isAdmin ? 'admin' : ''}">${msg.user_role}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-bubble">
        ${msg.content ? `<div>${escapeHTML(msg.content)}</div>` : ''}
        ${locationCardHTML}
      </div>
    `;

    chatMessagesEl.appendChild(item);
    scrollToBottom();

    if (!isInitial && !isOutgoing) {
      playNotificationSound();
    }
  }

  function setInitialMessages(messages) {
    if (!chatMessagesEl) return;
    chatMessagesEl.innerHTML = '';
    if (Array.isArray(messages)) {
      messages.forEach(msg => renderMessage(msg, true));
    }
  }

  function focusMap(lat, lng, userId) {
    // If on mobile screen, switch view to Map
    if (window.innerWidth <= 900) {
      setMobileView('map');
    }

    if (userId) {
      MapManager.centerOnUser(userId);
    } else {
      MapManager.centerOnCoordinates(lat, lng, 16);
    }
    App.showToast('🎯 Centered map on target location');
  }

  function setTyping(data) {
    if (!typingIndicatorEl) return;
    if (data.isTyping) {
      typingIndicatorEl.textContent = `💬 ${escapeHTML(data.userName)} is typing...`;
      typingIndicatorEl.style.display = 'flex';
    } else {
      typingIndicatorEl.style.display = 'none';
    }
  }

  function scrollToBottom() {
    if (chatMessagesEl) {
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  return {
    initChat,
    sendMessage,
    renderMessage,
    setInitialMessages,
    focusMap,
    setTyping
  };
})();
