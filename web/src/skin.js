// Skins, chosen in Opzioni and remembered per device like the fonts. "Aurora" replaces the set's gradients with a live
// WebGL2 backdrop: ribbons of light folded through 73 layers, then film grain (after @elsoghiar's grain shader,
// openshaders.com/@elsoghiar), tinted with the hue of whatever has focus.

export const SKINS = [
  ['vetrina', 'Vetrina', 'Un set fotografico in penombra, illuminato nel colore della console.'],
  ['aurora', 'Aurora', 'Nastri di luce animati con grana da pellicola, vetro scuro e bordi luminosi.'],
];
const KEY = 'retromate-skin';

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// The original's constants, its base hue turned into uHue (turns of the OKLCH wheel).
const FIELD = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uHue;
out vec4 fragColor;
const float HUE_SPREAD = 0.173284799, HUE_TRAVEL = 2.49969006, CHROMA = 0.147870839, LIGHTNESS = 0.523661256;
const float COLOUR_CYCLE = 0.237975419, THETA = 2.10964155, SHEAR = 0.961824656, SHRINK = 0.958980978;
const float WARP_FREQ_X = 0.45263052, WARP_FREQ_Y = 2.18937063, WARP_AMP_X = 0.152746871, WARP_AMP_Y = 0.0345977023;
const float ASPECT_X = 2.06571603, ASPECT_Y = 0.150717005, OFFSET_X = 0.4187828, OFFSET_Y = -0.0345890932;
const float TILT = -2.03120303, ZOOM = 1.01318514, CENTRE_X = -0.165953115, CENTRE_Y = 0.577936888;
const float GLOW_SIZE = 0.00127133052, FALLOFF = 0.299173176, VIGNETTE = 0.113619268, FLOW_SPEED = -0.576728165;
const float BREATH_RATE = 0.510618329, BREATH_AMOUNT = 0.110889822, PHASE = 32.0004845, SOFTNESS = 0.00125496904;
const float LIGHT_SWING = 0.23696129, TAU = 6.28318530718;
const vec3 BG = vec3(0.035);

vec3 oklchToLinear(float L, float C, float h) {
  float a = C * cos(h), b = C * sin(h);
  vec3 lms = vec3(L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.2914855480 * b);
  lms = lms * lms * lms;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147,
              0.2309699292, -0.3413193965, 1.7076147010) * lms;
}

void main() {
  vec2 pos = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float t = iTime * FLOW_SPEED + PHASE;
  float breath = (-sin(iTime * BREATH_RATE * 1.5) + sin(iTime * BREATH_RATE + 1.0)) * 0.25 + 0.5;
  vec2 u = (pos - vec2(CENTRE_X, CENTRE_Y)) * (ZOOM - breath * BREATH_AMOUNT);
  u = mat2(cos(TILT), sin(TILT), -sin(TILT), cos(TILT)) * u;
  mat2 fold = mat2(cos(THETA), sin(THETA), -SHEAR, cos(THETA));
  float hue0 = uHue * TAU, hue1 = hue0 + HUE_SPREAD * TAU;
  vec3 color = vec3(0.0);
  for (float i = 1.0; i <= 73.0; i += 1.0) {
    u.x += -sin(u.y * WARP_FREQ_X + t + i * 0.007) * WARP_AMP_X;
    u.y += -sin(u.x * WARP_FREQ_Y - t + i * 0.02) * WARP_AMP_Y;
    u = fold * u * SHRINK;
    vec2 q = u - vec2(OFFSET_X + breath * 0.1, OFFSET_Y);
    vec2 s = vec2(q.x * ASPECT_X, q.y * ASPECT_Y);
    float glow = GLOW_SIZE / (dot(s, s) + SOFTNESS) * (0.25 + breath * 0.4);
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

const GRAIN = `#version 300 es
precision highp float;
uniform sampler2D tScene;
uniform vec2 iResolution;
uniform float iTime;
uniform float uPixelRatio;
out vec4 fragColor;
const vec3 BG = vec3(0.035), LUMA = vec3(0.2126, 0.7152, 0.0722);

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
  vec3 ink = texture(tScene, frag / iResolution).rgb - BG;
  vec2 n = vec2(pcg3d(uvec3(ivec3(vec3(floor(frag / max(1.0, uPixelRatio * 1.49)), frame)) + 0x4000)).xy) / 4294967295.0;
  float shade = clamp(dot(ink, LUMA), 0.0, 1.0);
  ink += (n.x + n.y - 1.0) * (0.035 + 0.4 * shade * (1.0 - shade)) * 1.27;
  vec3 color = BG + clamp(ink, 0.0, 1.0) + (blueNoise(frag, frame) - 0.5) / 255.0;
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

function program(gl, frag) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const at = (name) => gl.getUniformLocation(p, name);
  return { p, at };
}

// Runs until stop(). The ribbons are soft, so they render at half resolution (73 layers per pixel is the cost) and
// only the grain runs at full. Rendering stops with the tab hidden (rAF does) and when nothing moved: under reduced
// motion the light holds still and only follows a hue change.
function aurora(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('WebGL2 non disponibile');
  const field = program(gl, FIELD), grain = program(gl, GRAIN);
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
    if (fw !== Math.ceil(w / 2) || fh !== Math.ceil(h / 2)) {
      [fw, fh] = [Math.ceil(w / 2), Math.ceil(h / 2)];
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
    gl.useProgram(grain.p);
    gl.uniform2f(grain.at('iResolution'), w, h);
    gl.uniform1f(grain.at('iTime'), time);
    gl.uniform1f(grain.at('uPixelRatio'), scale);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(grain.at('tScene'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

let stop = null;
function apply(id) {
  document.documentElement.dataset.skin = id;
  stop?.();
  stop = null;
  document.querySelector('.backdrop canvas')?.remove();
  const backdrop = document.querySelector('.backdrop');
  if (id !== 'aurora' || !backdrop) return;
  const canvas = backdrop.appendChild(document.createElement('canvas'));
  try {
    stop = aurora(canvas);
  } catch (e) {
    canvas.remove(); // no WebGL2: the set's gradients stay
    console.warn('Aurora:', e);
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
