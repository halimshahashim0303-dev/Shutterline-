// Tool tabs and panels. Reads app state, reports changes through handlers.
import { TOOLS, LOOKS, DEFAULTS, loadUserLooks } from './params.js';

const ICONS = {
  retouch: 'M7.5 5.6 10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.996.996 0 0 0-1.41 0L1.29 18.96a.996.996 0 0 0 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05a.996.996 0 0 0 0-1.41l-2.33-2.35zm-1.03 5.49-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z',
  reshape: 'M9 11.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm6 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-.29.02-.58.05-.86 2.36-1.05 4.23-2.98 5.21-5.37C11.07 8.33 14.05 10 17.42 10c.78 0 1.53-.09 2.25-.26.21.71.33 1.47.33 2.26 0 4.41-3.59 8-8 8z',
  adjust: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  background: 'M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z',
  looks: 'M15.96 10.29l-2.75 3.54-1.96-2.36L8.5 15h11l-3.54-4.71zM3 5H1v16c0 1.1.9 2 2 2h16v-2H3V5zm18-4H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 16H7V3h14v14z',
};
const SWATCHES = ['#ffffff', '#f1ece4', '#d6d6d6', '#1b1b1b', '#2f6fd6', '#f2c6d1', '#c9e4d6', '#f6d38b'];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class UI {
  // state: { params, photos, ai, faces, healMode, brush }; h: { change(key, v), commit(), action(id, arg) }
  constructor(tabsEl, toolEl, state, h) {
    this.tabsEl = tabsEl;
    this.toolEl = toolEl;
    this.state = state;
    this.h = h;
    this.tool = 'retouch';
    this.buildTabs();
    this.refresh();
  }

  buildTabs() {
    this.tabsEl.innerHTML = '';
    for (const t of TOOLS) {
      const b = el('button', 'tab');
      b.setAttribute('role', 'tab');
      b.innerHTML = `<svg viewBox="0 0 24 24"><path d="${ICONS[t.id]}"/></svg>`;
      b.append(el('span', '', t.label));
      b.onclick = () => this.show(t.id);
      b.dataset.id = t.id;
      this.tabsEl.append(b);
    }
  }

  show(id) {
    if (this.tool === 'retouch' && id !== 'retouch' && this.state.healMode) this.h.action('heal');
    this.tool = id;
    this.toolEl.scrollTop = 0;
    this.refresh();
  }

  refresh() {
    const st = this.state, p = st.params, top = this.toolEl.scrollTop;
    for (const b of this.tabsEl.children) b.classList.toggle('on', b.dataset.id === this.tool);
    const box = this.toolEl;
    box.innerHTML = '';
    const tool = TOOLS.find((t) => t.id === this.tool);

    if (this.tool === 'retouch') {
      box.append(this.actions([
        ['auto', 'Auto retouch', 'accent'],
        ['heal', st.healMode ? 'Done healing' : 'Heal brush', st.healMode ? 'on' : ''],
        ...(p.heals.length ? [['clearHeals', `Undo all heals (${p.heals.length})`, '']] : []),
      ]));
      if (st.healMode) {
        box.append(this.slider({ key: 'brush', label: 'Brush size', min: 10, max: 100 }, st.brush, true));
      }
      box.append(this.faceNote());
    }
    if (this.tool === 'reshape') box.append(this.faceNote(' Works on up to 3 faces.'));
    if (this.tool === 'adjust') box.append(this.actions([['autotone', 'Auto tone', 'accent']]));
    if (tool.sliders) for (const d of tool.sliders) box.append(this.slider(d, p[d.key]));
    if (this.tool === 'background') this.backgroundPanel(box, p);
    if (this.tool === 'looks') this.looksPanel(box, p);
    box.scrollTop = top;
  }

  faceNote(extra = '') {
    const st = this.state;
    let msg;
    if (!st.photos) msg = 'Open a photo to start.';
    else if (st.ai === 'loading') msg = 'Loading the on-device AI (first time only, about 20 MB)…';
    else if (st.ai === 'error') msg = 'AI could not load (check your connection). Colour tools still work.';
    else if (st.faces == null) msg = 'Analysing faces…';
    else if (st.faces === 0) msg = 'No face found. Skin tools work on any visible skin; face tools need a face.';
    else msg = `${st.faces} face${st.faces > 1 ? 's' : ''} found.`;
    return el('p', 'note', msg + extra);
  }

  actions(list) {
    const row = el('div', 'actions');
    for (const [id, label, cls] of list) {
      const b = el('button', `chip ${cls}`, label);
      b.onclick = () => this.h.action(id);
      row.append(b);
    }
    return row;
  }

  slider(def, value, uiOnly = false) {
    const wrap = el('div', 'ctl');
    const head = el('div', 'ctl-head');
    const out = el('output');
    out.title = 'Tap to reset';
    head.append(el('span', '', def.label), out);
    const input = el('input');
    Object.assign(input, { type: 'range', min: def.min, max: def.max, step: 1, value });
    input.setAttribute('aria-label', def.label);
    const paint = () => {
      const v = +input.value, span = def.max - def.min;
      out.textContent = def.min < 0 && v > 0 ? `+${v}` : `${v}`;
      const pos = ((v - def.min) / span) * 100;
      const zero = ((Math.max(def.min, 0) - def.min) / span) * 100;
      input.style.setProperty('--a', `${Math.min(pos, zero)}%`);
      input.style.setProperty('--b', `${Math.max(pos, zero)}%`);
    };
    const set = (v, commit) => {
      if (uiOnly) this.h.action(def.key, v);
      else this.h.change(def.key, v);
      if (commit && !uiOnly) this.h.commit();
    };
    input.addEventListener('input', () => { paint(); set(+input.value, false); });
    input.addEventListener('change', () => { if (!uiOnly) this.h.commit(); });
    out.addEventListener('click', () => {
      input.value = uiOnly ? 40 : DEFAULTS[def.key];
      paint();
      set(+input.value, true);
    });
    paint();
    wrap.append(head, input);
    return wrap;
  }

  backgroundPanel(box, p) {
    const st = this.state;
    if (st.ai === 'error') box.append(el('p', 'note', 'Background tools need the on-device AI, which could not load.'));
    const seg = el('div', 'seg');
    for (const [mode, label] of [['none', 'Original'], ['blur', 'Blur'], ['remove', 'Remove'], ['color', 'Colour']]) {
      const b = el('button', p.bgMode === mode ? 'on' : '', label);
      b.onclick = () => { this.h.change('bgMode', mode); this.h.commit(); this.refresh(); };
      seg.append(b);
    }
    box.append(seg);
    if (p.bgMode === 'blur') box.append(this.slider({ key: 'bgBlur', label: 'Blur strength', min: 0, max: 100 }, p.bgBlur));
    if (p.bgMode === 'remove') box.append(el('p', 'note', 'Export as PNG to keep the background transparent.'));
    if (p.bgMode === 'color') {
      const row = el('div', 'swatches');
      for (const c of SWATCHES) {
        const b = el('button', `swatch${p.bgColor === c ? ' on' : ''}`);
        b.style.background = c;
        b.setAttribute('aria-label', `Background ${c}`);
        b.onclick = () => { this.h.change('bgColor', c); this.h.commit(); this.refresh(); };
        row.append(b);
      }
      const pick = el('input');
      Object.assign(pick, { type: 'color', value: p.bgColor });
      pick.setAttribute('aria-label', 'Custom colour');
      pick.addEventListener('input', () => this.h.change('bgColor', pick.value));
      pick.addEventListener('change', () => { this.h.commit(); this.refresh(); });
      row.append(pick);
      box.append(row);
    }
    if (st.faces === 0 && p.bgMode !== 'none') box.append(el('p', 'note', 'Works best on photos of people.'));
  }

  looksPanel(box, p) {
    const grid = el('div', 'looks');
    for (const look of [...LOOKS, ...loadUserLooks()]) {
      const b = el('button', `look${p.look === look.id ? ' on' : ''}`, look.name);
      b.style.background = look.bg;
      b.onclick = () => this.h.action('look', look);
      grid.append(b);
    }
    box.append(grid);
    const list = [['saveLook', 'Save current look', '']];
    if (loadUserLooks().length) list.push(['clearLooks', 'Delete my looks', '']);
    if (this.state.photos > 1) list.unshift(['syncAll', `Apply to all ${this.state.photos} photos`, 'accent']);
    box.append(this.actions(list));
    box.append(el('p', 'note', 'Looks change colour and tone. "Apply to all" copies every setting except healed spots.'));
  }
}
