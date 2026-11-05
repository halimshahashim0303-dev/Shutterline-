// GLSL ES 3.0 fragment shaders. All passes share the vertex shader in gl.js.

const HEAD = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
#define T(t, p) textureLod(t, p, 0.0)
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

export const COPY = HEAD + `
uniform sampler2D u_tex;
void main() { o = T(u_tex, v_uv); }`;

// Edge-preserving blur, run once horizontally and once vertically.
export const BILATERAL = HEAD + `
uniform sampler2D u_tex;
uniform vec2 u_step;
uniform float u_sigmaR;
void main() {
  vec4 c0 = T(u_tex, v_uv);
  vec3 sum = c0.rgb; float wsum = 1.0;
  float inv = -0.5 / (u_sigmaR * u_sigmaR);
  for (int i = 1; i <= 10; i++) {
    float fi = float(i);
    float ws = exp(-fi * fi / 50.0);
    vec3 a = T(u_tex, v_uv + u_step * fi).rgb;
    vec3 b = T(u_tex, v_uv - u_step * fi).rgb;
    vec3 da = a - c0.rgb, db = b - c0.rgb;
    float wa = ws * exp(dot(da, da) * inv);
    float wb = ws * exp(dot(db, db) * inv);
    sum += a * wa + b * wb; wsum += wa + wb;
  }
  o = vec4(sum / wsum, c0.a);
}`;

// Separable Gaussian on all four channels.
export const GAUSS = HEAD + `
uniform sampler2D u_tex;
uniform vec2 u_step;
void main() {
  vec4 sum = T(u_tex, v_uv); float wsum = 1.0;
  for (int i = 1; i <= 8; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / 32.0);
    sum += (T(u_tex, v_uv + u_step * fi) + T(u_tex, v_uv - u_step * fi)) * w;
    wsum += 2.0 * w;
  }
  o = sum / wsum;
}`;

// Downsample the photo, keeping only background pixels (alpha = background weight).
export const BGPREP = HEAD + `
uniform sampler2D u_tex, u_seg;
uniform vec2 u_texel;
void main() {
  vec3 c = (T(u_tex, v_uv + u_texel * vec2(-1.0, -1.0)).rgb + T(u_tex, v_uv + u_texel * vec2(1.0, -1.0)).rgb
          + T(u_tex, v_uv + u_texel * vec2(-1.0, 1.0)).rgb + T(u_tex, v_uv + u_texel * vec2(1.0, 1.0)).rgb) * 0.25;
  float bg = 1.0 - smoothstep(0.2, 0.6, T(u_seg, v_uv).b);
  o = vec4(c * bg, bg);
}`;

// Retouch + background + colour grade. Masks: seg = (face skin, body skin, person, hair),
// face = (eyes, inner mouth, protected features, under-eye).
export const COMPOSITE = HEAD + `
uniform sampler2D u_src, u_smooth, u_mid, u_bg, u_seg, u_face;
uniform vec2 u_texel;
uniform float u_aspect, u_rSmall, u_hasSeg;
uniform float u_smoothAmt, u_texture, u_blemish, u_shine, u_underEye, u_eyes, u_teeth;
uniform float u_exposure, u_contrast, u_highlights, u_shadows, u_temp, u_tint;
uniform float u_vibrance, u_saturation, u_clarity, u_sharpen, u_fade;
uniform int u_bgMode;
uniform vec3 u_bgColor;
uniform int u_healN;
uniform vec3 u_heal[64];

vec3 blur9(sampler2D t, vec2 uv, vec2 d) {
  vec3 s = T(t, uv).rgb * 4.0;
  s += (T(t, uv + vec2(d.x, 0.0)).rgb + T(t, uv - vec2(d.x, 0.0)).rgb
      + T(t, uv + vec2(0.0, d.y)).rgb + T(t, uv - vec2(0.0, d.y)).rgb) * 2.0;
  s += T(t, uv + d).rgb + T(t, uv - d).rgb + T(t, uv + vec2(d.x, -d.y)).rgb + T(t, uv + vec2(-d.x, d.y)).rgb;
  return s / 16.0;
}

void main() {
  vec2 uv = v_uv;
  vec2 dS = u_texel * u_rSmall;
  vec3 src = T(u_src, uv).rgb;
  vec3 mid = T(u_mid, uv).rgb;
  vec3 small = blur9(u_src, uv, dS);
  vec3 fine = src - small;
  vec4 seg = T(u_seg, uv) * u_hasSeg;
  vec4 fm = T(u_face, uv);
  float skin = clamp(max(seg.r, seg.g * 0.85), 0.0, 1.0) * (1.0 - fm.b);
  vec3 c = src;

  // 1. Skin smoothing: edge-aware blur plus a share of the original pore texture.
  vec3 sm = T(u_smooth, uv).rgb;
  float ks = skin * u_smoothAmt;
  c = mix(c, sm + fine * u_texture, ks);

  // 2. Blemishes: small spots darker or redder than the skin around them.
  float lS = luma(small), lM = luma(mid);
  float dark = lM - lS;
  float red = (small.r - 0.5 * (small.g + small.b)) - (mid.r - 0.5 * (mid.g + mid.b));
  float lo = mix(0.06, 0.012, u_blemish);
  float spot = max(smoothstep(lo, lo + 0.035, dark),
                   smoothstep(lo * 1.4, lo * 1.4 + 0.05, red) * smoothstep(-0.03, 0.0, dark));
  spot *= skin * step(0.001, u_blemish);
  c = mix(c, mid + fine * 0.35 * u_texture, spot);

  // 3. Shine: bright, colourless highlights on skin.
  float l = luma(c);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float shine = smoothstep(lM + 0.03, lM + 0.18, l) * (1.0 - smoothstep(0.12, 0.32, sat)) * skin * u_shine;
  c = mix(c, mix(c, mid, 0.6) * 0.94, shine);

  // 4. Dark circles: lift, warm and soften under the eyes.
  float ue = fm.a * u_underEye;
  vec3 lifted = mix(c, sm + fine * 0.3, 0.5);
  lifted += (1.0 - lifted) * 0.16;
  lifted.r += 0.012; lifted.b -= 0.01;
  c = mix(c, lifted, ue);

  // 5. Eyes: clean up the whites and add sparkle to the iris.
  float ke = fm.r * u_eyes;
  if (ke > 0.001) {
    vec3 e = c;
    float le = luma(e);
    e = mix(e, vec3(le), 0.45 * smoothstep(0.3, 0.75, le));
    e += (e - mid) * 0.7;
    e *= 1.0 + 0.16 * smoothstep(0.25, 0.7, le);
    c = mix(c, e, ke);
  }

  // 6. Teeth: remove yellow and brighten pixels that look like teeth inside the mouth.
  float kt = fm.g * u_teeth;
  if (kt > 0.001) {
    float lt = luma(c);
    float teeth = smoothstep(0.2, 0.4, lt) * (1.0 - smoothstep(0.1, 0.22, c.r - c.g));
    vec3 w = c;
    w.b += ((w.r + w.g) * 0.5 - w.b) * 0.7;
    w = mix(w, vec3(luma(w)), 0.3) * 1.12;
    c = mix(c, w, kt * teeth);
  }

  // 7. Healing brush: rebuild each tapped spot from the skin ring around it, then add texture back.
  vec2 asp = vec2(u_aspect, 1.0);
  for (int i = 0; i < 64; i++) {
    if (i >= u_healN) break;
    vec3 h = u_heal[i];
    vec2 d = (uv - h.xy) * asp;
    float dist = length(d);
    if (dist < h.z) {
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int k = 0; k < 12; k++) {
        float a = float(k) * 0.5235988;
        vec2 off = vec2(cos(a), sin(a)) * h.z * 1.15;
        vec3 s = blur9(u_src, h.xy + off / asp, dS);
        vec2 dd = d - off;
        float w = 1.0 / (1e-6 + dot(dd, dd));
        acc += s * w; wsum += w;
      }
      vec2 tuv = uv + vec2(h.z * 2.3 / u_aspect, 0.0);
      vec3 detail = T(u_src, tuv).rgb - blur9(u_src, tuv, dS);
      float wgt = 1.0 - smoothstep(h.z * 0.55, h.z, dist);
      c = mix(c, acc / wsum + detail * (0.8 - 0.5 * ks), wgt);
    }
  }

  // 8. Clarity and sharpening, kept off smoothed skin.
  float keepTex = 1.0 - ks * 0.85;
  c += (src - mid) * u_clarity * 0.6 * keepTex;
  c += fine * u_sharpen * 1.6 * keepTex;

  // 9. Portrait blur (before grading so the grade covers everything).
  float person = mix(1.0, smoothstep(0.25, 0.75, seg.b), u_hasSeg);
  if (u_bgMode == 1) {
    vec4 b = T(u_bg, uv);
    vec3 blurred = b.a > 0.002 ? b.rgb / b.a : c;
    c = mix(blurred, c, person);
  }

  // 10. Colour grade. Exposure and white balance in linear light, the rest on display values.
  vec3 lin = pow(max(c, 0.0), vec3(2.2));
  lin *= exp2(u_exposure * 1.2);
  lin *= vec3(1.0 + 0.18 * u_temp + 0.06 * u_tint, 1.0 - 0.10 * u_tint, 1.0 - 0.22 * u_temp + 0.06 * u_tint);
  c = pow(lin, vec3(1.0 / 2.2));
  float L = luma(clamp(c, 0.0, 1.0));
  c += u_shadows * 0.22 * (1.0 - smoothstep(0.0, 0.55, L)) + u_highlights * 0.22 * smoothstep(0.45, 1.0, L);
  vec3 cc = clamp(c, 0.0, 1.0);
  c = u_contrast >= 0.0 ? mix(c, cc * cc * (3.0 - 2.0 * cc), u_contrast)
                        : mix(c, 0.5 + (c - 0.5) * 0.5, -u_contrast);
  c = mix(c, c * 0.82 + 0.1, u_fade);
  float Lc = luma(c);
  float sat2 = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float vib = u_vibrance * (1.0 - smoothstep(0.0, 0.6, sat2)) * (1.0 - skin * 0.6);
  c = mix(vec3(Lc), c, max(0.0, 1.0 + u_saturation + vib));

  float alpha = 1.0;
  if (u_bgMode == 2) alpha = person;
  else if (u_bgMode == 3) c = mix(u_bgColor, c, person);
  o = vec4(clamp(c, 0.0, 1.0), alpha);
}`;

// Face reshaping (local warps), vignette and grain. Coordinates are in "aspect space": x * aspect, y.
export const FINAL = HEAD + `
uniform sampler2D u_tex;
uniform float u_aspect, u_vignette, u_grain, u_seed;
uniform vec2 u_px;
uniform int u_warpN;
uniform vec4 u_warp[48];
uniform float u_warpR[48];
uniform int u_bulgeN;
uniform vec4 u_bulge[8];
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main() {
  vec2 asp = vec2(u_aspect, 1.0);
  vec2 p = v_uv * asp;
  vec2 q = p;
  for (int i = 0; i < 48; i++) {
    if (i >= u_warpN) break;
    vec4 w = u_warp[i];
    float R2 = u_warpR[i] * u_warpR[i];
    vec2 d = p - w.xy;
    float dd = dot(d, d);
    if (dd < R2) {
      float f = 1.0 - dd / R2;   // smooth bump: (1 - d^2/R^2)^2, zero slope at the edge
      q -= f * f * w.zw;
    }
  }
  for (int i = 0; i < 8; i++) {
    if (i >= u_bulgeN) break;
    vec4 b = u_bulge[i];
    vec2 d = q - b.xy;
    float r2 = dot(d, d), R2 = b.z * b.z;
    if (r2 < R2) q = b.xy + d * (1.0 - b.w * (1.0 - r2 / R2));
  }
  vec4 c = T(u_tex, q / asp);
  float vd = length(v_uv - 0.5) * 1.4142;
  float vig = smoothstep(0.35, 1.05, vd);
  if (u_vignette < 0.0) c.rgb *= 1.0 + u_vignette * vig * 0.85;
  else c.rgb = mix(c.rgb, vec3(1.0), u_vignette * vig * 0.7);
  if (u_grain > 0.0) {
    float cell = max(1.0, u_px.y / 1400.0);
    float n = hash(floor(v_uv * u_px / cell) + u_seed) - 0.5;
    c.rgb += n * u_grain * 0.14;
  }
  o = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
}`;
