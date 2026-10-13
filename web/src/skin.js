// Skins, chosen in Opzioni and remembered per device like the fonts. Every skin but Vetrina replaces the set's
// gradients with a live WebGL2 backdrop, drawn in two passes: a field (into a texture, at `scale` of the canvas) and a
// post pass onto the canvas. Fields are tinted with the hue of whatever has focus, except where a skin's palette is
// the point (Synthwave, Game Boy, Blueprint). Aurora, Terminale, Prisma and Eco are OpenShaders' folded light ribbons
// with their authors' constants: @elsoghiar, @dolza, @isuru and @voidy (openshaders.com). The rest are ours.
// `chrome` names the CSS that restyles the page while the backdrop runs (data-chrome on <html>, style.css).

// The ribbons' constants, in this order (FLOW_SPEED carries the original's FLOW_DIRECTION).
const RIBBON_KEYS = `HUE_SPREAD HUE_TRAVEL CHROMA LIGHTNESS COLOUR_CYCLE THETA SHEAR SHRINK LAYERS WARP_FREQ_X WARP_FREQ_Y
  WARP_AMP_X WARP_AMP_Y ASPECT_X ASPECT_Y OFFSET_X OFFSET_Y TILT ZOOM CENTRE_X CENTRE_Y GLOW_SIZE FALLOFF VIGNETTE
  FLOW_SPEED BREATH_RATE BREATH_AMOUNT PHASE ECHO ECHO_SHIFT SOFTNESS LIGHT_SWING`.split(/\s+/);

const glsl = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// Shared by fields and post passes: a hash and ordered (Bayer) dithering.
const LIB = `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
`;

const HEAD = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uHue;
uniform vec2 uFocus; // the focused element's centre, -1..1 (y up), eased
out vec4 fragColor;
const float TAU = 6.28318530718;
const vec3 BG = vec3(0.035); // #090909
${LIB}
vec3 oklchToLinear(float L, float C, float h) {
  float a = C * cos(h), b = C * sin(h);
  vec3 lms = vec3(L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.2914855480 * b);
  lms = lms * lms * lms;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147,
              0.2309699292, -0.3413193965, 1.7076147010) * lms;
}
// The focused hue, turned by \`turn\` (in turns), at OKLCH lightness L and chroma C.
vec3 hueRGB(float L, float C, float turn) { return clamp(oklchToLinear(L, C, (uHue + turn) * TAU), 0.0, 1.0); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
// Antialiased unit grid lines; they fade out before they moiré. Call it outside branches (it uses fwidth).
float grid(vec2 p) {
  vec2 w = fwidth(p);
  vec2 a = abs(fract(p - 0.5) - 0.5) / w;
  return (1.0 - min(min(a.x, a.y), 1.0)) * clamp(1.0 - max(w.x, w.y) * 2.5, 0.0, 1.0);
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
`;

// The original's base hue is uHue (turns of the OKLCH wheel); light mode is gone.
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
mat3 turn(float y, float x) {
  return mat3(cos(y), 0.0, -sin(y), 0.0, 1.0, 0.0, sin(y), 0.0, cos(y)) * mat3(1.0, 0.0, 0.0, 0.0, cos(x), sin(x), 0.0, -sin(x), cos(x));
}
void main() {
  vec2 pos = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float px = 1.0 / iResolution.y;
  vec3 line = hueRGB(0.74, 0.16, 0.0);
  vec3 hot = hueRGB(0.93, 0.07, 0.08);
  vec3 rd = normalize(vec3(pos + vec2(0.0, 0.08), 1.3));
  float z = iTime * 0.7;
  float tf = -1.0 / min(rd.y, -1e-3), tc = 2.2 / max(rd.y, 1e-3);
  float gf = grid(rd.xz * tf + vec2(0.0, z)), gc = grid(rd.xz * tc * 0.5 + vec2(0.0, z * 0.5));
  vec3 color = rd.y < 0.0 ? line * gf * exp(-tf * 0.08) : line * gc * exp(-tc * 0.08) * 0.35;
  color += line * exp(-abs(rd.y) * 16.0) * 0.45;
  for (int c = 0; c < 2; c++) {
    float size = c == 0 ? 0.95 : 0.5;
    mat3 r = c == 0 ? turn(iTime * 0.21, iTime * 0.13) : turn(-iTime * 0.34, iTime * 0.27 + 1.0);
    vec2 p[8];
    for (int i = 0; i < 8; i++) {
      vec3 v = r * (vec3(i & 1, (i >> 1) & 1, (i >> 2) & 1) * 2.0 - 1.0) * size + vec3(1.35, 0.35 + sin(iTime * 0.4) * 0.08, 4.2);
      p[i] = v.xy * 1.3 / v.z - vec2(0.0, 0.08);
      color += hot * (1.0 - smoothstep(1.5 * px, 3.5 * px, length(pos - p[i])));
    }
    float d = 1e9;
    for (int i = 0; i < 8; i++) for (int b = 1; b < 8; b <<= 1) if ((i & b) == 0) d = min(d, segment(pos, p[i], p[i | b]));
    color += line * ((1.0 - smoothstep(0.0, 1.6 * px, d)) * (c == 0 ? 1.0 : 0.7) + 0.18 * exp(-d / (10.0 * px)));
  }
  color *= 1.0 - smoothstep(0.6, 1.5, length(pos)) * 0.5;
  fragColor = vec4(BG + clamp(color, 0.0, 1.0) * (1.0 - BG), 1.0);
}`;

// CRT: what the tube shows (the set's own key light and a few drifting glows); the CRT post pass does the rest.
const CRT_FIELD = `${HEAD}
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 pos = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  vec3 col = mix(hueRGB(0.12, 0.03, 0.0), hueRGB(0.24, 0.06, 0.0), uv.y);
  vec2 k = (pos - vec2(0.0, 0.25)) * vec2(1.3, 2.2);
  col += hueRGB(0.6, 0.15, 0.0) * 0.5 * exp(-dot(k, k) * 2.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(iTime * 0.13 + fi * 2.1) * 0.7, cos(iTime * 0.11 + fi * 1.7) * 0.35);
    col += hueRGB(0.65, 0.16, fi * 0.09 - 0.09) * 0.22 * exp(-length(pos - c) * 3.5);
  }
  fragColor = vec4(col, 1.0);
}`;

// 8-bit: a pixel-art landscape at ~200 lines: a dithered banded sky, a sun, clouds and three hill layers in parallax.
const PIXEL_FIELD = `${HEAD}
void main() {
  float px = max(2.0, floor(iResolution.y / 200.0));
  vec2 cell = floor(gl_FragCoord.xy / px);
  vec2 p = cell / floor(iResolution.y / px);
  float asp = iResolution.x / iResolution.y;
  float band = floor((1.0 - clamp(p.y, 0.0, 1.0)) * 6.0 + bayer4(cell) * 0.999);
  vec3 col = hueRGB(0.2 + band * 0.045, 0.1, 0.0);
  if (length(p - vec2(asp * 0.8, 0.6)) < 0.06) col = hueRGB(0.93, 0.07, 0.15);
  for (int i = 0; i < 2; i++) {
    float fi = float(i), f = 1.4 - fi * 0.5;
    float x = fract((p.x + iTime * (0.01 + fi * 0.008)) * f + fi * 0.37);
    vec2 q = vec2((x - 0.5) / f, p.y - 0.68 - fi * 0.12);
    float d = min(min(length(q - vec2(-0.045, 0.0)), length(q - vec2(0.04, 0.005))), length(q - vec2(0.0, 0.03)));
    if (d < 0.04 && q.y > -0.02) col = mix(col, vec3(0.95, 0.96, 1.0), 0.85 - fi * 0.25);
  }
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = p.x + iTime * (0.015 + fi * 0.025);
    float h = 0.4 - fi * 0.11 + 0.05 * sin(x * (3.0 + fi * 2.0) + fi * 1.3) + 0.025 * sin(x * (7.0 + fi * 3.0) + fi);
    if (p.y < h) col = hueRGB(0.4 - fi * 0.09, 0.1 + fi * 0.02, 0.33 + fi * 0.04);
  }
  fragColor = vec4(col, 1.0);
}`;

// Game Boy: a light screen with scrolling tiles (rings and dots) and a wandering shadow, in grey; the DMG post pass
// turns it into four greens.
const GAMEBOY_FIELD = `${HEAD}
void main() {
  vec2 p = gl_FragCoord.xy / iResolution.y;
  float asp = iResolution.x / iResolution.y;
  vec2 b = p - vec2(asp * (0.65 + 0.12 * sin(iTime * 0.17)), 0.5 + 0.15 * cos(iTime * 0.13));
  float l = 0.8 - 0.3 * exp(-dot(b, b) * 6.0);
  vec2 q = p * 7.0 + vec2(iTime * 0.25, -iTime * 0.15);
  vec2 f = fract(q) - 0.5;
  float d = max(abs(f.x), abs(f.y));
  float pattern = mod(floor(q.x) + floor(q.y), 2.0) < 1.0 ? step(0.3, d) * step(d, 0.38) : step(length(f), 0.12);
  l -= pattern * 0.45 * smoothstep(0.1, 0.9, p.x / asp);
  fragColor = vec4(vec3(l), 1.0);
}`;

// Onde: a dashboard of the 2000s: translucent waves with bright crests over the console's colour, and sparkles.
const ONDE_FIELD = `${HEAD}
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 p = vec2(uv.x * iResolution.x / iResolution.y, uv.y);
  float t = iTime * 0.35;
  vec3 col = mix(hueRGB(0.18, 0.06, 0.0), hueRGB(0.42, 0.11, 0.02), uv.y);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = 0.4 + 0.05 * fi + 0.07 * sin(p.x * (1.1 + fi * 0.23) + t * (1.0 + fi * 0.3) + fi * 1.7)
      + 0.03 * sin(p.x * (2.7 - fi * 0.3) - t * (0.7 + fi * 0.2) + fi);
    float d = uv.y - y;
    col += vec3(1.0) * 0.06 * step(d, 0.0) * smoothstep(-0.35, 0.0, d);
    col += vec3(1.0) * 0.45 * exp(-abs(d) * iResolution.y * 0.35);
    col += hueRGB(0.9, 0.05, 0.0) * 0.1 * exp(-abs(d) * 40.0);
  }
  vec2 g = p * 26.0;
  float h = hash(floor(g));
  float tw = pow(0.5 + 0.5 * sin(iTime * (1.0 + h * 2.0) + h * 40.0), 8.0);
  col += vec3(0.8) * step(0.93, h) * tw * (1.0 - smoothstep(0.0, 0.08, length(fract(g) - 0.5)));
  fragColor = vec4(col, 1.0);
}`;

// Olografico: dark, with a rainbow sheen sweeping across and bokeh particles rising in every colour.
const HOLO_FIELD = `${HEAD}
void main() {
  vec2 pos = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  vec3 col = hueRGB(0.12, 0.03, 0.0);
  float s = pos.x * 0.8 + pos.y * 0.5 - iTime * 0.05;
  col += hueRGB(0.5, 0.12, s) * 0.12 * (0.6 + 0.4 * sin(pos.y * 3.0 + iTime * 0.3));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 g = pos * (5.0 + fi * 4.0) + vec2(fi * 7.3, -iTime * (0.15 + fi * 0.1));
    vec2 id = floor(g);
    float h = hash(id + fi * 13.0);
    vec2 o = vec2(hash(id + 1.7), hash(id + 3.1)) - 0.5;
    float r = 0.06 + 0.12 * h;
    float a = step(0.55, h) * (1.0 - smoothstep(r * 0.6, r, length(fract(g) - 0.5 - o * 0.6))) * (0.5 + 0.5 * sin(iTime + h * 30.0));
    col += hueRGB(0.75, 0.13, h + fi * 0.2) * a * (0.35 - fi * 0.08);
  }
  fragColor = vec4(col, 1.0);
}`;

// Synthwave: its own palette. A striped sun over neon-edged mountains, stars, and a magenta grid racing to the horizon.
const SYNTH_FIELD = `${HEAD}
float tri(float x) { return abs(fract(x) - 0.5) * 2.0; }
void main() {
  vec2 pos = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float px = 1.0 / iResolution.y;
  float hz = -0.08;
  float depth = 0.3 / max(hz - pos.y, 0.002);
  float g = grid(vec2(pos.x * depth * 1.5, depth + iTime * 0.9));
  vec3 col;
  if (pos.y < hz) {
    col = vec3(0.07, 0.0, 0.12) + vec3(1.0, 0.18, 0.75) * g * exp(-depth * 0.04);
    col += vec3(1.0, 0.3, 0.6) * 0.4 * exp(-(hz - pos.y) * 30.0);
  } else {
    float k = (pos.y - hz) / (0.5 - hz);
    col = mix(vec3(1.0, 0.42, 0.28), vec3(0.42, 0.05, 0.42), smoothstep(0.0, 0.4, k));
    col = mix(col, vec3(0.03, 0.01, 0.09), smoothstep(0.3, 1.0, k));
    vec2 sid = floor(gl_FragCoord.xy / 3.0);
    col += vec3(0.9) * step(0.996, hash(sid)) * smoothstep(0.3, 0.8, k) * (0.6 + 0.4 * sin(iTime * 2.0 + hash(sid + 1.0) * 40.0));
    vec2 sc = vec2(0.42, hz + 0.16);
    float r = 0.21, d = length(pos - sc), sy = (pos.y - sc.y) / r;
    float cut = sy < 0.2 ? step(fract(sy * 7.0 + iTime * 0.3), (0.2 - sy) * 0.45) : 0.0;
    vec3 sun = mix(vec3(1.0, 0.2, 0.55), vec3(1.0, 0.86, 0.3), smoothstep(-0.7, 0.8, sy));
    col = mix(col, sun, (1.0 - smoothstep(r - 2.0 * px, r, d)) * (1.0 - cut));
    col += vec3(1.0, 0.3, 0.55) * 0.3 * step(r, d) * exp(-(d - r) * 10.0);
    float m = hz + (0.03 + 0.11 * tri(pos.x * 1.6 + 0.3) + 0.04 * tri(pos.x * 4.3 + 0.7)) * smoothstep(0.1, 0.55, abs(pos.x - 0.42));
    if (pos.y < m) col = vec3(0.06, 0.0, 0.1) + vec3(0.2, 0.85, 1.0) * (1.0 - smoothstep(0.0, 2.0 * px, m - pos.y));
  }
  fragColor = vec4(col, 1.0);
}`;

// Blueprint: its own blue. Drafting paper with a fine and a major grid drifting slowly, and a construction drawing
// on the right (circles, a dashed one, ticks, a crosshair and a dimension line) turning very slowly.
const BLUEPRINT_FIELD = `${HEAD}
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 pos = (frag - 0.5 * iResolution) / iResolution.y;
  float aa = 1.4 / iResolution.y;
  vec3 col = mix(vec3(0.06, 0.24, 0.55), vec3(0.03, 0.14, 0.38), clamp(length(pos) * 0.9, 0.0, 1.0));
  col += (fbm(frag * 0.015) - 0.5) * 0.05 + (hash(frag) - 0.5) * 0.015;
  vec2 g = pos * 36.0 + vec2(iTime * 0.12, 0.0);
  col += vec3(0.75, 0.88, 1.0) * max(grid(g) * 0.1, grid(g / 5.0) * 0.28);
  vec2 c = pos - vec2(0.5, 0.0);
  float w = iTime * 0.075;
  vec2 rc = mat2(cos(w), sin(w), -sin(w), cos(w)) * c;
  float r = length(c), a = atan(rc.y, rc.x) / TAU;
  float ink = 1.0 - smoothstep(0.0, aa, abs(r - 0.33));
  ink = max(ink, (1.0 - smoothstep(0.0, aa, abs(r - 0.24))) * step(0.5, fract(a * 60.0)));
  ink = max(ink, 1.0 - smoothstep(0.0, aa, abs(r - 0.1)));
  ink = max(ink, step(abs(fract(a * 36.0) - 0.5), 0.06) * step(0.33, r) * step(r, 0.36));
  ink = max(ink, (1.0 - smoothstep(0.0, aa, min(abs(rc.x), abs(rc.y)))) * step(r, 0.42));
  ink = max(ink, (1.0 - smoothstep(0.0, aa, abs(pos.y + 0.4))) * step(abs(pos.x - 0.5), 0.33));
  ink = max(ink, (1.0 - smoothstep(0.0, aa, abs(abs(pos.x - 0.5) - 0.33))) * step(abs(pos.y + 0.4), 0.025));
  col = mix(col, vec3(0.93, 0.97, 1.0), ink * 0.65);
  fragColor = vec4(col, 1.0);
}`;

// Neon: an arcade at night. Smoke lit by two coloured lights, a neon ring that flickers now and then, and a bar.
const NEON_FIELD = `${HEAD}
void main() {
  vec2 pos = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float px = 1.0 / iResolution.y;
  float t = iTime;
  vec3 a = hueRGB(0.72, 0.2, 0.0), b = hueRGB(0.72, 0.2, 0.42);
  float smoke = fbm(pos * 2.2 + vec2(t * 0.05, -t * 0.03) + fbm(pos * 1.4 - t * 0.02));
  vec3 col = vec3(0.015, 0.012, 0.025);
  col += (a * exp(-length(pos - vec2(-0.9, 0.6)) * 1.5) + b * exp(-length(pos - vec2(0.9, 0.55)) * 1.5)) * (0.15 + 0.7 * smoke * smoke);
  float on = hash(vec2(floor(t * 9.0), 3.0)) > 0.06 ? 1.0 : 0.25;
  float ring = abs(length(pos - vec2(0.55, 0.1)) - 0.2);
  vec2 q = pos - vec2(0.55, -0.24);
  float bar = length(vec2(max(abs(q.x) - 0.28, 0.0), q.y));
  col += a * on * (0.0024 / (ring + 0.003) + (1.0 - smoothstep(0.0, 2.5 * px, ring)) * 0.8);
  col += b * (0.0024 / (bar + 0.003) + (1.0 - smoothstep(0.0, 2.5 * px, bar)) * 0.8);
  col += vec3(0.5) * ((1.0 - smoothstep(0.0, 1.2 * px, ring)) * on + (1.0 - smoothstep(0.0, 1.2 * px, bar)));
  fragColor = vec4(1.0 - exp(-col * 1.3), 1.0);
}`;

// Manuale: a 90s instruction booklet. Paper with fibres and aged edges; soft shapes printed as two halftone screens
// (the hue and a second ink) slightly out of register, drifting.
const PAPER_FIELD = `${HEAD}
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 pos = (frag - 0.5 * iResolution) / iResolution.y;
  vec3 col = vec3(0.955, 0.93, 0.865) * (0.97 + 0.05 * fbm(pos * vec2(70.0, 10.0)));
  col *= 1.0 - 0.15 * smoothstep(0.45, 1.3, length(pos));
  float t = iTime * 0.05, shape = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    shape += exp(-length(pos - vec2(0.45 + 0.3 * sin(t + fi * 2.1), 0.28 * cos(t * 1.3 + fi * 1.4))) * 3.2);
  }
  shape = clamp(shape * smoothstep(-0.3, 0.5, pos.x), 0.0, 1.0);
  float pitch = max(5.0, iResolution.y / 110.0);
  vec2 c1 = mat2(0.966, 0.259, -0.259, 0.966) * frag / pitch;
  vec2 c2 = mat2(0.707, 0.707, -0.707, 0.707) * (frag + pitch * 0.35) / pitch;
  float r = sqrt(shape) * 0.48;
  float i1 = (1.0 - smoothstep(r - 0.05, r + 0.05, length(fract(c1) - 0.5))) * smoothstep(0.0, 0.05, r);
  float i2 = (1.0 - smoothstep(r * 0.8 - 0.05, r * 0.8 + 0.05, length(fract(c2) - 0.5))) * smoothstep(0.0, 0.05, r);
  col *= mix(vec3(1.0), hueRGB(0.62, 0.14, 0.0), i1 * 0.75);
  col *= mix(vec3(1.0), hueRGB(0.78, 0.13, 0.45), i2 * 0.5);
  fragColor = vec4(col, 1.0);
}`;

// Notte stellata: three layers of twinkling stars and a faint milky way in the hue, shifting a little towards
// whatever has focus (nearer layers more).
const NIGHT_FIELD = `${HEAD}
void main() {
  vec2 pos = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float px = 1.0 / iResolution.y;
  vec3 col = mix(vec3(0.008, 0.01, 0.028), hueRGB(0.2, 0.07, 0.0), (1.0 - smoothstep(-0.6, 0.1, pos.y)) * 0.7);
  vec2 r = mat2(0.8, 0.6, -0.6, 0.8) * (pos + uFocus * 0.01);
  float band = exp(-r.y * r.y * 14.0);
  float neb = fbm(r * 3.0 + vec2(iTime * 0.008, 0.0));
  col += hueRGB(0.6, 0.12, 0.06) * band * neb * neb * 0.45 + vec3(0.55, 0.6, 0.75) * band * 0.035;
  for (int i = 0; i < 3; i++) {
    float fi = float(i), density = 30.0 + fi * 30.0;
    vec2 p = (pos + uFocus * 0.025 * (3.0 - fi) + vec2(iTime * 0.003 * (3.0 - fi), 0.0)) * density;
    vec2 id = floor(p);
    float h = hash(id + fi * 31.7);
    vec2 o = (vec2(hash(id + 7.1), hash(id + 3.3)) - 0.5) * 0.7;
    float d = length(fract(p) - 0.5 - o) / density;
    float size = (0.7 + 1.5 * hash(id + 1.9)) * px * (1.5 - fi * 0.35);
    float tw = 0.55 + 0.45 * sin(iTime * (0.7 + 2.0 * h) + h * 50.0);
    float s = step(0.88 - 0.12 * band, h) * tw * ((1.0 - smoothstep(0.0, size, d)) + 0.3 * exp(-d / (size * 3.0)));
    col += mix(vec3(1.0), hueRGB(0.85, 0.08, h), 0.35) * s;
  }
  fragColor = vec4(col, 1.0);
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
${LIB}
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

// A tube TV: curved glass (black past its rounded edges), colour fringes, scanlines, an RGB aperture mask, a slow
// roll bar, flicker, static and a vignette.
const CRT = `${POST_HEAD}
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 c = frag / iResolution * 2.0 - 1.0;
  c += c * (c.yx * c.yx) * vec2(0.03, 0.045);
  vec2 uv = c * 0.5 + 0.5;
  vec2 e = smoothstep(vec2(0.0), vec2(0.006), uv) * smoothstep(vec2(0.0), vec2(0.006), 1.0 - uv);
  float off = 0.0015;
  vec3 col = vec3(texture(tScene, uv + vec2(off, 0.0)).r, texture(tScene, uv).g, texture(tScene, uv - vec2(off, 0.0)).b);
  float s = sin(frag.y / max(1.0, uPixelRatio * 1.5) * 3.14159265);
  col *= 0.7 + 0.3 * s * s;
  float m = mod(floor(frag.x / max(1.0, uPixelRatio)), 3.0);
  col *= vec3(m == 0.0, m == 1.0, m == 2.0) * 0.3 + 0.8;
  float roll = fract(uv.y - iTime * 0.06) - 0.5;
  col *= 1.25 + 0.08 * exp(-roll * roll * 60.0) + 0.012 * sin(iTime * 110.0);
  col += (hash(frag + fract(iTime * 7.0) * 311.0) - 0.5) * 0.035;
  col *= 1.0 - 0.18 * dot(c, c);
  fragColor = vec4(clamp(col, 0.0, 1.0) * e.x * e.y, 1.0);
}`;

// The original Game Boy's screen: ~180 big pixels high, four greens with ordered dithering, faint gaps between dots.
const DMG = `${POST_HEAD}
void main() {
  float px = max(1.0, floor(iResolution.y / 180.0));
  vec2 cell = floor(gl_FragCoord.xy / px);
  float l = dot(texture(tScene, (cell + 0.5) * px / iResolution).rgb, LUMA);
  int level = int(clamp(floor(l * 3.0 + bayer4(cell)), 0.0, 3.0));
  vec3 pal[4] = vec3[4](vec3(0.059, 0.22, 0.059), vec3(0.188, 0.384, 0.188), vec3(0.545, 0.675, 0.059), vec3(0.608, 0.737, 0.059));
  vec3 col = pal[level];
  vec2 f = fract(gl_FragCoord.xy / px);
  if (px >= 3.0 && (f.x < 1.0 / px || f.y < 1.0 / px)) col *= 0.94;
  fragColor = vec4(col, 1.0);
}`;

// [id, name, what it looks like, {field, post, scale, chrome} or nothing for the CSS set]
export const SKINS = [
  ['vetrina', 'Vetrina', 'Un set fotografico in penombra, illuminato nel colore della console.'],
  ['aurora', 'Aurora', 'Nastri di luce animati con grana da pellicola, vetro scuro e bordi luminosi.', {
    scale: 0.5,
    chrome: 'glass',
    post: grain(1.27146578, 0.936341226),
    field: ribbons([0.173284799, 2.49969006, 0.147870839, 0.523661256, 0.237975419, 2.10964155, 0.961824656,
      0.958980978, 73, 0.45263052, 2.18937063, 0.152746871, 0.0345977023, 2.06571603, 0.150717005, 0.4187828,
      -0.0345890932, -2.03120303, 1.01318514, -0.165953115, 0.577936888, 0.00127133052, 0.299173176, 0.113619268,
      -0.576728165, 0.510618329, 0.110889822, 32.0004845, 0, 0.201602459, 0.00125496904, 0.23696129]),
  }],
  ['terminale', 'Terminale', 'Nastri di luce ridisegnati in caratteri ASCII, come sul monitor di un vecchio terminale.', {
    scale: 0.5,
    chrome: 'glass',
    post: ascii(1.14302206, 1.13131845),
    field: ribbons([0.170013532, 2.34424233, 0.167387888, 0.634169638, 0.216494083, 2.1081512, 0.961944044,
      0.947420716, 86, 0.47063756, 2.01897216, 0.126847312, 0.0301328581, 2.21240211, 0.189064503, 0.33331269,
      -0.00146706589, 0.927905023, 1.04531538, 0.277036995, 0.472277641, 0.00150938123, 0.403435469, 0.0326665044,
      -0.385195374, 0.563001812, 0.115506008, 52.8912048, 0, 0.131116971, 0.00133601099, 0.13128835]),
  }],
  ['prisma', 'Prisma', 'Nastri di luce puliti che attraversano mezzo spettro, partendo dal colore della console.', {
    scale: 0.5,
    chrome: 'glass',
    post: COPY,
    field: ribbons([0.448563993, 1.44244063, 0.124797687, 0.551325202, 0.116842397, 2.14861465, 0.96356684,
      0.948475182, 90, 0.433883458, 2.62736416, 0.103259027, 0.0268527195, 2.47451091, 0.163004801, 0.317053109,
      0.00301217171, 1.76541543, 0.974467337, -0.408870578, 0.545496583, 0.00279000378, 0.381040752, 0.120578036,
      0.453666627, 0.566712976, 0.0972057357, 12.2860031, 0, 0.2045587, 0.00211051642, 0.236974075]),
  }],
  ['eco', 'Eco', 'Nastri doppi, ognuno inseguito dalla sua eco, in caratteri ASCII.', {
    scale: 0.5,
    chrome: 'glass',
    post: ascii(1.19741786, 1.04579866),
    field: ribbons([-0.221426502, 2.51460552, 0.140161276, 0.634724319, 0.234937131, 2.10890746, 0.957443833,
      0.948430538, 86, 0.57114774, 2.16713691, 0.126048639, 0.0297991205, 2.59919405, 0.145216659, 0.305680037,
      0.0270577446, 2.96834707, 0.932719171, -0.553668618, 0.428062022, 0.00237272587, 0.256181449, 0.0443925671,
      -0.593586683, 0.594452977, 0.0703076348, 35.7681389, 0.321494609, 0.173137471, 0.00224221614, 0.137560934]),
  }],
  ['reticolo', 'Reticolo', 'Un mondo in wireframe: griglie in prospettiva che scorrono, solidi che ruotano, scatole fatte di spigoli.', {
    scale: 1, // thin lines: full resolution (the shader is cheap)
    chrome: 'glass reticolo',
    post: COPY,
    field: WIRE,
  }],
  ['crt', 'CRT', 'Un vecchio televisore a tubo: linee di scansione, maschera RGB, vetro bombato, un leggero sfarfallio.', {
    scale: 0.5, chrome: 'glass crt', post: CRT, field: CRT_FIELD,
  }],
  ['pixel', '8-bit', 'Un paesaggio in pixel art che scorre in parallasse, bordi a scaletta e un cursore che lampeggia.', {
    scale: 1, chrome: 'pixel', post: COPY, field: PIXEL_FIELD,
  }],
  ['gameboy', 'Game Boy', 'Quattro toni di verde e retinatura, come sullo schermo del primo Game Boy. Copertine comprese.', {
    scale: 0.5, chrome: 'light gameboy', post: DMG, field: GAMEBOY_FIELD,
  }],
  ['onde', 'Onde', 'Onde di luce sul colore della console, come nelle dashboard degli anni 2000: card lucide e riflessi.', {
    scale: 0.5, chrome: 'glass onde', post: COPY, field: ONDE_FIELD,
  }],
  ['olografico', 'Olografico', 'Riflessi iridescenti su card e copertine, come le carte foil, e particelle di luce sullo sfondo.', {
    scale: 0.5, chrome: 'glass holo', post: COPY, field: HOLO_FIELD,
  }],
  ['synthwave', 'Synthwave', "Sole a strisce, montagne al neon e una griglia che corre verso l'orizzonte. Titoli cromati.", {
    scale: 1, chrome: 'glass synth', post: COPY, field: SYNTH_FIELD,
  }],
  ['blueprint', 'Blueprint', 'Carta da progetto: griglia, linee tratteggiate e scatole disegnate con le loro misure reali.', {
    scale: 1, chrome: 'blueprint', post: COPY, field: BLUEPRINT_FIELD,
  }],
  ['neon', 'Neon', 'Una sala giochi al buio: fumo, tubi al neon che tremolano, scritte che si accendono.', {
    scale: 0.5, chrome: 'glass neon', post: COPY, field: NEON_FIELD,
  }],
  ['manuale', 'Manuale', "Il libretto di istruzioni: carta, inchiostro e retino di stampa fuori registro. L'unica chiara.", {
    scale: 1, chrome: 'light manuale', post: COPY, field: PAPER_FIELD,
  }],
  ['notte', 'Notte stellata', 'Un cielo stellato che si sposta piano verso ciò che selezioni. La più leggera.', {
    scale: 1, chrome: 'glass', post: COPY, field: NIGHT_FIELD,
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

// Where focus is, for the starry sky's parallax: -1..1 across the viewport, y up.
let focusGoal = [0, 0];
document.addEventListener('focusin', (e) => {
  const r = e.target.getBoundingClientRect?.();
  if (r) focusGoal = [((r.left + r.width / 2) / innerWidth) * 2 - 1, 1 - ((r.top + r.height / 2) / innerHeight) * 2];
});

// Runs until stop(). Rendering stops with the tab hidden (rAF does) and when nothing moved: under reduced motion
// the picture holds still and only follows a hue or focus change.
function backdrop(canvas, { field: fieldSrc, post: postSrc, scale: fieldScale }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('WebGL2 non disponibile');
  const field = program(gl, VERT, fieldSrc), post = program(gl, VERT, postSrc);
  gl.activeTexture(gl.TEXTURE1);
  if (postSrc.includes('tGlyphs, vec2')) glyphAtlas(gl);
  gl.activeTexture(gl.TEXTURE0);
  const fbo = gl.createFramebuffer(), tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const goal = () => +document.documentElement.style.getPropertyValue('--hue') || 292; // set by app.js on focus
  let raf = 0, last = null, time = 0, hue = goal(), focus = [...focusGoal], drawn = '', fw = 0, fh = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!still.matches) time += dt;
    const ease = 1 - Math.exp(-dt * 4);
    const d = ((((goal() - hue) % 360) + 540) % 360) - 180; // the short way round the wheel
    hue = Math.abs(d) < 0.2 ? goal() : hue + d * ease;
    focus = focus.map((f, i) => (Math.abs(focusGoal[i] - f) < 0.001 ? focusGoal[i] : f + (focusGoal[i] - f) * ease));
    const scale = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (innerWidth * innerHeight)));
    const w = Math.max(1, Math.floor(innerWidth * scale)), h = Math.max(1, Math.floor(innerHeight * scale));
    const key = `${time} ${hue} ${focus} ${w} ${h}`;
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
    gl.uniform2f(field.at('uFocus'), focus[0], focus[1]);
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

// Duotone filters for covers: Game Boy's four greens, Blueprint's white on blue (style.css applies them).
document.body.insertAdjacentHTML('beforeend', `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <filter id="skin-dmg" color-interpolation-filters="sRGB">
      <feColorMatrix values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/>
      <feComponentTransfer>
        <feFuncR type="discrete" tableValues="0.059 0.188 0.545 0.608"/>
        <feFuncG type="discrete" tableValues="0.22 0.384 0.675 0.737"/>
        <feFuncB type="discrete" tableValues="0.059 0.188 0.059 0.059"/>
      </feComponentTransfer>
    </filter>
    <filter id="skin-blueprint" color-interpolation-filters="sRGB">
      <feColorMatrix values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/>
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0.04 0.95"/>
        <feFuncG type="table" tableValues="0.16 0.97"/>
        <feFuncB type="table" tableValues="0.4 1"/>
      </feComponentTransfer>
    </filter>
  </svg>`);

// data-skin names the skin; data-chrome is set only while its backdrop runs (without WebGL2 the page keeps the
// Vetrina look whole).
let stop = null;
function apply(id) {
  const root = document.documentElement;
  root.dataset.skin = id;
  delete root.dataset.chrome;
  stop?.();
  stop = null;
  document.querySelector('.backdrop canvas')?.remove();
  const shader = SKINS.find(([s]) => s === id)[3];
  const host = document.querySelector('.backdrop');
  if (!shader || !host) return;
  const canvas = host.appendChild(document.createElement('canvas'));
  try {
    stop = backdrop(canvas, shader);
    root.dataset.chrome = shader.chrome;
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
