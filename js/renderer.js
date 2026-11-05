// GPU pipeline: smoothing + mid blur + background blur -> composite (retouch & grade) -> final (reshape, vignette, grain).
import {
  createGL, createQuad, createProgram, createTexture, uploadImage, uploadPixels,
  createTarget, deleteTarget, pass,
} from './gl.js';
import * as SH from './shaders.js';
import { buildWarps } from './face.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const BG_MODES = { none: 0, blur: 1, remove: 2, color: 3 };

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = createGL(canvas));
    this.quad = createQuad(gl);
    this.prog = {
      copy: createProgram(gl, SH.COPY, 'copy'),
      bilateral: createProgram(gl, SH.BILATERAL, 'bilateral'),
      gauss: createProgram(gl, SH.GAUSS, 'gauss'),
      bgprep: createProgram(gl, SH.BGPREP, 'bgprep'),
      composite: createProgram(gl, SH.COMPOSITE, 'composite'),
      final: createProgram(gl, SH.FINAL, 'final'),
    };
    this.dummy = createTexture(gl, 1, 1);
    this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.faces = [];
    this.faceSize = 0.25;
    this.segTex = null;
    this.faceTex = null;
  }

  // `source` must already be drawn at w x h (canvas or image).
  setImage(source, w, h) {
    const gl = this.gl;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.src) gl.deleteTexture(this.src);
    this.src = createTexture(gl, w, h);
    uploadImage(gl, this.src, source);
    for (const k of ['tA', 'tSmooth', 'tMid', 'q1', 'q2']) deleteTarget(gl, this[k]);
    const qw = Math.max(1, Math.round(w / 4));
    const qh = Math.max(1, Math.round(h / 4));
    this.tA = createTarget(gl, w, h);
    this.tSmooth = createTarget(gl, w, h);
    this.tMid = createTarget(gl, w, h);
    this.q1 = createTarget(gl, qw, qh);
    this.q2 = createTarget(gl, qw, qh);
  }

  // Masks: { w, h, data: Uint8Array RGBA with bottom-up rows } or null.
  setAnalysis(analysis) {
    const gl = this.gl;
    const upload = (m, key) => {
      if (this[key]) gl.deleteTexture(this[key]);
      this[key] = null;
      if (!m) return;
      this[key] = createTexture(gl, m.w, m.h);
      uploadPixels(gl, this[key], m.w, m.h, m.data);
    };
    upload(analysis && analysis.seg, 'segTex');
    upload(analysis && analysis.face, 'faceTex');
    this.faces = (analysis && analysis.faces) || [];
    this.faceSize = (analysis && analysis.faceSize) || 0.25;
  }

  render(p, { original = false, seed = 0 } = {}) {
    const gl = this.gl, P = this.prog, Q = this.quad, W = this.w, H = this.h;
    if (!this.src) return;
    if (original) {
      pass(gl, Q, P.copy, null, { u_tex: this.src }, {});
      return;
    }
    const f = (v) => v / 100;
    const tx = 1 / W, ty = 1 / H;
    const faceH = this.faceSize * H;
    let smoothTex = this.src, midTex = this.src, bgTex = this.dummy;

    if (p.smooth > 0 || p.underEye > 0) {
      const step = clamp(faceH * 0.03, 1.5, 40) / 10;
      pass(gl, Q, P.bilateral, this.tA, { u_tex: this.src }, { u_step: [step * tx, 0], u_sigmaR: 0.09 });
      pass(gl, Q, P.bilateral, this.tSmooth, { u_tex: this.tA.tex }, { u_step: [0, step * ty], u_sigmaR: 0.09 });
      smoothTex = this.tSmooth.tex;
    }
    if (p.blemish > 0 || p.shine > 0 || p.eyes > 0 || p.clarity !== 0) {
      const step = clamp(faceH * 0.045, 3, 90) / 8;
      pass(gl, Q, P.gauss, this.tA, { u_tex: this.src }, { u_step: [step * tx, 0] });
      pass(gl, Q, P.gauss, this.tMid, { u_tex: this.tA.tex }, { u_step: [0, step * ty] });
      midTex = this.tMid.tex;
    }
    const hasSeg = !!this.segTex;
    if (p.bgMode === 'blur' && hasSeg) {
      const q1 = this.q1, q2 = this.q2;
      pass(gl, Q, P.bgprep, q1, { u_tex: this.src, u_seg: this.segTex }, { u_texel: [tx, ty] });
      const step = (f(p.bgBlur) * 0.035 * Math.max(q1.w, q1.h)) / 8;
      for (let i = 0; i < 2; i++) {
        pass(gl, Q, P.gauss, q2, { u_tex: q1.tex }, { u_step: [step / q1.w, 0] });
        pass(gl, Q, P.gauss, q1, { u_tex: q2.tex }, { u_step: [0, step / q1.h] });
      }
      bgTex = q1.tex;
    }

    const heals = p.heals.slice(-64);
    const healArr = new Float32Array(64 * 3);
    heals.forEach((h, i) => {
      healArr[i * 3] = h.x;
      healArr[i * 3 + 1] = 1 - h.y;
      healArr[i * 3 + 2] = h.r;
    });

    pass(gl, Q, P.composite, this.tA, {
      u_src: this.src, u_smooth: smoothTex, u_mid: midTex, u_bg: bgTex,
      u_seg: this.segTex || this.dummy, u_face: this.faceTex || this.dummy,
    }, {
      u_texel: [tx, ty], u_aspect: W / H, u_rSmall: clamp(faceH * 0.008, 1, 8), u_hasSeg: hasSeg ? 1 : 0,
      u_smoothAmt: f(p.smooth), u_texture: f(p.texture) * 0.85, u_blemish: f(p.blemish), u_shine: f(p.shine),
      u_underEye: f(p.underEye), u_eyes: f(p.eyes), u_teeth: f(p.teeth),
      u_exposure: f(p.exposure), u_contrast: f(p.contrast), u_highlights: f(p.highlights), u_shadows: f(p.shadows),
      u_temp: f(p.temp), u_tint: f(p.tint), u_vibrance: f(p.vibrance), u_saturation: f(p.saturation),
      u_clarity: f(p.clarity), u_sharpen: f(p.sharpen), u_fade: f(p.fade),
      u_bgMode: { i: hasSeg ? BG_MODES[p.bgMode] || 0 : 0 }, u_bgColor: hexToRgb(p.bgColor),
      u_healN: { i: heals.length }, u_heal: { v3: healArr },
    });

    const w = buildWarps(this.faces, p, W / H);
    pass(gl, Q, P.final, null, { u_tex: this.tA.tex }, {
      u_aspect: W / H, u_vignette: f(p.vignette), u_grain: f(p.grain), u_seed: seed, u_px: [W, H],
      u_warpN: { i: w.n }, u_warp: { v4: w.warp }, u_warpR: { v1: w.warpR },
      u_bulgeN: { i: w.bn }, u_bulge: { v4: w.bulge },
    });
  }

  dispose() {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }
}
