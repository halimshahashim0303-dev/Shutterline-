// Face geometry from the MediaPipe Face Landmarker (478 points, normalised: x to the right, y down).

const IDX = {
  rightEye: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  leftEye: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
  rightLower: [33, 7, 163, 144, 145, 153, 154, 155, 133],
  leftLower: [263, 249, 390, 373, 374, 380, 381, 382, 362],
  rightBrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  leftBrow: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  lipsOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  lipsInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95],
};
// Jaw/cheek points pulled towards the face centre line, with weights. Few, wide, smooth warps:
// the total push stays well below the warp radius, so the image can never fold over.
const SLIM = [[132, 0.5], [172, 1], [150, 0.6], [361, 0.5], [397, 1], [379, 0.6]];

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const centroid = (pts) => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
const scaled = (pts, k) => {
  const c = centroid(pts);
  return pts.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
};

// Normalised face height/width from the landmark bounding box.
export function faceBox(lm) {
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const p of lm) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
}

// Soft-edged fill. Draws the shape off-canvas and lets its blurred shadow land in place
// (works in Safari, which lacks ctx.filter).
function soft(ctx, pts, blur, color) {
  const OFF = 20000;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(0.5, blur);
  ctx.shadowOffsetX = OFF;
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x - OFF, y) : ctx.moveTo(x - OFF, y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function ellipsePts(c, rx, ry, n = 24) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * ry];
  });
}

// RGBA mask (bottom-up rows): R eyes, G inner mouth, B protected features, A under-eye.
export function faceMasks(faces, w, h) {
  const layers = [0, 1, 2, 3].map(() => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#000';
    x.fillRect(0, 0, w, h);
    return x;
  });
  const [eyes, mouth, prot, under] = layers;

  for (const f of faces) {
    const pt = (i) => [f.lm[i].x * w, f.lm[i].y * h];
    const eyeW = dist(pt(33), pt(133));
    for (const loop of [IDX.rightEye, IDX.leftEye]) {
      soft(eyes, scaled(loop.map(pt), 1.12), eyeW * 0.08, '#fff');
      soft(prot, scaled(loop.map(pt), 1.5), eyeW * 0.15, '#fff');
    }
    for (const loop of [IDX.rightBrow, IDX.leftBrow]) soft(prot, scaled(loop.map(pt), 1.3), eyeW * 0.15, '#fff');
    soft(prot, scaled(IDX.lipsOuter.map(pt), 1.08), eyeW * 0.12, '#fff');
    soft(mouth, IDX.lipsInner.map(pt), eyeW * 0.05, '#fff');
    const noseW = dist(pt(98), pt(327));
    soft(prot, ellipsePts(centroid([pt(98), pt(327), pt(2)]), noseW * 0.62, noseW * 0.4), noseW * 0.15, '#fff');

    for (const [lower, loop] of [[IDX.rightLower, IDX.rightEye], [IDX.leftLower, IDX.leftEye]]) {
      const lid = lower.map(pt);
      const ew = dist(lid[0], lid[lid.length - 1]);
      const down = lid.map(([x, y], k) => [x, y + ew * (0.06 + 0.42 * Math.sin((Math.PI * k) / (lid.length - 1)))]);
      soft(under, [...lid, ...down.reverse()], ew * 0.14, '#fff');
      soft(under, scaled(loop.map(pt), 1.15), ew * 0.06, '#000');
    }
  }

  const px = layers.map((x) => x.getImageData(0, 0, w, h).data);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = y * w * 4, d = (h - 1 - y) * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      data[d + x] = px[0][s + x];
      data[d + x + 1] = px[1][s + x];
      data[d + x + 2] = px[2][s + x];
      data[d + x + 3] = px[3][s + x];
    }
  }
  return { w, h, data };
}

// Reshape warps in "aspect space" (x * aspect, y up), consumed by the FINAL shader.
export function buildWarps(faces, p, aspect) {
  const warp = new Float32Array(48 * 4), warpR = new Float32Array(48), bulge = new Float32Array(8 * 4);
  let n = 0, bn = 0;
  for (const f of faces.slice(0, 3)) {
    const P = (i) => [f.lm[i].x * aspect, 1 - f.lm[i].y];
    const a = P(168), b = P(152);
    const ax = [b[0] - a[0], b[1] - a[1]];
    const al2 = ax[0] * ax[0] + ax[1] * ax[1] || 1;
    const toAxis = (q) => {
      const t = ((q[0] - a[0]) * ax[0] + (q[1] - a[1]) * ax[1]) / al2;
      return [a[0] + ax[0] * t - q[0], a[1] + ax[1] * t - q[1]];
    };
    const add = (q, d, R) => {
      if (n >= 48) return;
      warp.set([q[0], q[1], d[0], d[1]], n * 4);
      warpR[n++] = R;
    };
    const faceW = dist(P(234), P(454));
    // Push of length `len` towards the centre line.
    const inward = (q, len) => {
      const d = toAxis(q), l = Math.hypot(d[0], d[1]) || 1;
      return [(d[0] / l) * len, (d[1] / l) * len];
    };
    if (p.slim > 0) {
      for (const [i, wt] of SLIM) {
        const q = P(i);
        add(q, inward(q, (p.slim / 100) * 0.06 * faceW * wt), faceW * 0.42);
      }
    }
    if (p.nose > 0) {
      const noseW = dist(P(98), P(327));
      for (const i of [98, 327]) {
        const q = P(i);
        add(q, inward(q, (p.nose / 100) * 0.12 * noseW), noseW * 0.8);
      }
    }
    if (p.eyeSize > 0) {
      const s = (p.eyeSize / 100) * 0.22;
      for (const [iris, outer, inner] of [[468, 33, 133], [473, 263, 362]]) {
        if (bn >= 8) break;
        const c = f.lm.length > 473 ? P(iris) : centroid([P(outer), P(inner)]);
        bulge.set([c[0], c[1], dist(P(outer), P(inner)) * 0.95, s], bn * 4);
        bn++;
      }
    }
  }
  return { warp, warpR, n, bulge, bn };
}
