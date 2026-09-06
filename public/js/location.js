// =========================================================
// Geolocation Manager (Real Device GPS Only)
// =========================================================

const LocationManager = (function() {
  let isWatching = false;
  let watchId = null;
  let lastBroadcastTime = 0;
  const BROADCAST_THROTTLE_MS = 3000; // Throttle live streaming to once every 3s
  let attachedLocation = null;

  // Set attached location for chat message
  function attachLocation(locData) {
    attachedLocation = locData;
    const bar = document.getElementById('attachedLocationBar');
    const text = document.getElementById('attachedLocationText');
    if (bar && text) {
      const label = locData.address || `${locData.latitude.toFixed(4)}, ${locData.longitude.toFixed(4)}`;
      text.textContent = `📍 Attached: ${label}`;
      bar.style.display = 'flex';
    }
  }

  // Clear attached location
  function clearAttachedLocation() {
    attachedLocation = null;
    const bar = document.getElementById('attachedLocationBar');
    if (bar) bar.style.display = 'none';
  }

  function getAttachedLocation() {
    return attachedLocation;
  }

  // Fetch current position and share into chat or map
  async function fetchAndShare(postToChat = true, customMessage = null) {
    if (!navigator.geolocation) {
      App.showToast('Geolocation is not supported by your device or browser.', 'error');
      return;
    }

    App.showToast('Locating your device GPS coordinates...');

    const chatInputEl = document.getElementById('chatInput');
    const typedText = customMessage != null ? customMessage : chatInputEl?.value?.trim();

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        let address = await reverseGeocode(latitude, longitude);

        if (postToChat) {
          // Use user typed message if provided, otherwise standard "Shared current location"
          const messageContent = typedText && typedText.length > 0
            ? typedText
            : 'Shared current location';

          // Emit chat message with location
          App.getSocket().emit('chat_message', {
            type: 'location',
            content: messageContent,
            latitude,
            longitude,
            address,
            accuracy,
            heading,
            speed
          });

          // Clear input and attached location
          if (chatInputEl) chatInputEl.value = '';
          clearAttachedLocation();

          App.showToast(
            typedText ? '📍 Message and location shared in chat!' : '📍 Location shared with everyone in chat!',
            'success'
          );
        } else {
          // Just broadcast location update to map
          App.getSocket().emit('location_update', {
            latitude,
            longitude,
            accuracy,
            heading,
            speed,
            isLive: 1
          });
          App.showToast('🛰️ Map location refreshed!', 'success');
        }

        MapManager.centerOnCoordinates(latitude, longitude, 16);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        App.showToast(`Unable to get GPS location: ${err.message || 'Permission denied. Please allow location access.'}`, 'error');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000
      }
    );
  }

  // Toggle continuous live tracking
  function toggleLiveTracking() {
    if (isWatching) {
      stopLiveTracking();
    } else {
      startLiveTracking();
    }
  }

  function startLiveTracking() {
    if (!navigator.geolocation) {
      App.showToast('Geolocation not supported on this browser.', 'error');
      return;
    }

    isWatching = true;
    updateLiveButtonUI(true);
    App.showToast('🛰️ Live GPS Broadcasting Started!', 'success');

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastBroadcastTime < BROADCAST_THROTTLE_MS) return;
        lastBroadcastTime = now;

        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        App.getSocket().emit('location_update', {
          latitude,
          longitude,
          accuracy,
          heading,
          speed,
          isLive: 1
        });
      },
      (err) => {
        console.warn('Live watch error:', err);
        stopLiveTracking();
        App.showToast(`Live tracking stopped: ${err.message}`, 'error');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );
  }

  function stopLiveTracking() {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    isWatching = false;
    updateLiveButtonUI(false);
    App.showToast('Live GPS Broadcasting Stopped.');
  }

  function updateLiveButtonUI(active) {
    const btn = document.getElementById('btnLiveTracking');
    const text = document.getElementById('liveTrackingText');
    if (!btn || !text) return;

    if (active) {
      btn.classList.add('active');
      text.textContent = 'Live GPS: ON';
    } else {
      btn.classList.remove('active');
      text.textContent = 'Live GPS: Off';
    }
  }

  // Reverse Geocoding helper
  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const data = await res.json();
        return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      }
    } catch (e) {
      // Fallback
    }
    return `Lat: ${lat.toFixed(4)}, Lng: ${lon.toFixed(4)}`;
  }

  return {
    fetchAndShare,
    toggleLiveTracking,
    stopLiveTracking,
    reverseGeocode,
    attachLocation,
    clearAttachedLocation,
    getAttachedLocation
  };
})();
