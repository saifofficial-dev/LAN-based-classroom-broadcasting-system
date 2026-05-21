// teacher-app/src/renderer/components/whiteboard/whiteboard.js

class TeacherWhiteboard {
  constructor(canvas, socket) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.socket = socket;
    this.isDrawing = false;
    this.currentTool = 'pen';
    this.currentColor = '#ff0000';
    this.lineWidth = 3;
    this.history = [];          // For undo
    this.tempCanvas = null;     // For shape previews
    this.startPoint = null;
    this.lastPoint = null;

    this._initCanvas();
    this._bindEvents();
  }

  _initCanvas() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.lineWidth;

    // Create temp canvas for shape preview
    this.tempCanvas = document.createElement('canvas');
    this.tempCanvas.width = this.canvas.width;
    this.tempCanvas.height = this.canvas.height;
    this.tempCanvas.style.position = 'absolute';
    this.tempCanvas.style.top = '0';
    this.tempCanvas.style.left = '0';
    this.tempCanvas.style.pointerEvents = 'none';
    this.canvas.parentElement.appendChild(this.tempCanvas);
    this.tempCtx = this.tempCanvas.getContext('2d');
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', this._onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this._onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this._onMouseUp.bind(this));

    // Touch support for tablets
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onMouseDown(this._touchToMouse(e));
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this._onMouseMove(this._touchToMouse(e));
    }, { passive: false });

    this.canvas.addEventListener('touchend', this._onMouseUp.bind(this));
  }

  _touchToMouse(e) {
    const touch = e.touches[0];
    return { clientX: touch.clientX, clientY: touch.clientY };
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  _onMouseDown(e) {
    this.isDrawing = true;
    const pos = this._getPos(e);
    this.startPoint = pos;
    this.lastPoint = pos;

    // Save state for undo (before drawing)
    this._saveHistory();

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    }

    // Emit start event
    this._emitDraw({ type: 'start', ...pos, tool: this.currentTool });
  }

  _onMouseMove(e) {
    if (!this.isDrawing) return;
    const pos = this._getPos(e);

    switch (this.currentTool) {
      case 'pen':
        this._drawPen(pos);
        break;
      case 'eraser':
        this._drawEraser(pos);
        break;
      case 'line':
        this._previewLine(pos);
        break;
      case 'rect':
        this._previewRect(pos);
        break;
      case 'circle':
        this._previewCircle(pos);
        break;
      case 'arrow':
        this._previewArrow(pos);
        break;
    }

    this.lastPoint = pos;
  }

  _onMouseUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    const pos = e ? this._getPos(e) : this.lastPoint;

    // Finalize shape tools onto main canvas
    if (['line', 'rect', 'circle', 'arrow'].includes(this.currentTool)) {
      this._finalizeShape(pos);
    }

    this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    this._emitDraw({ type: 'end', ...pos });
  }

  _drawPen(pos) {
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();

    const drawData = {
      type: 'pen',
      from: this.lastPoint,
      to: pos,
      color: this.currentColor,
      width: this.lineWidth
    };
    this._emitDraw(drawData);
  }

  _drawEraser(pos) {
    const size = this.lineWidth * 5;
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = 'source-over';

    this._emitDraw({ type: 'eraser', ...pos, size });
  }

  _previewLine(pos) {
    this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    this.tempCtx.beginPath();
    this.tempCtx.strokeStyle = this.currentColor;
    this.tempCtx.lineWidth = this.lineWidth;
    this.tempCtx.moveTo(this.startPoint.x, this.startPoint.y);
    this.tempCtx.lineTo(pos.x, pos.y);
    this.tempCtx.stroke();
  }

  _previewRect(pos) {
    this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    this.tempCtx.strokeStyle = this.currentColor;
    this.tempCtx.lineWidth = this.lineWidth;
    this.tempCtx.strokeRect(
      this.startPoint.x, this.startPoint.y,
      pos.x - this.startPoint.x,
      pos.y - this.startPoint.y
    );
  }

  _previewCircle(pos) {
    this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    const rx = (pos.x - this.startPoint.x) / 2;
    const ry = (pos.y - this.startPoint.y) / 2;
    const cx = this.startPoint.x + rx;
    const cy = this.startPoint.y + ry;
    this.tempCtx.beginPath();
    this.tempCtx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
    this.tempCtx.strokeStyle = this.currentColor;
    this.tempCtx.lineWidth = this.lineWidth;
    this.tempCtx.stroke();
  }

  _previewArrow(pos) {
    this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    this._drawArrowOnCtx(
      this.tempCtx, this.startPoint, pos,
      this.currentColor, this.lineWidth
    );
  }

  _drawArrowOnCtx(ctx, from, to, color, width) {
    const headLen = 15;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLen * Math.cos(angle - Math.PI / 6),
      to.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      to.x - headLen * Math.cos(angle + Math.PI / 6),
      to.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  _finalizeShape(pos) {
    const ctx = this.ctx;
    ctx.strokeStyle = this.currentColor;
    ctx.lineWidth = this.lineWidth;

    const shapeData = {
      from: this.startPoint,
      to: pos,
      color: this.currentColor,
      width: this.lineWidth
    };

    switch (this.currentTool) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(this.startPoint.x, this.startPoint.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        this._emitDraw({ type: 'line', ...shapeData });
        break;
      case 'rect':
        ctx.strokeRect(
          this.startPoint.x, this.startPoint.y,
          pos.x - this.startPoint.x,
          pos.y - this.startPoint.y
        );
        this._emitDraw({ type: 'rect', ...shapeData });
        break;
      case 'circle':
        const rx = (pos.x - this.startPoint.x) / 2;
        const ry = (pos.y - this.startPoint.y) / 2;
        ctx.beginPath();
        ctx.ellipse(
          this.startPoint.x + rx,
          this.startPoint.y + ry,
          Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2
        );
        ctx.stroke();
        this._emitDraw({ type: 'circle', ...shapeData });
        break;
      case 'arrow':
        this._drawArrowOnCtx(ctx, this.startPoint, pos, this.currentColor, this.lineWidth);
        this._emitDraw({ type: 'arrow', ...shapeData });
        break;
    }
  }

  // ── Text Tool ─────────────────────────────────────────────────────
  addText(x, y, text, fontSize = 18) {
    this.ctx.font = `${fontSize}px Arial`;
    this.ctx.fillStyle = this.currentColor;
    this.ctx.fillText(text, x, y);
    this._emitDraw({ type: 'text', x, y, text, fontSize, color: this.currentColor });
  }

  // ── History & Undo ────────────────────────────────────────────────
  _saveHistory() {
    const imageData = this.ctx.getImageData(
      0, 0, this.canvas.width, this.canvas.height
    );
    this.history.push(imageData);
    if (this.history.length > 50) this.history.shift();
  }

  undo() {
    if (this.history.length === 0) return;
    const imageData = this.history.pop();
    this.ctx.putImageData(imageData, 0, 0);
    this.socket.emit('whiteboard:undo');
  }

  clear() {
    this._saveHistory();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.socket.emit('whiteboard:clear');
  }

  getSnapshot() {
    return this.canvas.toDataURL('image/png');
  }

  // ── Socket Emission (throttled) ───────────────────────────────────
  _emitDraw(data) {
    // Normalize coordinates to 0–1 for resolution independence
    const normalized = {
      ...data,
      x: data.x !== undefined ? data.x / this.canvas.width : undefined,
      y: data.y !== undefined ? data.y / this.canvas.height : undefined,
      from: data.from ? {
        x: data.from.x / this.canvas.width,
        y: data.from.y / this.canvas.height
      } : undefined,
      to: data.to ? {
        x: data.to.x / this.canvas.width,
        y: data.to.y / this.canvas.height
      } : undefined
    };
    this.socket.emit('whiteboard:draw', normalized);
  }

  // ── Tool & Style Setters ─────────────────────────────────────────
  setTool(tool)  { this.currentTool = tool; }
  setColor(c)    { this.currentColor = c; }
  setWidth(w)    { this.lineWidth = w; }
}

// ── Student Whiteboard Receiver ───────────────────────────────────

class StudentWhiteboardReceiver {
  constructor(canvas, socket) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.socket = socket;
    this.undoHistory = [];

    socket.on('whiteboard:draw', (data) => this._applyDraw(data));
    socket.on('whiteboard:clear', () => this._clear());
    socket.on('whiteboard:undo', () => this._undo());
    socket.on('whiteboard:sync-response', ({ canvasData }) => {
      this._loadFromDataUrl(canvasData);
    });

    // Request current state when joining
    socket.emit('whiteboard:sync-request');
  }

  _denormalize(val, max) {
    return val !== undefined ? val * max : undefined;
  }

  _applyDraw(data) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;

    ctx.strokeStyle = data.color || '#ff0000';
    ctx.lineWidth = data.width || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const dx = (v) => v !== undefined ? v * W : undefined;
    const dy = (v) => v !== undefined ? v * H : undefined;

    switch (data.type) {
      case 'pen':
        ctx.beginPath();
        ctx.moveTo(dx(data.from.x), dy(data.from.y));
        ctx.lineTo(dx(data.to.x), dy(data.to.y));
        ctx.stroke();
        break;
      case 'eraser':
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(dx(data.x), dy(data.y), data.size || 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(dx(data.from.x), dy(data.from.y));
        ctx.lineTo(dx(data.to.x), dy(data.to.y));
        ctx.stroke();
        break;
      case 'rect':
        ctx.strokeRect(
          dx(data.from.x), dy(data.from.y),
          dx(data.to.x) - dx(data.from.x),
          dy(data.to.y) - dy(data.from.y)
        );
        break;
      case 'text':
        ctx.font = `${data.fontSize || 18}px Arial`;
        ctx.fillStyle = data.color;
        ctx.fillText(data.text, dx(data.x), dy(data.y));
        break;
    }
  }

  _clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _loadFromDataUrl(dataUrl) {
    const img = new Image();
    img.onload = () => this.ctx.drawImage(img, 0, 0);
    img.src = dataUrl;
  }
}
