// Small WebGL2 helpers. Convention: texture uv (0,0) is the bottom-left of the image.

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
    antialias: false, depth: false, stencil: false,
  });
  if (!gl) throw new Error('This device does not support WebGL2. Update iOS/iPadOS to 15 or newer.');
  return gl;
}

const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// One oversized triangle that covers the whole viewport.
export function createQuad(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

export function createProgram(gl, fsSrc, name = 'shader') {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`${name}: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(p)}`);
  const cache = new Map();
  const loc = (n) => {
    if (!cache.has(n)) cache.set(n, gl.getUniformLocation(p, n));
    return cache.get(n);
  };
  return { p, loc };
}

export function createTexture(gl, w, h, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const f = filter || gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return t;
}

// DOM image/canvas source. Flipped so the top row of the picture ends up at uv.y = 1.
export function uploadImage(gl, tex, source) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}

// Raw RGBA bytes whose rows are already stored bottom-up.
export function uploadPixels(gl, tex, w, h, data) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

export function createTarget(gl, w, h) {
  const tex = createTexture(gl, w, h);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

export function deleteTarget(gl, t) {
  if (!t) return;
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fb);
}

// Uniform values: number -> float, {i} -> int, {v1|v3|v4: Float32Array} -> arrays, [a,b(,c,d)] -> vecN.
export function setUniforms(gl, prog, uniforms) {
  for (const [name, v] of Object.entries(uniforms)) {
    const l = prog.loc(name);
    if (l === null) continue;
    if (typeof v === 'number') gl.uniform1f(l, v);
    else if (v.i !== undefined) gl.uniform1i(l, v.i);
    else if (v.v1) gl.uniform1fv(l, v.v1);
    else if (v.v3) gl.uniform3fv(l, v.v3);
    else if (v.v4) gl.uniform4fv(l, v.v4);
    else if (v.length === 2) gl.uniform2fv(l, v);
    else if (v.length === 3) gl.uniform3fv(l, v);
    else if (v.length === 4) gl.uniform4fv(l, v);
  }
}

// Run one full-screen pass into `target` (null = the canvas).
export function pass(gl, quad, prog, target, textures, uniforms) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
  gl.viewport(0, 0, target ? target.w : gl.drawingBufferWidth, target ? target.h : gl.drawingBufferHeight);
  gl.useProgram(prog.p);
  let unit = 0;
  for (const [name, tex] of Object.entries(textures)) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const l = prog.loc(name);
    if (l !== null) gl.uniform1i(l, unit);
    unit++;
  }
  setUniforms(gl, prog, uniforms);
  gl.bindVertexArray(quad);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}
