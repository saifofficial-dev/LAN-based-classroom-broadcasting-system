// teacher-app/src/renderer/components/broadcast/broadcaster.js

class TeacherBroadcaster {
  constructor(socketClient) {
    this.socket = socketClient;
    this.localStream = null;
    this.peerConnections = new Map();  // studentSocketId → RTCPeerConnection
    this.screenStream = null;
    this.audioStream = null;
    this.combinedStream = null;
    this.isLive = false;

    // LAN-optimized ICE config — no STUN/TURN needed
    this.rtcConfig = {
      iceServers: [],     // Empty for pure LAN
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    this._bindSocketEvents();
  }

  _bindSocketEvents() {
    // When a student is ready for WebRTC
    this.socket.on('webrtc:offer', async ({ fromSocketId, offer, studentName }) => {
      console.log(`[WebRTC] Offer received from student: ${studentName}`);
      await this._handleStudentOffer(fromSocketId, offer);
    });

    this.socket.on('webrtc:ice-candidate', ({ fromSocketId, candidate }) => {
      const pc = this.peerConnections.get(fromSocketId);
      if (pc && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    // Student disconnected — cleanup their peer connection
    this.socket.on('teacher:student-left', ({ studentId }) => {
      this._closePeerConnection(studentId);
    });
  }

  async captureScreen(sourceType = 'screen') {
    try {
      // Stop any existing stream
      if (this.screenStream) {
        this.screenStream.getTracks().forEach(t => t.stop());
      }

      const constraints = {
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          cursor: 'always'   // Show cursor in stream
        },
        audio: false         // Audio captured separately
      };

      // getDisplayMedia for screen/window capture
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);

      // Handle user stopping screen share via browser UI
      this.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopBroadcast();
      });

      return this.screenStream;
    } catch (err) {
      console.error('[Screen Capture] Error:', err);
      throw err;
    }
  }

  async captureAudio() {
    try {
      // Capture system audio (supported in Chrome/Electron)
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 44100,
          channelCount: 2
        },
        video: false
      });
      this.audioStream = audioStream;
      return audioStream;
    } catch (err) {
      console.warn('[Audio Capture] Microphone unavailable:', err.message);
      return null;
    }
  }

  async startBroadcast(options = {}) {
    const {
      includeAudio = true,
      quality = 'high',
      fps = 30
    } = options;

    try {
      this.screenStream = await this.captureScreen();

      const tracks = [...this.screenStream.getTracks()];

      if (includeAudio) {
        const audio = await this.captureAudio();
        if (audio) {
          tracks.push(...audio.getAudioTracks());
        }
      }

      this.combinedStream = new MediaStream(tracks);
      this.isLive = true;

      // Notify server broadcast is active
      this.socket.emit('teacher:start-broadcast');

      // Apply quality settings
      this._applyQualitySettings(quality, fps);

      console.log('[Broadcaster] Stream ready — waiting for students');
      return this.combinedStream;
    } catch (err) {
      console.error('[Broadcaster] Failed to start:', err);
      throw err;
    }
  }

  async _handleStudentOffer(studentSocketId, offer) {
    // Create a peer connection for this student
    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peerConnections.set(studentSocketId, pc);

    // Add all local tracks to this peer connection
    if (this.combinedStream) {
      this.combinedStream.getTracks().forEach(track => {
        pc.addTrack(track, this.combinedStream);
      });
    }

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice-candidate', {
          targetSocketId: studentSocketId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Student ${studentSocketId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        this._closePeerConnection(studentSocketId);
      }
    };

    // Set remote description (student's offer)
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Create and set answer
    const answer = await pc.createAnswer();

    // Optimize SDP for LAN streaming
    const optimizedAnswer = this._optimizeSdpForLan(answer.sdp, {
      videoBitrate: quality === 'high' ? 8000 : 4000,  // kbps
      audioBitrate: 128
    });

    await pc.setLocalDescription({ type: 'answer', sdp: optimizedAnswer });

    // Send answer back to student
    this.socket.emit('webrtc:answer', {
      targetSocketId: studentSocketId,
      answer: pc.localDescription
    });
  }

  _optimizeSdpForLan(sdp, { videoBitrate, audioBitrate }) {
    // Inject bandwidth constraints into SDP
    let modified = sdp;

    // Set video bitrate
    modified = modified.replace(
      /a=mid:video\r\n/,
      `a=mid:video\r\nb=AS:${videoBitrate}\r\n` 
    );

    // Prefer VP8 for lower latency on LAN (or VP9 for better quality)
    // H.264 is great for hardware acceleration
    return modified;
  }

  _applyQualitySettings(quality, fps) {
    const settings = {
      high:   { width: 1920, height: 1080, fps: 30, bitrate: 8000000 },
      medium: { width: 1280, height: 720,  fps: 24, bitrate: 4000000 },
      low:    { width: 854,  height: 480,  fps: 15, bitrate: 1500000 }
    };

    const cfg = settings[quality] || settings.high;

    // Apply constraints to existing tracks
    if (this.screenStream) {
      this.screenStream.getVideoTracks().forEach(track => {
        track.applyConstraints({
          width: { ideal: cfg.width },
          height: { ideal: cfg.height },
          frameRate: { ideal: cfg.fps }
        }).catch(console.error);
      });
    }

    // Update bitrate on existing peer connections
    this.peerConnections.forEach(async (pc) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        params.encodings[0].maxBitrate = cfg.bitrate;
        await sender.setParameters(params).catch(console.error);
      }
    });
  }

  async addNewStudent(studentSocketId) {
    // Called when a student joins AFTER broadcast started
    if (!this.combinedStream || !this.isLive) return;
    // Student will send an offer — handled in _bindSocketEvents
    console.log(`[Broadcaster] New student ${studentSocketId} will send offer`);
  }

  _closePeerConnection(studentSocketId) {
    const pc = this.peerConnections.get(studentSocketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(studentSocketId);
      console.log(`[WebRTC] Closed connection for student: ${studentSocketId}`);
    }
  }

  stopBroadcast() {
    this.isLive = false;

    // Close all peer connections
    this.peerConnections.forEach((pc, id) => {
      pc.close();
    });
    this.peerConnections.clear();

    // Stop all tracks
    [this.screenStream, this.audioStream, this.combinedStream].forEach(stream => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    });

    this.socket.emit('teacher:stop-broadcast');
    console.log('[Broadcaster] Stopped');
  }

  getConnectedStudentCount() {
    return this.peerConnections.size;
  }
}
