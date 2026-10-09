// Dev-only data fixtures for stress-testing the UI (break-ui). Loaded by app.js only when import.meta.env.DEV
// and the URL has ?data=worst|one|empty|huge. Never ships: Vite drops the import from production builds.
const NAMES = { gba: 'Game Boy Advance', gbc: 'Game Boy Color', gb: 'Game Boy', nes: 'NES', snes: 'Super Nintendo', genesis: 'Mega Drive', ps2: 'PlayStation 2' };
const thumbs = { gba: 'Nintendo - Game Boy Advance', ps2: 'Sony - PlayStation 2' };
let id = 1;
const game = (platform, title, file = title) => ({
  id: id++, platform, title, platform_name: NAMES[platform], runner: platform === 'ps2' ? 'stream' : 'browser',
  cover: thumbs[platform]
    ? `https://thumbnails.libretro.com/${encodeURIComponent(thumbs[platform])}/Named_Boxarts/${encodeURIComponent(file)}.png`
    : '/api/no-cover.png',
});

function worst() {
  const gba = [
    game('gba', 'Phoenix Wright Ace Attorney - Trials and Tribulations'),
    game('gba', 'Pokemon_Mystery_Dungeon_-_Red_Rescue_Team'), // no spaces: no line-break opportunity
    game('gba', 'Mario & Luigi - Superstar Saga + Shrek 2 - Beg for Mercy'),
    game('gba', 'ファイアーエムブレム 封印の剣'),
    game('gba', 'Ys'),
    game('gba', 'Tom & Jerry in <Infurnal Escape>'), // must render escaped, not as markup
    game('gba', 'Pokemon - Emerald Version', 'Pokemon - Emerald Version (USA, Europe)'),
  ];
  const ps2 = [
    game('ps2', 'Shin Megami Tensei - Devil Summoner - Soul Hackers - Special Edition Plus'),
    game('ps2', 'Ōkami'),
  ];
  const gb = [game('gb', 'Tetris')];
  const platforms = [
    { slug: 'gba', name: NAMES.gba, runner: 'browser', count: 12483, games: gba },
    { slug: 'gb', name: NAMES.gb, runner: 'browser', count: 1, games: gb },
    { slug: 'ps2', name: NAMES.ps2, runner: 'stream', count: 2, games: ps2 },
    ...['gbc', 'nes', 'snes', 'genesis'].map((slug, i) => ({ slug, name: NAMES[slug], runner: 'browser', count: [1, 0, 2, 999][i], games: [] })),
  ];
  const games = [...gba, ...gb, ...ps2];
  return { platforms, games, recent: [gba[2], ps2[0], gba[1], gba[3], gb[0], gba[4], ps2[1], gba[5], gba[0], gba[6], gba[2], ps2[0]], favorites: [gba[1], ps2[0], gba[5]] };
}

function one() {
  const g = game('gba', 'Golden Sun');
  return { platforms: [{ slug: 'gba', name: NAMES.gba, runner: 'browser', count: 1, games: [g] }], games: [g], recent: [g], favorites: [g] };
}

function huge() {
  const words = ['Pokemon', 'Mega Man', 'Castlevania', 'Fire Emblem', 'Golden Sun', 'Kirby', 'Metroid', 'Zelda', 'Final Fantasy', 'Advance Wars'];
  const gba = Array.from({ length: 2500 }, (_, i) => game('gba', `${words[i % words.length]} ${String(i).padStart(4, '0')}`));
  return { platforms: [{ slug: 'gba', name: NAMES.gba, runner: 'browser', count: gba.length, games: gba }], games: gba, recent: gba.slice(0, 12), favorites: gba.slice(100, 400) };
}

const SETS = { worst, one, huge, empty: () => ({ platforms: [], games: [], recent: [], favorites: [] }) };

export default function fixture(name) {
  toggle(name);
  return SETS[name]?.() ?? null;
}

// The Demo / Worst case switch: plain harness chrome, bottom-center, reloads with the chosen ?data=.
function toggle(current) {
  if (document.querySelector('[data-fixture-toggle]')) return;
  const states = [['', 'Dati reali'], ['worst', 'Caso peggiore'], ['one', 'Uno'], ['empty', 'Vuoto'], ['huge', '2.500 giochi']];
  const bar = document.createElement('div');
  bar.dataset.fixtureToggle = '';
  bar.style.cssText = 'position:fixed;left:50%;bottom:12px;translate:-50% 0;z-index:9999;display:flex;gap:2px;padding:3px;border-radius:999px;background:#e5e5e5;font:12px system-ui;box-shadow:0 2px 8px #0003';
  for (const [value, label] of states) {
    const b = document.createElement('span');
    b.textContent = label;
    b.style.cssText = `padding:5px 12px;border-radius:999px;cursor:pointer;color:#222;${value === (current ?? '') ? 'background:#fff;font-weight:600' : ''}`;
    b.onclick = () => {
      const url = new URL(location);
      url.searchParams.set('data', value); // empty value: real data, toggle still shown
      location.href = url;
    };
    bar.append(b);
  }
  document.body.append(bar);
}
