// App wiring: photos, history, tools, preview rendering, export.
import { Renderer } from './renderer.js';
import { Viewer } from './viewer.js';
import { UI } from './ui.js';
import { initAI, analyze } from './ai.js';
import { decode, fitSize, drawScaled, renderFile, saveFiles } from './exporter.js';
import {
  defaults, clone, same, applyLook, syncable, AUTO_RETOUCH,
  loadUserLooks, saveUserLooks, lookFromParams,
} from './params.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PREVIEW_MAX = matchMedia('(min-width: 768px)').matches ? 2048 : 1600;

const state = { photos: [], cur: -1, shown: -1, ai: 'idle', healMode: false, brush: 40, stats: null };
const photo = () => state.photos[state.cur];
const view = {
  get params() { return photo() ? photo().params : defaults(); },
  get photos() { return state.photos.length; },
  get ai() { return state.ai; },
  get faces() { return photo() ? photo().faces : null; },
  get healMode() { return state.healMode; },
  get brush() { return state.brush; },
};

const canvas = $('view');
let renderer = null;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  console.error(e);
  document.querySelector('.empty-card p').textContent = e.message;
  $('btnOpenBig').disabled = true;
}
const viewer = new Viewer($('stage'), canvas, onTap);
const ui = new UI($('tabs'), $('tool'), view, { change, commit, action });

// ---------- status ----------
let toastTimer = 0;
function setStatus(msg, spin = false) {
  clearTimeout(toastTimer);
  const s = $('status');
  s.hidden = !msg;
  s.textContent = '';
  if (spin) s.append(Object.assign(document.createElement('span'), { className: 'spin' }));
  if (msg) s.append(msg);
}
function toast(msg) {
  setStatus(msg);
  toastTimer = setTimeout(() => setStatus(''), 2000);
}

// ---------- rendering ----------
let raf = 0, showOriginal = false;
function schedule() {
  if (!raf) raf = requestAnimationFrame(() => {
    raf = 0;
    if (renderer && state.shown === state.cur && photo()) renderer.render(photo().params, { original: showOriginal });
  });
}

// ---------- AI ----------
function loadAI() {
  if (state.ai === 'ready') return Promise.resolve();
  state.ai = 'loading';
  ui.refresh();
  return initAI().then(
    () => { state.ai = 'ready'; ui.refresh(); },
    (e) => { console.warn(e); state.ai = 'error'; ui.refresh(); throw e; },
  );
}

async function analyzePhoto(ph, source, w, h) {
  try {
    await loadAI();
    ph.analysis = await analyze(source, w, h);
    ph.faces = ph.analysis.faces.length;
  } catch (e) {
    console.warn('Analysis unavailable', e);
  }
}

// ---------- photos ----------
function thumbFrom(src) {
  const [w, h] = fitSize(src.width, src.height, 112);
  return drawScaled(src, w, h).toDataURL('image/jpeg', 0.7);
}

async function addFiles(files) {
  files = files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  if (!files.length || !renderer) return;
  const first = state.photos.length;
  for (const file of files) state.photos.push({ file, params: defaults(), past: [], future: [], analysis: null, faces: null, thumb: null });
  await select(first);
  for (const ph of state.photos.slice(first)) {
    if (ph.thumb) continue;
    try {
      const img = await decode(ph.file);
      ph.thumb = thumbFrom(img.naturalWidth ? drawScaled(img, ...fitSize(img.naturalWidth, img.naturalHeight, 256)) : img);
      renderStrip();
    } catch { /* unreadable file: leave a blank thumbnail */ }
  }
}

let loadToken = 0;
async function select(i) {
  if (i < 0 || i >= state.photos.length) return;
  commit();
  const token = ++loadToken;
  state.cur = i;
  setHeal(false);
  const ph = photo();
  setStatus('Opening photo…', true);
  try {
    const img = await decode(ph.file);
    if (token !== loadToken) return;
    const [w, h] = fitSize(img.naturalWidth, img.naturalHeight, Math.min(PREVIEW_MAX, renderer.maxSize));
    const src = drawScaled(img, w, h);
    if (!ph.thumb) ph.thumb = thumbFrom(src);
    state.stats = drawScaled(src, 48, 48).getContext('2d').getImageData(0, 0, 48, 48).data;
    renderer.setImage(src, w, h);
    renderer.setAnalysis(ph.analysis);
    state.shown = i;
    canvas.style.display = 'block';
    $('empty').hidden = true;
    viewer.fit();
    schedule();
    updateButtons();
    renderStrip();
    ui.refresh();
    if (!ph.analysis) {
      setStatus(state.ai === 'ready' ? 'Finding faces and skin…' : 'Loading on-device AI…', true);
      await analyzePhoto(ph, src, w, h);
      if (token !== loadToken) return;
      if (ph.analysis) renderer.setAnalysis(ph.analysis);
      schedule();
      ui.refresh();
      if (state.ai === 'error') { toast('AI could not load. Colour tools still work.'); return; }
    }
    setStatus('');
  } catch (e) {
    console.error(e);
    if (token === loadToken) toast('Could not open this photo.');
  }
}

function renderStrip() {
  const strip = $('strip');
  strip.hidden = state.photos.length < 2;
  strip.textContent = '';
  state.photos.forEach((ph, i) => {
    const b = document.createElement('button');
    b.className = `thumb${i === state.cur ? ' on' : ''}`;
    b.setAttribute('aria-label', `Photo ${i + 1}`);
    if (ph.thumb) b.append(Object.assign(new Image(), { src: ph.thumb, alt: '' }));
    b.onclick = () => i !== state.cur && select(i);
    strip.append(b);
  });
}

// ---------- edits & history ----------
function change(key, v) {
  const ph = photo();
  if (!ph) return;
  if (!ph.pending) ph.pending = clone(ph.params);
  ph.params[key] = v;
  schedule();
}

function commit() {
  const ph = photo();
  if (!ph || !ph.pending) return;
  if (!same(ph.pending, ph.params)) {
    ph.past.push(ph.pending);
    if (ph.past.length > 80) ph.past.shift();
    ph.future = [];
  }
  ph.pending = null;
  updateButtons();
}

function setParams(next) {
  const ph = photo();
  if (!ph) return;
  commit();
  ph.past.push(clone(ph.params));
  ph.future = [];
  ph.params = next;
  schedule();
  updateButtons();
  ui.refresh();
}

function undo() {
  const ph = photo();
  commit();
  if (!ph || !ph.past.length) return;
  ph.future.push(ph.params);
  ph.params = ph.past.pop();
  schedule(); updateButtons(); ui.refresh();
}

function redo() {
  const ph = photo();
  if (!ph || !ph.future.length) return;
  ph.past.push(ph.params);
  ph.params = ph.future.pop();
  schedule(); updateButtons(); ui.refresh();
}

function updateButtons() {
  const ph = photo();
  $('btnUndo').disabled = !ph || !ph.past.length;
  $('btnRedo').disabled = !ph || !ph.future.length;
  $('btnCompare').disabled = !ph;
  $('btnExport').disabled = !ph;
}

function setHeal(on) {
  state.healMode = on;
  $('healHint').hidden = !on;
  ui.refresh();
}

// Simple automatic exposure / white balance / contrast from a 48x48 thumbnail.
function autoTone() {
  const d = state.stats;
  if (!d) return {};
  let r = 0, g = 0, b = 0;
  const lum = [];
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; g += d[i + 1]; b += d[i + 2];
    lum.push((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255);
  }
  const n = lum.length;
  r /= n; g /= n; b /= n;
  lum.sort((x, y) => x - y);
  const median = lum[n >> 1], lo = lum[Math.floor(n * 0.02)], hi = lum[Math.floor(n * 0.98)];
  const stops = 2.2 * Math.log2(0.46 / Math.max(median, 0.03));
  return {
    exposure: Math.round(clamp((stops / 1.2) * 100 * 0.7, -60, 60)),
    temp: Math.round(clamp(((b - r) / (r + b + 1)) * 150, -35, 35)),
    tint: Math.round(clamp(((g - (r + b) / 2) / (g + 1)) * 200, -25, 25)),
    contrast: Math.round(clamp((0.85 - (hi - lo)) * 60, 0, 30)),
    highlights: hi > 0.96 ? -25 : 0,
    shadows: lo < 0.04 ? 20 : 0,
    vibrance: 10,
  };
}

function action(id, arg) {
  const ph = photo();
  if (id === 'brush') { state.brush = arg; return; }
  if (!ph) { toast('Open a photo first'); return; }
  switch (id) {
    case 'heal': setHeal(!state.healMode); break;
    case 'auto': setParams({ ...clone(ph.params), ...AUTO_RETOUCH }); toast(ph.faces ? 'Auto retouch applied' : 'Applied (no face found)'); break;
    case 'clearHeals': setParams({ ...clone(ph.params), heals: [] }); break;
    case 'autotone': setParams({ ...clone(ph.params), ...autoTone() }); break;
    case 'look': setParams(applyLook(ph.params, arg)); break;
    case 'saveLook': {
      const name = prompt('Name this look', 'My look');
      if (!name) return;
      saveUserLooks([...loadUserLooks(), lookFromParams(name.trim().slice(0, 24), ph.params)]);
      ui.refresh();
      break;
    }
    case 'clearLooks':
      if (confirm('Delete all of your saved looks?')) { saveUserLooks([]); ui.refresh(); }
      break;
    case 'syncAll': {
      commit();
      const p = syncable(ph.params);
      for (const o of state.photos) {
        if (o === ph) continue;
        o.past.push(clone(o.params));
        o.future = [];
        o.params = { ...clone(p), heals: o.params.heals };
      }
      toast(`Applied to all ${state.photos.length} photos`);
      break;
    }
  }
}

function onTap(t) {
  const ph = photo();
  if (!ph) return;
  if (state.healMode) {
    if (!t.inside) return;
    const r = (ph.analysis ? ph.analysis.faceSize : 0.25) * (state.brush / 100) * 0.12;
    const next = clone(ph.params);
    next.heals.push({ x: t.x, y: t.y, r });
    setParams(next);
    viewer.flash(t.p, r * canvas.height);
  } else if (t.double) {
    viewer.toggleZoom(t.p);
  }
}

// ---------- export ----------
let ready = [];
function bar(f) { $('expProgress').firstElementChild.style.width = `${Math.round(f * 100)}%`; }
function openSheet() {
  if (!photo()) return;
  commit();
  ready = [];
  $('expCount').textContent = state.photos.length;
  $('expAll').closest('label').hidden = state.photos.length < 2;
  $('expFormat').value = photo().params.bgMode === 'remove' ? 'png' : 'jpeg';
  $('expGo').hidden = false;
  $('expSave').hidden = true;
  $('expProgress').hidden = true;
  $('expMsg').textContent = '';
  $('sheet').hidden = false;
}

async function runExport() {
  const list = $('expAll').checked && state.photos.length > 1 ? state.photos : [photo()];
  const type = $('expFormat').value === 'png' ? 'image/png' : 'image/jpeg';
  const quality = +$('expQuality').value / 100;
  $('expGo').hidden = true;
  $('expProgress').hidden = false;
  bar(0);
  ready = [];
  try {
    for (let i = 0; i < list.length; i++) {
      const ph = list[i];
      $('expMsg').textContent = `Rendering ${i + 1} of ${list.length} at full size…`;
      if (!ph.analysis && state.ai !== 'error') {
        const img = await decode(ph.file);
        await analyzePhoto(ph, img, img.naturalWidth, img.naturalHeight);
      }
      ready.push(await renderFile(ph, { type, quality }));
      bar((i + 1) / list.length);
      await new Promise((r) => setTimeout(r, 30));
    }
    const mb = ready.reduce((s, f) => s + f.size, 0) / 1048576;
    $('expMsg').textContent = `${ready.length} photo${ready.length > 1 ? 's' : ''} ready (${mb.toFixed(1)} MB).`;
    $('expSave').hidden = false;
  } catch (e) {
    console.error(e);
    $('expMsg').textContent = `Export failed: ${e.message}`;
    $('expGo').hidden = false;
  }
}

async function saveReady() {
  const r = await saveFiles(ready);
  $('expMsg').textContent = r === 'shared' ? 'Done. In the share sheet, “Save Image” puts it in Photos.'
    : r === 'downloaded' ? 'Downloaded. On iPhone/iPad it is in the Files app → Downloads.' : 'Cancelled.';
}

// ---------- wiring ----------
const openPicker = () => $('file').click();
$('btnOpen').onclick = openPicker;
$('btnOpenBig').onclick = openPicker;
$('file').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  addFiles(files);
});
$('btnUndo').onclick = undo;
$('btnRedo').onclick = redo;
const cmp = $('btnCompare');
const setOriginal = (on) => { if (showOriginal !== on) { showOriginal = on; cmp.classList.toggle('on', on); schedule(); } };
cmp.addEventListener('pointerdown', (e) => { e.preventDefault(); setOriginal(true); });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) cmp.addEventListener(ev, () => setOriginal(false));
cmp.addEventListener('contextmenu', (e) => e.preventDefault());
$('btnExport').onclick = openSheet;
$('expClose').onclick = () => { $('sheet').hidden = true; ready = []; };
$('expGo').onclick = runExport;
$('expSave').onclick = saveReady;
$('expQuality').oninput = () => { $('expQualityOut').textContent = $('expQuality').value; };

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  if (e.key === '\\') setOriginal(true);
});
document.addEventListener('keyup', (e) => { if (e.key === '\\') setOriginal(false); });

const stage = $('stage');
stage.addEventListener('dragover', (e) => e.preventDefault());
stage.addEventListener('drop', (e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });

canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => {
  renderer = new Renderer(canvas);
  state.shown = -1;
  if (state.cur >= 0) select(state.cur);
});

// Start fetching the AI models early so the first photo is analysed quickly.
setTimeout(() => loadAI().catch(() => {}), 600);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Offline mode unavailable', e));
}

// Test hook: lets automated checks load an image without the file picker.
window.glowStudio = { addFiles, state, change, commit, action, ui, get renderer() { return renderer; } };
