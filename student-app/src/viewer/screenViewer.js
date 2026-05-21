// student-app/src/viewer/screenViewer.js

class StudentViewer {
  constructor(socketClient) {
    this.socket = socketClient;
    this.peerConnection = null;
    this.remoteStream = null;
    this.videoElement = null;
    this.teacherSocketId = null;
    this.roomCode = null;
    this.studentName = null;

    this.rtcConfig = {
      iceServers: [],    // LAN — no STUN needed
      iceTransportPolicy: 'all'
    };

    this._bindSocketEvents();
  }

  _bindSocketEvents() {
    // Server tells us broadcast has started
    this.socket.on('broadcast:started', ({ teacherName }) => {
      console.log(`[Student] Broadcast started by ${teacherName}`);
      this._initiateOffer();
    });

    // Server sends teacher's answer
    this.socket.on('webrtc:answer', async ({ fromSocketId, answer }) => {
      if (fromSocketId !== this.teacherSocketId) return;
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    // ICE candidate from teacher
    this.socket.on('webrtc:ice-candidate', ({ fromSocketId, candidate }) => {
      if (fromSocketId !== this.teacherSocketId) return;
      if (this.peerConnection && candidate) {
        this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        ).catch(console.error);
      }
    });

    // Broadcast ended
    this.socket.on('broadcast:stopped', () => {
      console.log('[Student] Broadcast stopped by teacher');
      this._handleBroadcastEnd('Teacher paused the broadcast');
    });

    this.socket.on('broadcast:teacher-left', ({ message }) => {
      this._handleBroadcastEnd(message);
    });
  }

  async joinRoom(roomCode, password, studentName, teacherSocketId) {
    this.roomCode = roomCode;
    this.studentName = studentName;
    this.teacherSocketId = teacherSocketId;
  }

  async _initiateOffer() {
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    // Receive remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('[Student] Receiving stream from teacher');
      this.remoteStream = event.streams[0];
      if (this.videoElement) {
        this.videoElement.srcObject = this.remoteStream;
        this.videoElement.play().catch(console.error);
      }
    };

    // ICE candidates — send to teacher via signaling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice-candidate', {
          targetSocketId: this.teacherSocketId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`[WebRTC] Connection state: ${state}`);
      this._onConnectionStateChange(state);
    };

    // Add receive-only transceivers (student only views, not sends)
    this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
    this.peerConnection.addTransceiver('audio', { direction: 'recvonly' });

    // Create offer
    const offer = await this.peerConnection.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: true
    });

    await this.peerConnection.setLocalDescription(offer);

    // Send offer to teacher
    this.socket.emit('webrtc:offer', {
      targetSocketId: this.teacherSocketId,
      offer: this.peerConnection.localDescription,
      studentName: this.studentName
    });

    console.log('[Student] Offer sent to teacher');
  }

  attachToVideoElement(videoEl) {
    this.videoElement = videoEl;
    if (this.remoteStream) {
      videoEl.srcObject = this.remoteStream;
    }
  }

  _onConnectionStateChange(state) {
    if (state === 'connected') {
      document.dispatchEvent(new CustomEvent('stream:connected'));
    } else if (state === 'failed') {
      // Attempt reconnection
      setTimeout(() => this._initiateOffer(), 3000);
    } else if (state === 'disconnected') {
      document.dispatchEvent(new CustomEvent('stream:disconnected'));
    }
  }

  _handleBroadcastEnd(message) {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    document.dispatchEvent(new CustomEvent('broadcast:ended', {
      detail: { message }
    }));
  }

  disconnect() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}
