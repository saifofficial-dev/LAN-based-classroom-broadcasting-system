# 🖥️ Classroom Broadcast System

A real-time **LAN-based classroom broadcasting system** that lets a teacher share their screen and voice with students over a local Wi-Fi network — **no internet required**. Built with Node.js, Socket.IO, and WebRTC.

---

## ✨ Features

| Feature | Description |
|--------|-------------|
| 📡 **Live Screen Broadcast** | Teacher shares their screen via WebRTC; students see it live |
| 🎤 **Voice Broadcasting** | Teacher's microphone is streamed live to all students |
| 👆 **Laser Pointer** | Teacher moves a red laser dot visible on all student screens |
| 💬 **Live Chat** | Real-time chat between teacher and students |
| ✋ **Raise Hand** | Students raise their hand; teacher sees it instantly |
| 🎨 **Whiteboard** | Teacher can draw/annotate on a shared canvas |
| 🔐 **Password-protected Rooms** | Optional password per classroom |
| 🏫 **Classroom Discovery** | Students browse and click on live classrooms — no codes to type |
| 📁 **File Sharing** | Teacher uploads files; students download them |
| 🔒 **HTTPS on LAN** | Auto-generated self-signed cert for secure WebRTC |
| 🌐 **LAN-only** | Works entirely on local Wi-Fi, no internet needed |

---

## 📋 Requirements

- **Node.js** v18 or higher
- All devices (teacher + students) connected to the **same Wi-Fi network**
- Chrome or Edge browser (recommended)

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd classroom-lan/server
npm install
```

### 2. Start the Server

```bash
npm start
```

You will see output like:

```
[SSL] Generating self-signed certificate for 172.17.x.x ...
[SSL] Certificate ready
[Database] Connected to SQLite database
[Database] Schema initialized
=== Classroom Server Running ===
LAN IP:    https://172.17.x.x:3000
Teacher:   https://172.17.x.x:3000/teacher
Student:   https://172.17.x.x:3000/student
Note: Accept the self-signed cert warning in browser
================================
```

> The LAN IP is auto-detected from your Wi-Fi adapter. Note it down — students need it.

---

## 🖥️ Teacher Setup

1. Open Chrome and go to:
   ```
   https://<your-lan-ip>:3000/teacher
   ```
2. **Accept the security warning** → click **Advanced → Proceed to ... (unsafe)**
   *(Required once for the self-signed HTTPS certificate)*
3. Type your **name** in the top bar (e.g. `Mr. Ahmed`)
4. Click **🏠 Create Classroom** → enter a Room Code (e.g. `MATH-101`) and an optional password
5. Click **▶ Start Broadcast** → select the screen/window to share
   - Browser will also ask for **microphone permission** — allow it
6. Students can now join and view your screen

---

## 👨‍🎓 Student Setup

1. Open Chrome on any device on the **same Wi-Fi** and go to:
   ```
   https://172.17.100.152:3000/student
   ```
   *(IP is hardcoded — change `SERVER_IP` in `student-app/public/index.html` if your server IP changes)*
2. **Accept the security warning** (same as teacher)
3. Enter your **name** and click **Browse Classrooms →**
4. Click on any **live classroom card** to join
5. Enter password if prompted

---

## 🎮 Teacher Controls

| Button | Action |
|--------|--------|
| 🏠 **Create Classroom** | Opens room creation dialog |
| ▶ **Start Broadcast** | Start screen sharing + mic capture |
| ⏹ **Stop Broadcast** | Stop broadcast and mic |
| 🎤 **Mic: Muted / 🔴 Mic: ON** | Toggle microphone on/off (students hear you when ON) |
| 🎨 **Whiteboard** | Toggle whiteboard canvas |
| 👆 **Pointer** | Toggle laser pointer (tracks mouse over broadcast area) |

---

## 🎤 Voice Broadcasting

When the teacher clicks **▶ Start Broadcast**:
- The browser requests **screen share** permission followed by **microphone** permission
- The mic starts **muted** by default
- Clicking **🎤 Mic: Muted** turns it red → **🔴 Mic: ON** — students hear the teacher's voice live
- Clicking again mutes the mic
- When broadcast is stopped, the mic is automatically released

Students **automatically receive the audio** — no configuration needed on their side.

---

## 🏫 Classroom Discovery (Student Side)

Students no longer need to type room codes or IP addresses manually:
1. Enter your name → click **Browse Classrooms →**
2. The app shows all **active rooms** as clickable cards
3. Cards display: teacher name, room code, student count, and **LIVE** badge
4. Click any card to join instantly
5. The room list **auto-refreshes** when new classrooms are created

---

## 📁 Project Structure

```
classroom-lan/
├── server/                         # Node.js backend
│   ├── src/
│   │   ├── index.js                # Entry point (HTTPS + Express + Socket.IO)
│   │   ├── config/
│   │   │   └── database.js         # SQLite connection & async wrapper
│   │   ├── database/
│   │   │   ├── schema.sql          # Database schema
│   │   │   └── migrate.js          # DB initializer
│   │   ├── api/
│   │   │   ├── middleware/
│   │   │   │   └── lanOnly.js      # Block non-LAN requests
│   │   │   └── routes/
│   │   │       ├── auth.js         # Auth routes (not used in UI)
│   │   │       ├── classroom.js    # Classroom CRUD
│   │   │       ├── sessions.js     # Session management
│   │   │       └── files.js        # File upload/download
│   │   ├── signaling/
│   │   │   ├── signalingServer.js  # Socket.IO event handlers
│   │   │   └── roomManager.js      # In-memory room state
│   │   └── utils/
│   │       ├── networkUtils.js     # LAN IP detection
│   │       ├── generateCert.js     # Self-signed TLS cert (node-forge)
│   │       ├── crypto.js           # Auth bypass (open dashboard)
│   │       └── logger.js           # Winston logger
│   ├── uploads/                    # Uploaded files storage
│   └── package.json
│
├── teacher-app/
│   └── public/
│       └── index.html              # Teacher UI (dashboard, broadcast, mic, pointer, chat)
│
├── student-app/
│   └── public/
│       └── index.html              # Student UI (room browser, video viewer, chat, hand raise)
│
└── README.md
```

---

## 🔧 Configuration

| Setting | Location | Default | Notes |
|---------|----------|---------|-------|
| Server port | `server/src/index.js` | `3000` | HTTPS port |
| Server IP (student) | `student-app/public/index.html` | `172.17.100.152` | Change to match your Wi-Fi IP |
| Cert validity | auto | 2 years | Regenerated on each start |

To change the hardcoded student server IP, edit this line in `student-app/public/index.html`:
```javascript
const SERVER_IP = '172.17.100.152'; // ← change to your server's LAN IP
```

---

## 🔒 SSL Certificate

The server **auto-generates a self-signed TLS certificate** on startup using `node-forge`. This is required for:
- `navigator.mediaDevices.getDisplayMedia()` — screen capture API
- `navigator.mediaDevices.getUserMedia()` — microphone API
- Secure WebSocket (`wss://`) connections

**Both teacher and students must accept the browser warning once.**

> In Chrome: click **Advanced** → **Proceed to [IP] (unsafe)**

---

## 🌐 How WebRTC Broadcast Works

```
Teacher (Offerer)                         Student (Answerer)
      │                                          │
      ├── getDisplayMedia() → screen video       │
      ├── getUserMedia()    → mic audio          │
      │                                          │
      ├── createOffer() ──[Socket.IO]──────────► │
      │◄──────────────[Socket.IO]── createAnswer()
      │                                          │
      ├── ICE candidates ──[Socket.IO]─────────► │
      │◄──────────────[Socket.IO]── ICE candidates
      │                                          │
      │         [P2P WebRTC Connected]           │
      │                                          │
      ├── video track ────────────────────────► 📺 displayed in <video>
      └── audio track ────────────────────────► 🔊 played automatically
```

**Key design decisions:**
- Teacher always **initiates** the offer (not the student)
- Mic track is bundled into the **same stream** as screen video
- ICE candidates are **buffered** on both sides until the peer connection is ready
- STUN server (`stun.l.google.com:19302`) used to assist ICE negotiation
- Offers arriving at the student before `teacherSocketId` is set are **buffered** and flushed after joining

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Real-time / Signaling | Socket.IO 4.x |
| Screen Share + Voice | WebRTC (`getDisplayMedia` + `getUserMedia`) |
| Database | SQLite 3 (via `better-sqlite3`) |
| HTTPS | node-forge (self-signed cert with SAN) |
| Frontend | Vanilla HTML / CSS / JS |

---

## 🐛 Troubleshooting

### `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`
- Restart the server to regenerate the certificate
- Hard-refresh the browser (`Ctrl+Shift+R`)

### Student sees "Waiting for broadcast..." forever
- Make sure teacher clicked **▶ Start Broadcast** and selected a screen
- Student must have accepted the HTTPS certificate warning first
- Open DevTools (`F12`) → Console and look for `[WebRTC]` logs
- Try stopping and restarting the broadcast on the teacher side

### No microphone audio on student side
- Teacher must click **🎤 Mic: Muted** to unmute — it starts muted by default
- Check that browser granted microphone permission (shown in the address bar)
- Make sure the mic is not muted at the OS level

### Student cannot see any classrooms
- Check that the server is running (`npm start`)
- Both devices must be on the **same Wi-Fi network**
- Ensure `SERVER_IP` in `student-app/public/index.html` matches the server's LAN IP

### `Cannot connect to https://...`
- Verify both devices are on the **same Wi-Fi network**
- Ensure Windows Firewall allows Node.js on port `3000`
- Check the correct IP is set in `student-app/public/index.html`

### Laser pointer not visible on student screen
- Teacher must click **👆 Pointer** to activate it
- Move the mouse over the **broadcast area** (the dark video panel)

### `Error creating classroom: Unauthorized`
- The server is running old code — restart it with `npm start`

---

## 📜 License

MIT — free for educational and institutional use.
