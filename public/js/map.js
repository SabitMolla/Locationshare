// =========================================================
// Leaflet Map & Marker Management
// =========================================================

const MapManager = (function() {
  let map = null;
  const markers = new Map(); // userId -> { marker, accuracyCircle, data }
  let currentLayerIndex = 0;

  const tileLayers = [
    {
      name: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxZoom: 19
    },
    {
      name: 'CartoDB Dark',
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19
    }
  ];

  let currentTileLayer = null;

  function initMap() {
    if (map) return;

    // Default center: Global view or initial pleasant coordinate
    map = L.map('leaflet-map', {
      center: [20.0, 0.0],
      zoom: 3,
      zoomControl: false
    });

    // Custom zoom control position
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Set OpenStreetMap as the default active tile layer
    currentTileLayer = L.tileLayer(tileLayers[0].url, {
      attribution: tileLayers[0].attribution,
      maxZoom: tileLayers[0].maxZoom
    }).addTo(map);



    // Handle resize
    window.addEventListener('resize', () => {
      map.invalidateSize();
    });
  }

  function toggleLayer() {
    if (!map) return;
    currentLayerIndex = (currentLayerIndex + 1) % tileLayers.length;
    const nextLayer = tileLayers[currentLayerIndex];

    map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(nextLayer.url, {
      attribution: nextLayer.attribution,
      maxZoom: nextLayer.maxZoom
    }).addTo(map);

    App.showToast(`Switched map to ${nextLayer.name}`);
  }

  function createCustomIcon(data, isSelf = false) {
    const initial = (data.user_name || 'U').charAt(0).toUpperCase();
    const isAdmin = data.user_role === 'admin';
    const isLive = data.is_live === 1;

    const html = `
      <div class="user-map-marker">
        ${isLive ? '<div class="marker-radar ' + (isSelf ? 'live' : '') + '"></div>' : ''}
        <div class="marker-pin-outer ${isAdmin ? 'admin' : ''} ${isSelf ? 'self' : ''}">
          ${initial}
        </div>
      </div>
    `;

    return L.divIcon({
      className: 'custom-leaflet-marker',
      html: html,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22]
    });
  }

  function updateUserMarker(data) {
    if (!map) initMap();
    if (!data || data.latitude == null || data.longitude == null) return;

    const currentUserId = App.getCurrentUser()?.id;
    const isSelf = currentUserId === data.user_id;

    const lat = Number(data.latitude);
    const lng = Number(data.longitude);
    const icon = createCustomIcon(data, isSelf);

    const timeStr = data.updated_at ? new Date(data.updated_at).toLocaleTimeString() : 'Just now';
    const popupContent = `
      <div class="popup-user-card">
        <div class="popup-user-header">
          <span class="popup-user-name">${escapeHTML(data.user_name)}</span>
          <span class="message-role-tag ${data.user_role === 'admin' ? 'admin' : ''}">${data.user_role}</span>
        </div>
        <div class="popup-user-phone">📞 ${escapeHTML(data.user_phone)}</div>
        <div class="popup-user-meta">📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
        <div class="popup-user-meta">🕒 Last update: ${timeStr}</div>
        ${data.accuracy ? `<div class="popup-user-meta">🎯 Accuracy: ±${Math.round(data.accuracy)}m</div>` : ''}
        ${data.speed ? `<div class="popup-user-meta">⚡ Speed: ${Math.round(data.speed * 3.6)} km/h</div>` : ''}
      </div>
    `;

    if (markers.has(data.user_id)) {
      const existing = markers.get(data.user_id);
      existing.marker.setLatLng([lat, lng]);
      existing.marker.setIcon(icon);
      existing.marker.setPopupContent(popupContent);
      existing.data = data;

      if (existing.accuracyCircle && data.accuracy) {
        existing.accuracyCircle.setLatLng([lat, lng]);
        existing.accuracyCircle.setRadius(data.accuracy);
      }
    } else {
      const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
      marker.bindPopup(popupContent);

      let accuracyCircle = null;
      if (data.accuracy && data.accuracy > 5) {
        accuracyCircle = L.circle([lat, lng], {
          radius: data.accuracy,
          color: isSelf ? '#10b981' : '#6366f1',
          fillColor: isSelf ? '#10b981' : '#6366f1',
          fillOpacity: 0.08,
          weight: 1
        }).addTo(map);
      }

      markers.set(data.user_id, { marker, accuracyCircle, data });
    }

    updateActiveCount();
  }

  function setInitialLocations(locationsList) {
    if (!Array.isArray(locationsList)) return;
    locationsList.forEach(loc => updateUserMarker(loc));
    if (locationsList.length > 0) {
      fitAll();
    }
  }

  function centerOnUser(userId) {
    if (!map) return;
    const item = markers.get(userId);
    if (item) {
      const latLng = item.marker.getLatLng();
      map.flyTo(latLng, 15, { duration: 1.2 });
      item.marker.openPopup();
    }
  }

  function centerOnCoordinates(lat, lng, zoom = 15) {
    if (!map) initMap();
    map.flyTo([lat, lng], zoom, { duration: 1.2 });
  }

  function fitAll() {
    if (!map || markers.size === 0) return;
    const bounds = L.latLngBounds();
    markers.forEach(item => {
      bounds.extend(item.marker.getLatLng());
    });
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }

  function centerOnMe() {
    const currentUserId = App.getCurrentUser()?.id;
    if (currentUserId && markers.has(currentUserId)) {
      centerOnUser(currentUserId);
    } else {
      // Trigger instant location fetch
      LocationManager.fetchAndShare(false);
    }
  }

  function removeMarker(userId) {
    if (markers.has(userId)) {
      const item = markers.get(userId);
      if (map) {
        map.removeLayer(item.marker);
        if (item.accuracyCircle) map.removeLayer(item.accuracyCircle);
      }
      markers.delete(userId);
      updateActiveCount();
    }
  }

  function updateActiveCount() {
    const countEl = document.getElementById('activeMapCount');
    if (countEl) {
      const count = markers.size;
      countEl.textContent = `${count} ${count === 1 ? 'user' : 'users'}`;
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  function invalidateSize() {
    if (map) {
      map.invalidateSize();
    }
  }

  return {
    initMap,
    toggleLayer,
    updateUserMarker,
    setInitialLocations,
    centerOnUser,
    centerOnCoordinates,
    fitAll,
    centerOnMe,
    removeMarker,
    invalidateSize
  };
})();
