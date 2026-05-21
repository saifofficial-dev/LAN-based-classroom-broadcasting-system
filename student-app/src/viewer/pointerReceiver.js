// student-app/src/viewer/pointerReceiver.js

class LaserPointerReceiver {
  constructor(socket, containerElement) {
    this.socket = socket;
    this.container = containerElement;
    this.pointer = null;
    this._createPointerElement();
    this._bindEvents();
  }

  _createPointerElement() {
    this.pointer = document.createElement('div');
    this.pointer.id = 'laser-pointer';
    this.pointer.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      display: none;
      transition: left 0.016s linear, top 0.0s linear;
    `;
    document.body.appendChild(this.pointer);
  }

  _bindEvents() {
    this.socket.on('pointer:move', ({ x, y, mode }) => {
      this.pointer.style.display = 'block';
      this.pointer.style.left = `${x * window.innerWidth - 10}px`;
      this.pointer.style.top  = `${y * window.innerHeight - 10}px`;
      this._applyMode(mode);
    });

    this.socket.on('pointer:hide', () => {
      this.pointer.style.display = 'none';
    });
  }

  _applyMode(mode) {
    const styles = {
      laser: {
        background: 'rgba(255, 0, 0, 0.85)',
        boxShadow: '0 0 8px 4px rgba(255,0,0,0.6), 0 0 20px 8px rgba(255,80,80,0.3)',
        width: '16px', height: '16px'
      },
      highlight: {
        background: 'rgba(255, 255, 0, 0.4)',
        boxShadow: '0 0 0 2px rgba(255,200,0,0.8)',
        width: '40px', height: '40px'
      },
      normal: {
        background: 'rgba(0, 100, 255, 0.7)',
        boxShadow: '0 0 6px 2px rgba(0,100,255,0.4)',
        width: '12px', height: '12px'
      }
    };

    const s = styles[mode] || styles.normal;
    Object.assign(this.pointer.style, s);
  }
}
