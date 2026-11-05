// On-device AI with MediaPipe Tasks (WASM + WebGL): skin/person segmentation and face landmarks.
// Nothing is uploaded: the models are downloaded once, cached by the service worker, and run locally.
import { faceBox, faceMasks } from './face.js';

export const MP_VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
export const MODEL_URLS = [
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
];
const MASK_MAX = 768;

let ready = null;
let segmenter = null;
let landmarker = null;

export function initAI() {
  if (ready) return ready;
  ready = (async () => {
    const { FilesetResolver, ImageSegmenter, FaceLandmarker } = await import(`${CDN}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    const make = async (Cls, opts) => {
      try {
        return await Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } });
      } catch (e) {
        console.warn('GPU delegate unavailable, using CPU', e);
        return Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } });
      }
    };
    segmenter = await make(ImageSegmenter, {
      baseOptions: { modelAssetPath: MODEL_URLS[0] },
      runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
    });
    landmarker = await make(FaceLandmarker, {
      baseOptions: { modelAssetPath: MODEL_URLS[1] },
      runningMode: 'IMAGE', numFaces: 5, minFaceDetectionConfidence: 0.4,
    });
    return true;
  })();
  ready.catch(() => { ready = null; }); // allow a retry later (e.g. when back online)
  return ready;
}

// Categories of the multiclass model: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 other.
function segment(canvas) {
  let out = null;
  segmenter.segment(canvas, (res) => {
    const m = res.confidenceMasks || [];
    if (m.length < 4) return;
    const w = m[0].width, h = m[0].height;
    const [bg, hair, body, face] = [0, 1, 2, 3].map((i) => m[i].getAsFloat32Array());
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const s = y * w, d = (h - 1 - y) * w;
      for (let x = 0; x < w; x++) {
        const i = s + x, o = (d + x) * 4;
        data[o] = face[i] * 255;
        data[o + 1] = body[i] * 255;
        data[o + 2] = (1 - bg[i]) * 255;
        data[o + 3] = hair[i] * 255;
      }
    }
    out = { w, h, data };
  });
  return out;
}

// Analyse a photo (canvas or image of size sw x sh). Returns masks + landmarks for the renderer.
export async function analyze(source, sw, sh) {
  await initAI();
  const k = Math.min(1, MASK_MAX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(source, 0, 0, w, h);

  let faces = [];
  try {
    const r = landmarker.detect(c);
    faces = (r.faceLandmarks || []).map((lm) => ({
      lm: lm.map((p) => ({ x: p.x, y: p.y })),
      box: faceBox(lm),
    }));
    faces.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  } catch (e) {
    console.warn('Face detection failed', e);
  }

  let seg = null;
  try {
    seg = segment(c);
  } catch (e) {
    console.warn('Segmentation failed', e);
  }

  return {
    seg,
    face: faces.length ? faceMasks(faces, w, h) : null,
    faces: faces.map((f) => ({ lm: f.lm })),
    faceSize: faces.length ? faces[0].box.h : 0.25,
  };
}
