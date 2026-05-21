# Deployment on LAN

## 1. Install Node.js on teacher's PC (or a dedicated lab server)

## 2. Clone and install
```bash
git clone <your-repo> classroom-lan
cd classroom-lan/server
npm install
```

## 3. Configure environment
```bash
cat > .env << EOF
PORT=3000
JWT_SECRET=change-this-to-a-random-string-32chars
NODE_ENV=production
EOF
```

## 4. Initialize database
```bash
npm run setup-db
```

## 5. Start the server
```bash
npm start
```

### Server output will show:
```
=== Classroom Server Running ===
LAN IP:    http://192.168.1.2:3000
Teacher:   http://192.168.1.2:3000/teacher
Student:   http://192.168.1.2:3000/student
================================
```

## Student Access
Students simply open a browser and navigate to:
```
http://192.168.1.2:3000/student
```

## Auto-start on Windows
Create a batch file:

**start-server.bat**
```batch
@echo off
cd C:\classroom-lan\server
node src/index.js
pause
```
