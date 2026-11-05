// Edit parameters, slider definitions and built-in looks.

export const RETOUCH_KEYS = ['smooth', 'texture', 'blemish', 'shine', 'underEye', 'eyes', 'teeth'];
export const RESHAPE_KEYS = ['slim', 'eyeSize', 'nose'];
export const ADJUST_KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'temp', 'tint',
  'vibrance', 'saturation', 'clarity', 'sharpen', 'fade', 'vignette', 'grain'];

export const DEFAULTS = Object.freeze({
  smooth: 0, texture: 50, blemish: 0, shine: 0, underEye: 0, eyes: 0, teeth: 0,
  slim: 0, eyeSize: 0, nose: 0,
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, temp: 0, tint: 0,
  vibrance: 0, saturation: 0, clarity: 0, sharpen: 0, fade: 0, vignette: 0, grain: 0,
  bgMode: 'none', bgBlur: 60, bgColor: '#ffffff',
  look: '', heals: [],
});

export const AUTO_RETOUCH = { smooth: 45, texture: 55, blemish: 60, shine: 30, underEye: 35, eyes: 25, teeth: 25 };

export const defaults = () => ({ ...DEFAULTS, heals: [] });
export const clone = (p) => ({ ...p, heals: p.heals.map((h) => ({ ...h })) });
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const S = (key, label, min = 0, max = 100) => ({ key, label, min, max });

export const TOOLS = [
  { id: 'retouch', label: 'Retouch', sliders: [
    S('smooth', 'Smooth skin'), S('texture', 'Keep skin texture'), S('blemish', 'Remove blemishes'),
    S('shine', 'Reduce shine'), S('underEye', 'Dark circles'), S('eyes', 'Brighten eyes'), S('teeth', 'Whiten teeth'),
  ] },
  { id: 'reshape', label: 'Reshape', sliders: [
    S('slim', 'Slim face'), S('eyeSize', 'Enlarge eyes'), S('nose', 'Narrow nose'),
  ] },
  { id: 'adjust', label: 'Adjust', sliders: [
    S('exposure', 'Exposure', -100, 100), S('contrast', 'Contrast', -100, 100),
    S('highlights', 'Highlights', -100, 100), S('shadows', 'Shadows', -100, 100),
    S('temp', 'Temperature', -100, 100), S('tint', 'Tint', -100, 100),
    S('vibrance', 'Vibrance', -100, 100), S('saturation', 'Saturation', -100, 100),
    S('clarity', 'Clarity', -100, 100), S('sharpen', 'Sharpen'), S('fade', 'Fade'),
    S('vignette', 'Vignette', -100, 100), S('grain', 'Grain'),
  ] },
  { id: 'background', label: 'Backdrop' },
  { id: 'looks', label: 'Looks' },
];

export const LOOKS = [
  { id: '', name: 'None', bg: 'linear-gradient(135deg,#3a3d45,#555a64)', p: {} },
  { id: 'natural', name: 'Natural Glow', bg: 'linear-gradient(135deg,#c98f78,#f2cfae)',
    p: { smooth: 35, blemish: 50, underEye: 25, eyes: 20, teeth: 20, exposure: 5, vibrance: 15, temp: 6 } },
  { id: 'studio', name: 'Studio Clean', bg: 'linear-gradient(135deg,#8e9aaf,#e6e9f0)',
    p: { smooth: 50, blemish: 70, shine: 40, underEye: 40, eyes: 30, teeth: 30, contrast: 10, clarity: 8, sharpen: 20 } },
  { id: 'warmfilm', name: 'Warm Film', bg: 'linear-gradient(135deg,#9c6b3f,#e8c38f)',
    p: { temp: 20, tint: 5, fade: 22, grain: 25, contrast: -6, saturation: -10, highlights: -20, shadows: 15, vignette: -20 } },
  { id: 'cool', name: 'Cool Clean', bg: 'linear-gradient(135deg,#4f7aa8,#b9d7f0)',
    p: { temp: -15, exposure: 8, vibrance: 12, highlights: -10, shadows: 10, clarity: 8 } },
  { id: 'golden', name: 'Golden Hour', bg: 'linear-gradient(135deg,#c2621f,#ffcf73)',
    p: { temp: 35, tint: 8, exposure: 5, vibrance: 25, highlights: -25, shadows: 15, vignette: -15 } },
  { id: 'bw', name: 'Classic B&W', bg: 'linear-gradient(135deg,#1c1c1c,#bdbdbd)',
    p: { saturation: -100, contrast: 25, clarity: 15, grain: 15, vignette: -25 } },
  { id: 'pastel', name: 'Soft Pastel', bg: 'linear-gradient(135deg,#d7a6c0,#bfe3e0)',
    p: { fade: 30, exposure: 10, contrast: -15, saturation: -15, temp: 5, tint: 6 } },
  { id: 'moody', name: 'Moody', bg: 'linear-gradient(135deg,#1e2a33,#5b6b6e)',
    p: { exposure: -10, contrast: 20, highlights: -30, shadows: -10, saturation: -20, temp: -8, vignette: -35, fade: 10 } },
  { id: 'vivid', name: 'Vivid Pop', bg: 'linear-gradient(135deg,#e2365b,#ffb13d)',
    p: { contrast: 15, vibrance: 35, saturation: 10, clarity: 12, sharpen: 15 } },
];

// A look resets the colour sliders, then applies its own values (it may also set retouch values).
export function applyLook(p, look) {
  const out = clone(p);
  for (const k of ADJUST_KEYS) out[k] = DEFAULTS[k];
  Object.assign(out, look.p);
  out.look = look.id;
  return out;
}

// Copy everything except per-photo work (healed spots) — used by "Sync to all".
export function syncable(p) {
  const out = clone(p);
  out.heals = [];
  return out;
}

const LS_KEY = 'glowstudio.looks.v1';
export function loadUserLooks() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
export function saveUserLooks(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
export function lookFromParams(name, p) {
  const q = {};
  for (const k of [...RETOUCH_KEYS, ...ADJUST_KEYS]) if (p[k] !== DEFAULTS[k]) q[k] = p[k];
  return { id: 'u' + Date.now(), name, user: true, bg: 'linear-gradient(135deg,#ff8a5c,#ffc46b)', p: q };
}
