// The game box, shared by the library (app.js) and the in-game menu (ingame.js): a true 3D box at the console's
// real packaging size, lit and coloured per console. Also the little formatters both screens show next to it.

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Real packaging, in mm (w, h, d): GBA/GB square cardboard, NES/SNES tall cardboard, Mega Drive and PS2 plastic cases.
// A box starts at its console's proportions (also the fallback without art), then takes its cover's once it loads:
// box art comes from any region, and a US SNES box is landscape where a PAL one is portrait.
export const CASES = {
  gba: { mm: [125, 125, 23], kind: 'card', hue: 292, short: 'GBA' },
  gbc: { mm: [125, 125, 23], kind: 'card', hue: 92, short: 'GBC' },
  gb: { mm: [125, 125, 23], kind: 'card', hue: 138, short: 'GB' },
  nes: { mm: [127, 178, 38], kind: 'card', hue: 28, short: 'NES' },
  snes: { mm: [160, 195, 29], kind: 'card', hue: 352, short: 'SNES' },
  genesis: { mm: [152, 195, 25], kind: 'case', hue: 222, short: 'MD' },
  psx: { mm: [142, 125, 10], kind: 'case', hue: 200, short: 'PS1' }, // CD jewel case
  nds: { mm: [125, 137, 14], kind: 'case', hue: 172, short: 'DS' },
  psp: { mm: [105, 175, 14], kind: 'case', hue: 236, short: 'PSP' }, // UMD case
  ps2: { mm: [135, 190, 15], kind: 'case', hue: 258, short: 'PS2' },
  ngc: { mm: [135, 190, 14], kind: 'case', hue: 268, short: 'GC' }, // DVD keep case
  wii: { mm: [135, 190, 14], kind: 'case', white: true, hue: 60, short: 'Wii' }, // white DVD keep case
  ps3: { mm: [135, 170, 12], kind: 'case', hue: 214, short: 'PS3' }, // Blu-ray keep case
};
export const caseOf = (slug) => CASES[slug] ?? CASES.gba;
const ratios = new Map(); // cover URL -> width/height, so a redrawn box (turntable, next visit) starts right
const shape = (g) => {
  const [w, h, d] = caseOf(g.platform).mm;
  return `--ar:${ratios.get(g.cover) ?? (w / h).toFixed(3)};--d:${(d / h).toFixed(3)}`;
};
// load doesn't bubble: catch it on the way down, for every box's cover.
document.addEventListener('load', (e) => {
  const img = e.target;
  const b = img.closest?.('.box3d');
  if (!b || !img.naturalWidth) return;
  const ar = (img.naturalWidth / img.naturalHeight).toFixed(3);
  ratios.set(img.getAttribute('src'), ar);
  b.style.setProperty('--ar', ar);
}, true);

// Cardboard spines get a color near the console's hue, varied per title like a real shelf. Plastic cases are black.
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
function spineColor(g) {
  const c = caseOf(g.platform);
  if (c.kind === 'case') return c.white ? ['#ececf1', '#17171d'] : ['#17171d', '#f4f4f8'];
  const h = Math.abs(hash(g.title));
  const L = [0.52, 0.6, 0.7][h % 3];
  return [`oklch(${L} 0.15 ${c.hue + (h % 31) - 15})`, L >= 0.7 ? '#140f24' : '#fff'];
}

export const cover = (g, lazy = true, band = false) => `
  <span class="cover"><span class="cover-fallback">${band ? `<span class="cover-band">${esc(g.platform_name)}</span>` : ''}<span>${esc(g.title)}</span></span><img src="${esc(g.cover)}" alt=""${lazy ? ' loading="lazy"' : ''} onerror="this.remove()"></span>`;

// lite: only the faces a slightly turned box can show, for grids of many boxes.
export const box = (g, { lazy = true, lite = false } = {}) => {
  const [spine, ink] = spineColor(g);
  return `
  <span class="box3d" data-mm="${caseOf(g.platform).mm.join('×')}" data-kind="${caseOf(g.platform).kind}"${caseOf(g.platform).white ? ' data-white' : ''} style="${shape(g)};--bh:${caseOf(g.platform).hue};--spine:${spine};--spine-ink:${ink}" aria-hidden="true">
    <span class="f front">${cover(g, lazy, true)}</span>
    <span class="f spine"><span>${esc(g.title)}</span></span>
    <span class="f top"></span>
    ${lite ? '' : '<span class="f back"></span><span class="f side"></span><span class="f bottom"></span>'}
  </span>`;
};

// The in-game menu's layout, chosen in Opzioni (per device) and read by the play page: [id, name, what it looks like].
export const MENU_STYLES = [
  ['bar', 'Barra comandi', 'I comandi in una barra in alto, la scheda del gioco e i giocatori ai lati.'],
  ['vetrina', 'Vetrina', 'La scatola al centro sotto un faretto, i comandi su due mensole ai lati.'],
];
const MENU_KEY = 'retromate-ingame-menu';
export function getMenuStyle() {
  let v;
  try { v = localStorage.getItem(MENU_KEY); } catch {}
  return MENU_STYLES.some(([id]) => id === v) ? v : 'bar';
}
export function setMenuStyle(id) {
  try { localStorage.setItem(MENU_KEY, id); } catch {}
}

export const playtimeText = (s = 0) => {
  const m = Math.floor(s / 60);
  if (!m) return s ? 'Meno di un minuto' : 'Mai giocato';
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
export const stamp = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
