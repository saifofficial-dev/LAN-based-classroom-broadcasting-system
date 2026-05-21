// teacher-app/src/renderer/components/pointer/laserPointer.js

class LaserPointerBroadcaster {
  constructor(socket) {
    this.socket = socket;
    this.active = false;
    this.mode = 'laser';
    this.throttleMs = 16;   // ~60fps pointer updates
    this.lastEmit = 0;
    this._onMouseMove = this._handleMove.bind(this);
  }

  activate(mode = 'laser') {
    this.mode = mode;
    this.active = true;
    document.addEventListener('mousemove', this._onMouseMove);
    console.log(`[Pointer] Activated: ${mode}`);
  }

  deactivate() {
    this.active = false;
    document.removeEventListener('mousemove', this._onMouseMove);
    this.socket.emit('pointer:hide');
  }

  _handleMove(e) {
    const now = Date.now();
    if (now - this.lastEmit < this.throttleMs) return;
    this.lastEmit = now;

    // Normalize to 0–1 relative to viewport
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;

    this.socket.emit('pointer:move', { x, y, mode: this.mode });
  }

  setMode(mode) { this.mode = mode; }
}
