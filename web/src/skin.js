// Skins, chosen in Opzioni and remembered per device like the fonts. Every skin but Vetrina replaces the set's
// gradients with a live WebGL2 backdrop tinted with the hue of whatever has focus, drawn in two passes: a field
// (into a texture, at `scale` of the canvas) and a post pass onto the canvas. Four fields are OpenShaders' folded
// light ribbons with their authors' constants: @elsoghiar (Aurora), @dolza (Terminale), @isuru (Prisma) and
// @voidy (Eco), openshaders.com. Reticolo is our own wireframe set.

// The ribbons' constants, in this order (FLOW_SPEED carries the original's FLOW_DIRECTION).
const RIBBON_KEYS = `HUE_SPREAD HUE_TRAVEL CHROMA LIGHTNESS COLOUR_CYCLE THETA SHEAR SHRINK LAYERS WARP_FREQ_X WARP_FREQ_Y
  WARP_AMP_X WARP_AMP_Y ASPECT_X ASPECT_Y OFFSET_X OFFSET_Y TILT ZOOM CENTRE_X CENTRE_Y GLOW_SIZE FALLOFF VIGNETTE
  FLOW_SPEED BREATH_RATE BREATH_AMOUNT PHASE ECHO ECHO_SHIFT SOFTNESS LIGHT_SWING`.split(/\s+/);

const glsl = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

const HEAD = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uHue;
out vec4 fragColor;
const float TAU = 6.28318530718;
const vec3 BG = vec3(0.035); // #090909
vec3 oklchToLinear(float L, float C, float h) {
  float a = C * cos(h), b = C * sin(h);
  vec3 lms = vec3(L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.2914855480 * b);
  lms = lms * lms * lms;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147,
              0.2309699292, -0.3413193965, 1.7076147010) * lms;
}
`;

// The original's base hue is uHue (turns of the OKLCH wheel); light mode is gone (the app is dark only).
const ribbons = (values) => `${HEAD}
${RIBBON_KEYS.map((k, i) => `const float ${k} = ${glsl(values[i])};`).join('\n')}
void main() {
  vec2 pos = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float t = iTime * FLOW_SPEED + PHASE;
  float breath = (-sin(iTime * BREATH_RATE * 1.5) + sin(iTime * BREATH_RATE + 1.0)) * 0.25 + 0.5;
  vec2 u = (pos - vec2(CENTRE_X, CENTRE_Y)) * (ZOOM - breath * BREATH_AMOUNT);
  u = mat2(cos(TILT), sin(TILT), -sin(TILT), cos(TILT)) * u;
  mat2 fold = mat2(cos(THETA), sin(THETA), -SHEAR, cos(THETA));
  float hue0 = uHue * TAU, hue1 = hue0 + HUE_SPREAD * TAU;
  vec3 color = vec3(0.0);
  for (float i = 1.0; i <= LAYERS; i += 1.0) {
    u.x += -sin(u.y * WARP_FREQ_X + t + i * 0.007) * WARP_AMP_X;
    u.y += -sin(u.x * WARP_FREQ_Y - t + i * 0.02) * WARP_AMP_Y;
    u = fold * u * SHRINK;
    vec2 q = u - vec2(OFFSET_X + breath * 0.1, OFFSET_Y);
    vec2 s = vec2(q.x * ASPECT_X, q.y * ASPECT_Y);
    float glow = GLOW_SIZE / (dot(s, s) + SOFTNESS);
    if (ECHO > 0.0) {
      vec2 e = vec2((q.x - ECHO_SHIFT) * ASPECT_X, s.y);
      glow += ECHO * GLOW_SIZE / (dot(e, e) + SOFTNESS);
    }
    glow *= 0.25 + breath * 0.4;
    float r = length(u);
    float k = sin(i * COLOUR_CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
    vec3 tint = clamp(oklchToLinear(LIGHTNESS + LIGHT_SWING * k, CHROMA * (0.75 + 0.35 * k), mix(hue0, hue1, k)), 0.0, 1.0);
    color += glow * tint * exp2(-r * FALLOFF);
  }
  vec3 x = max(color, 0.0);
  color = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  color = pow(clamp(color, 0.0, 1.0), vec3(0.85, 0.92, 0.98));
  color *= 1.0 - smoothstep(0.5, 1.6, length(pos)) * VIGNETTE;
  fragColor = vec4(BG + color * (1.0 - BG), 1.0);
}`;

// Reticolo: a grid floor and ceiling scrolling towards you, a glow on the horizon, and two nested cubes turning
// on the right, all as antialiased lines in the hue.
const WIRE = `${HEAD}
float grid(vec2 p) {
  vec2 w = fwidth(p);
  vec2 a = abs(fract(p - 0.5) - 0.5) / w;
  return (1.0 - min(min(a.x, a.y), 1.0)) * clamp(1.0 - max(w.x, w.y) * 2.5, 0.0, 1.0); // fades out before it moirés
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
mat3 turn(float y, float x) {
  return mat3(cos(y), 0.0, -sin(y), 0.0, 1.0, 0.0, sin(y), 0.0, cos(y)) * mat3(1.0, 0.0, 0.0, 0.0, cos(x), sin(x), 0.0, -sin(x), cos(x));
}
void main() {
  vec2 pos = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float px = 1.0 / iResolution.y;
  vec3 line = clamp(oklchToLinear(0.74, 0.16, uHue * TAU), 0.0, 1.0);
  vec3 hot = clamp(oklchToLinear(0.93, 0.07, uHue * TAU + 0.5), 0.0, 1.0);
  vec3 rd = normalize(vec3(pos + vec2(0.0, 0.08), 1.3));
  float z = iTime * 0.7;
  vec3 color = vec3(0.0);
  if (rd.y < 0.0) {
    float t = -1.0 / rd.y;
    color += line * grid(rd.xz * t + vec2(0.0, z)) * exp(-t * 0.08);
  } else {
    float t = 2.2 / rd.y;
    color += line * grid(rd.xz * t * 0.5 + vec2(0.0, z * 0.5)) * exp(-t * 0.08) * 0.35;
  }
  color += line * exp(-abs(rd.y) * 16.0) * 0.45;
  for (int c = 0; c < 2; c++) {
    float size = c == 0 ? 0.95 : 0.5;
    mat3 r = c == 0 ? turn(iTime * 0.21, iTime * 0.13) : turn(-iTime * 0.34, iTime * 0.27 + 1.0);
    vec2 p[8];
    for (int i = 0; i < 8; i++) {
      vec3 v = r * (vec3(i & 1, (i >> 1) & 1, (i >> 2) & 1) * 2.0 - 1.0) * size + vec3(1.35, 0.35 + sin(iTime * 0.4) * 0.08, 4.2);
      p[i] = v.xy * 1.3 / v.z - vec2(0.0, 0.08);
      color += hot * smoothstep(3.5 * px, 1.5 * px, length(pos - p[i]));
    }
    float d = 1e9;
    for (int i = 0; i < 8; i++) for (int b = 1; b < 8; b <<= 1) if ((i & b) == 0) d = min(d, segment(pos, p[i], p[i | b]));
    color += line * (smoothstep(1.6 * px, 0.0, d) * (c == 0 ? 1.0 : 0.7) + 0.18 * exp(-d / (10.0 * px)));
  }
  color *= 1.0 - smoothstep(0.6, 1.5, length(pos)) * 0.5;
  fragColor = vec4(BG + clamp(color, 0.0, 1.0) * (1.0 - BG), 1.0);
}`;

const POST_HEAD = `#version 300 es
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tGlyphs;
uniform vec2 iResolution;
uniform float iTime;
uniform float uPixelRatio;
out vec4 fragColor;
const vec3 BG = vec3(0.035), LUMA = vec3(0.2126, 0.7152, 0.0722);
vec3 sceneInk(vec2 uv) { return texture(tScene, clamp(uv, 0.0, 1.0)).rgb - BG; }
`;

const COPY = `${POST_HEAD}
void main() { fragColor = texture(tScene, gl_FragCoord.xy / iResolution); }`;

// Film grain over the field, strongest in the mid tones.
const grain = (strength, scale) => `${POST_HEAD}
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float blueNoise(vec2 p, float frame) {
  p += 5.588238 * mod(frame, 64.0);
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}
void main() {
  vec2 frag = gl_FragCoord.xy;
  float frame = floor(iTime * 24.0);
  vec3 ink = sceneInk(frag / iResolution);
  vec2 n = vec2(pcg3d(uvec3(ivec3(vec3(floor(frag / max(1.0, uPixelRatio * 1.6 * ${glsl(scale)})), frame)) + 0x4000)).xy) / 4294967295.0;
  float shade = clamp(dot(ink, LUMA), 0.0, 1.0);
  ink += (n.x + n.y - 1.0) * (0.035 + 0.4 * shade * (1.0 - shade)) * ${glsl(strength)};
  fragColor = vec4(clamp(BG + clamp(ink, 0.0, 1.0) + (blueNoise(frag, frame) - 0.5) / 255.0, 0.0, 1.0), 1.0);
}`;

// The field redrawn as characters: each cell picks a glyph from " .:;+*oO8@" by its brightness, over a dim copy.
const GLYPHS = ' .:;+*oO8@';
const ascii = (strength, scale) => `${POST_HEAD}
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 cellPx = vec2(0.62, 1.0) * floor(${glsl(scale)} * 9.0 * uPixelRatio + 0.5);
  vec2 cell = floor(frag / cellPx);
  vec2 centre = (cell + 0.5) * cellPx;
  vec3 ink = sceneInk(centre / iResolution) * 2.0;
  for (int i = 0; i < 4; i++) ink += sceneInk((centre + cellPx * 0.3 * vec2(i & 1, i >> 1) * 2.0 - cellPx * 0.3) / iResolution);
  ink /= 6.0;
  float level = pow(clamp(dot(ink, LUMA) * (0.9 + 0.3 * ${glsl(strength)}), 0.0, 1.0), 0.9);
  float glyph = floor(level * ${glsl(GLYPHS.length - 1)} + 0.5);
  vec2 local = (frag - cell * cellPx) / cellPx;
  float mask = texture(tGlyphs, vec2((glyph + local.x) / ${glsl(GLYPHS.length)}, local.y)).r;
  vec3 color = BG + clamp(sceneInk(frag / iResolution) * 0.45 + ink * mask, 0.0, 1.0);
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

// [id, name, what it looks like, {field, post, scale} or nothing for the CSS set]
export const SKINS = [
  ['vetrina', 'Vetrina', 'Un set fotografico in penombra, illuminato nel colore della console.'],
  ['aurora', 'Aurora', 'Nastri di luce animati con grana da pellicola, vetro scuro e bordi luminosi.', {
    scale: 0.5,
    post: grain(1.27146578, 0.936341226),
    field: ribbons([0.173284799, 2.49969006, 0.147870839, 0.523661256, 0.237975419, 2.10964155, 0.961824656,
      0.958980978, 73, 0.45263052, 2.18937063, 0.152746871, 0.0345977023, 2.06571603, 0.150717005, 0.4187828,
      -0.0345890932, -2.03120303, 1.01318514, -0.165953115, 0.577936888, 0.00127133052, 0.299173176, 0.113619268,
      -0.576728165, 0.510618329, 0.110889822, 32.0004845, 0, 0.201602459, 0.00125496904, 0.23696129]),
  }],
  ['terminale', 'Terminale', 'Nastri di luce ridisegnati in caratteri ASCII, come sul monitor di un vecchio terminale.', {
    scale: 0.5,
    post: ascii(1.14302206, 1.13131845),
    field: ribbons([0.170013532, 2.34424233, 0.167387888, 0.634169638, 0.216494083, 2.1081512, 0.961944044,
      0.947420716, 86, 0.47063756, 2.01897216, 0.126847312, 0.0301328581, 2.21240211, 0.189064503, 0.33331269,
      -0.00146706589, 0.927905023, 1.04531538, 0.277036995, 0.472277641, 0.00150938123, 0.403435469, 0.0326665044,
      -0.385195374, 0.563001812, 0.115506008, 52.8912048, 0, 0.131116971, 0.00133601099, 0.13128835]),
  }],
  ['prisma', 'Prisma', 'Nastri di luce puliti che attraversano mezzo spettro, partendo dal colore della console.', {
    scale: 0.5,
    post: COPY,
    field: ribbons([0.448563993, 1.44244063, 0.124797687, 0.551325202, 0.116842397, 2.14861465, 0.96356684,
      0.948475182, 90, 0.433883458, 2.62736416, 0.103259027, 0.0268527195, 2.47451091, 0.163004801, 0.317053109,
      0.00301217171, 1.76541543, 0.974467337, -0.408870578, 0.545496583, 0.00279000378, 0.381040752, 0.120578036,
      0.453666627, 0.566712976, 0.0972057357, 12.2860031, 0, 0.2045587, 0.00211051642, 0.236974075]),
  }],
  ['eco', 'Eco', "Nastri doppi, ognuno inseguito dalla sua eco, in caratteri ASCII.", {
    scale: 0.5,
    post: ascii(1.19741786, 1.04579866),
    field: ribbons([-0.221426502, 2.51460552, 0.140161276, 0.634724319, 0.234937131, 2.10890746, 0.957443833,
      0.948430538, 86, 0.57114774, 2.16713691, 0.126048639, 0.0297991205, 2.59919405, 0.145216659, 0.305680037,
      0.0270577446, 2.96834707, 0.932719171, -0.553668618, 0.428062022, 0.00237272587, 0.256181449, 0.0443925671,
      -0.593586683, 0.594452977, 0.0703076348, 35.7681389, 0.321494609, 0.173137471, 0.00224221614, 0.137560934]),
  }],
  ['reticolo', 'Reticolo', 'Un mondo in wireframe: griglie in prospettiva che scorrono, solidi che ruotano, scatole fatte di spigoli.', {
    scale: 1, // thin lines: full resolution (the shader is cheap)
    post: COPY,
    field: WIRE,
  }],
];
const KEY = 'retromate-skin';

function program(gl, vert, frag) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const at = {};
  return { p, at: (name) => (at[name] ??= gl.getUniformLocation(p, name)) };
}

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// The ASCII glyphs, white on black in one row of 48x80 cells, mipmapped for small cells.
function glyphAtlas(gl) {
  const c = Object.assign(document.createElement('canvas'), { width: 48 * GLYPHS.length, height: 80 });
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '500 62px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  [...GLYPHS].forEach((ch, i) => g.fillText(ch, i * 48 + 24, 43));
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// Runs until stop(). Rendering stops with the tab hidden (rAF does) and when nothing moved: under reduced motion
// the picture holds still and only follows a hue change.
function backdrop(canvas, { field: fieldSrc, post: postSrc, scale: fieldScale }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('WebGL2 non disponibile');
  const field = program(gl, VERT, fieldSrc), post = program(gl, VERT, postSrc);
  gl.activeTexture(gl.TEXTURE1);
  const glyphs = postSrc.includes('tGlyphs, vec2') ? glyphAtlas(gl) : null;
  gl.activeTexture(gl.TEXTURE0);
  const fbo = gl.createFramebuffer(), tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const goal = () => +document.documentElement.style.getPropertyValue('--hue') || 292; // set by app.js on focus
  let raf = 0, last = null, time = 0, hue = goal(), drawn = '', fw = 0, fh = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!still.matches) time += dt;
    const d = ((((goal() - hue) % 360) + 540) % 360) - 180; // the short way round the wheel
    hue = Math.abs(d) < 0.2 ? goal() : hue + d * (1 - Math.exp(-dt * 4));
    const scale = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (innerWidth * innerHeight)));
    const w = Math.max(1, Math.floor(innerWidth * scale)), h = Math.max(1, Math.floor(innerHeight * scale));
    const key = `${time} ${hue} ${w} ${h}`;
    if (key === drawn) return;
    drawn = key;
    if (canvas.width !== w || canvas.height !== h) Object.assign(canvas, { width: w, height: h });
    if (fw !== Math.ceil(w * fieldScale) || fh !== Math.ceil(h * fieldScale)) {
      [fw, fh] = [Math.ceil(w * fieldScale), Math.ceil(h * fieldScale)];
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, fw, fh);
    gl.useProgram(field.p);
    gl.uniform2f(field.at('iResolution'), fw, fh);
    gl.uniform1f(field.at('iTime'), time);
    gl.uniform1f(field.at('uHue'), hue / 360);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(post.p);
    gl.uniform2f(post.at('iResolution'), w, h);
    gl.uniform1f(post.at('iTime'), time);
    gl.uniform1f(post.at('uPixelRatio'), scale);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(post.at('tScene'), 0);
    gl.uniform1i(post.at('tGlyphs'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

// data-skin names the skin; data-shader is set only while its backdrop runs, and carries the dark-glass chrome
// (without WebGL2 the page keeps the Vetrina look whole).
let stop = null;
function apply(id) {
  const root = document.documentElement;
  root.dataset.skin = id;
  delete root.dataset.shader;
  stop?.();
  stop = null;
  document.querySelector('.backdrop canvas')?.remove();
  const shader = SKINS.find(([s]) => s === id)[3];
  const host = document.querySelector('.backdrop');
  if (!shader || !host) return;
  const canvas = host.appendChild(document.createElement('canvas'));
  try {
    stop = backdrop(canvas, shader);
    root.dataset.shader = '';
  } catch (e) {
    canvas.remove();
    console.warn('Skin:', e);
  }
}

export function getSkin() {
  let id;
  try { id = localStorage.getItem(KEY); } catch {}
  return SKINS.some(([s]) => s === id) ? id : SKINS[0][0];
}

export function setSkin(id) {
  try { localStorage.setItem(KEY, id); } catch {}
  apply(id);
}

apply(getSkin());
