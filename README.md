# LocationPulse • Real-Time Location Sharing & Tracking

A real-time, privacy-focused location sharing and group communication web application with administrator user management, live GPS tracking, and OpenStreetMap integration.

---

## 🌟 Features

- **Root Admin & Role-Based Access Control**:
  - Root Admin (`admin` / `admin`) can provision, view, and delete user accounts.
  - Generates comprehensive activity & movement audit reports (per-user or all-users, across custom time windows).
  - Print/Save as PDF & Export to CSV support for admin reports.
- **Strict Device GPS Location Sharing**:
  - Genuine hardware GPS coordinates via HTML5 Geolocation API (`navigator.geolocation`).
  - Share location directly or attach a custom message.
- **Interactive OpenStreetMap**:
  - OpenStreetMap standard tiles with Leaflet.js.
  - Active user pins with initials, role badges, accuracy radius, and reverse-geocoded addresses.
  - Real-time updates via Socket.IO WebSockets.
- **Mobile-First Responsive Interface**:
  - Native-feeling bottom navigation bar for mobile devices.
  - Fullscreen tab switching between Chat and Map with touch-friendly controls.
  - Safe-area inset support for modern smartphones.
- **High-Performance Backend**:
  - Powered by Node.js and built-in `node:sqlite` in WAL mode for zero external database dependencies.
  - Ready for containerized deployment with Docker and Dokploy.

---

## 🔑 Default Credentials

| Role | Identifier / Phone | Default Password |
| :--- | :--- | :--- |
| **System Administrator** | `admin` | `admin` |
| **Demo User** | `+1234567890` | `123456` |

---

## 🚀 Local Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run the Server**:
   ```bash
   npm start
   ```

3. **Access**:
   - Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 Deployment with Docker / Dokploy

### Quick Run with Docker Compose:
```bash
docker compose up -d --build
```

### Dokploy Deployment:
1. In your Dokploy dashboard, create a new **Application**.
2. Connect your Git repository.
3. Select **Docker** or **Dockerfile** as the build type (Dockerfile is located in the repository root).
4. Map container port `3000` to your desired domain or host port.
5. *(Recommended)* Add a persistent volume mount for `/app/data` to preserve the SQLite database across redeployments:
   - **Host Path**: `/var/lib/dokploy/volumes/locationshare/data` (or standard Dokploy volume)
   - **Container Path**: `/app/data`
6. Deploy!
