// Photo decoding, full-resolution export, and saving (share sheet on iPhone/iPad, download elsewhere).
import { Renderer } from './renderer.js';

const MAX_EXPORT_SIDE = 4096;   // safe for iPhone/iPad WebGL and canvas limits
const MAX_EXPORT_PIXELS = 16.7e6;

// Load with an <img> so EXIF rotation is applied (Safari 13.1+, Chrome 81+).
// Uses the load event: img.decode() can stall while the page is in the background.
export function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file could not be read as an image.')); };
    img.src = url;
  });
}

export function fitSize(w, h, maxSide, maxPixels = Infinity) {
  let k = Math.min(1, maxSide / Math.max(w, h));
  if (w * h * k * k > maxPixels) k = Math.sqrt(maxPixels / (w * h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

export function drawScaled(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, w, h);
  return c;
}

export function exportName(file, type) {
  const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
  return `${base}-glow.${type === 'image/png' ? 'png' : 'jpg'}`;
}

// Render one photo at full size and return a File.
export async function renderFile(photo, { type = 'image/jpeg', quality = 0.92 } = {}) {
  const img = await decode(photo.file);
  const canvas = document.createElement('canvas');
  const r = new Renderer(canvas);
  try {
    const [w, h] = fitSize(img.naturalWidth, img.naturalHeight, Math.min(MAX_EXPORT_SIDE, r.maxSize), MAX_EXPORT_PIXELS);
    const src = drawScaled(img, w, h);
    r.setImage(src, w, h);
    src.width = src.height = 0; // release memory early (matters on iPhone)
    r.setAnalysis(photo.analysis);
    r.render(photo.params, { seed: 0.37 });
    const blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('The image was too large to export.'))), type, quality));
    return new File([blob], exportName(photo.file, type), { type, lastModified: Date.now() });
  } finally {
    r.dispose();
    canvas.width = canvas.height = 0;
  }
}

// Must be called straight from a tap so iOS allows the share sheet.
export async function saveFiles(files) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      console.warn('Share failed, downloading instead', e);
    }
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    await new Promise((r) => setTimeout(r, 300));
  }
  return 'downloaded';
}
