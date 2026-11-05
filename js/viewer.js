// Fit / pinch-zoom / pan for the preview canvas, and tap detection (heal brush, double-tap zoom).
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export class Viewer {
  constructor(stage, canvas, onTap) {
    this.stage = stage;
    this.canvas = canvas;
    this.onTap = onTap;
    this.s = 1; this.x = 0; this.y = 0; this.fitS = 1;
    this.pointers = new Map();
    this.g = null;
    this.lastTap = 0;
    stage.addEventListener('pointerdown', (e) => this.down(e));
    stage.addEventListener('pointermove', (e) => this.move(e));
    stage.addEventListener('pointerup', (e) => this.up(e, false));
    stage.addEventListener('pointercancel', (e) => this.up(e, true));
    stage.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    stage.addEventListener('gesturestart', (e) => e.preventDefault()); // stop Safari page zoom
    new ResizeObserver(() => this.fit()).observe(stage);
  }

  get cw() { return this.canvas.width; }
  get ch() { return this.canvas.height; }
  get zoomed() { return this.s > this.fitS * 1.02; }

  fit() {
    const r = this.stage.getBoundingClientRect();
    if (!this.cw || !r.width || !r.height) return;
    this.fitS = Math.min((r.width - 16) / this.cw, (r.height - 16) / this.ch);
    this.s = this.fitS;
    this.x = (r.width - this.cw * this.s) / 2;
    this.y = (r.height - this.ch * this.s) / 2;
    this.apply();
  }

  apply() {
    this.canvas.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.s})`;
  }

  zoomAt(p, s) {
    s = clamp(s, this.fitS * 0.8, this.fitS * 12);
    const ix = (p[0] - this.x) / this.s, iy = (p[1] - this.y) / this.s;
    this.s = s;
    this.x = p[0] - ix * s;
    this.y = p[1] - iy * s;
    this.apply();
  }

  local(e) {
    const r = this.stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  down(e) {
    if (!this.cw || e.target.closest('button')) return;
    this.stage.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.g = { type: 'pan', start: p, x: this.x, y: this.y, t: performance.now(), moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.g = { type: 'pinch', d: dist(a, b) || 1, m: mid(a, b), s: this.s, x: this.x, y: this.y };
    }
  }

  move(e) {
    if (!this.pointers.has(e.pointerId) || !this.g) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const g = this.g;
    if (g.type === 'pan' && this.pointers.size === 1) {
      const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
      if (Math.hypot(dx, dy) > 8) g.moved = true;
      if (g.moved && this.zoomed) {
        this.x = g.x + dx;
        this.y = g.y + dy;
        this.apply();
      }
    } else if (g.type === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const m = mid(a, b);
      const s = clamp((g.s * dist(a, b)) / g.d, this.fitS * 0.8, this.fitS * 12);
      const ix = (g.m[0] - g.x) / g.s, iy = (g.m[1] - g.y) / g.s;
      this.s = s;
      this.x = m[0] - ix * s;
      this.y = m[1] - iy * s;
      this.apply();
    }
  }

  up(e, cancelled) {
    if (!this.pointers.has(e.pointerId)) return;
    const g = this.g;
    const isTap = g && g.type === 'pan' && !g.moved && !cancelled && this.pointers.size === 1
      && performance.now() - g.t < 500;
    this.pointers.delete(e.pointerId);
    if (isTap) {
      const p = this.local(e);
      const ix = (p[0] - this.x) / this.s / this.cw, iy = (p[1] - this.y) / this.s / this.ch;
      const now = performance.now();
      const double = now - this.lastTap < 320;
      this.lastTap = double ? 0 : now;
      if (this.onTap) this.onTap({ x: ix, y: iy, inside: ix >= 0 && ix <= 1 && iy >= 0 && iy <= 1, p, double });
    }
    if (this.pointers.size === 0) {
      this.g = null;
      if (this.s < this.fitS) this.fit();
    } else if (this.pointers.size === 1) {
      const [p] = [...this.pointers.values()];
      this.g = { type: 'pan', start: p, x: this.x, y: this.y, t: 0, moved: true };
    }
  }

  wheel(e) {
    if (!this.cw) return;
    e.preventDefault();
    this.zoomAt(this.local(e), this.s * Math.exp(-e.deltaY * 0.0015));
  }

  toggleZoom(p) {
    if (this.zoomed) this.fit();
    else this.zoomAt(p, this.fitS * 2.5);
  }

  // Brief ring where a heal was applied. r = radius in canvas pixels.
  flash(p, r) {
    const d = document.createElement('div');
    const R = Math.max(8, r * this.s);
    d.className = 'heal-ring';
    Object.assign(d.style, { left: `${p[0] - R}px`, top: `${p[1] - R}px`, width: `${R * 2}px`, height: `${R * 2}px` });
    this.stage.appendChild(d);
    setTimeout(() => d.remove(), 600);
  }
}
