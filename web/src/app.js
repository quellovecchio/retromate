// RetroMate UI ("Vetrina"): games as real 3D boxes on a set lit in the console's color. Hash router rendering
// HTML strings; escape user/file-derived text with esc(). Moving between pages flies the camera (View Transitions).
import '@phosphor-icons/web/regular';
import { MENU_STYLES, box, caseOf, cover, esc, getMenuStyle, playtimeText, setMenuStyle, stamp } from './box.js';
import { FONTS, getFonts, setFonts } from './fonts.js';
import './style.css';
import { getSwap, setSwap } from './nav.js';
import './padtype.js';
import { WII_LANGUAGES, getWiiLanguage, setWiiLanguage, slotFree } from './stream.js';

const root = document.documentElement;
const scene = document.querySelector('.scene');
// A server that never answers ends in the retry page after 10 s instead of an empty screen forever.
const api = (path, init) => fetch('/api' + path, { ...init, signal: AbortSignal.timeout(10000) }).then((r) => {
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
});
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const num = new Intl.NumberFormat('it-IT');
const giochi = (n) => `${num.format(n)} ${n === 1 ? 'gioco' : 'giochi'}`; // 1 gioco, 12.483 giochi

// ---------- Components

const streamBadge = (g) => (g.runner === 'stream' ? '<span class="badge"><i class="ph ph-broadcast" aria-hidden="true"></i>streaming</span>' : '');

// A game in a grid: its box, turned slightly to show the spine, squaring up when selected.
const boxcard = (g, i) => `
  <a class="boxcard" href="/play.html?id=${g.id}" data-i="${i}" data-hue="${caseOf(g.platform).hue}"${g.favorite ? ' data-fav' : ''}>
    <span class="boxcard-stage">${box(g, { lite: true })}</span>
    <span class="boxcard-title">${esc(g.title)}</span>
  </a>`;

// A console: a flat card with its label in the console's color; its first games fan out of the top on focus.
const consoleCard = (p) => `
  <a class="console" href="#/platform/${p.slug}" data-hue="${caseOf(p.slug).hue}" style="--bh:${caseOf(p.slug).hue};view-transition-name:plat-${p.slug}">
    <span class="fan" aria-hidden="true">${p.games.slice(0, 3).map((g) => `<span class="fan-card">${cover(g)}</span>`).join('')}</span>
    <span class="console-short" aria-hidden="true">${caseOf(p.slug).short}</span>
    <span class="console-name">${esc(p.name)}</span>
    <span class="console-count">${giochi(p.count)}${p.runner === 'stream' ? ' · streaming' : ''}</span>
  </a>`;

// A row of boxes on Home (recently played, favorites): a cover flow with a caption for the selected box.
const flowRow = (id, label, list) => (list.length ? `
  <section class="row" aria-labelledby="${id}">
    <h2 id="${id}" class="row-title">${label}</h2>
    <div class="flow" data-row>
      ${list.map((g, i) => `
        <a class="flow-item" href="/play.html?id=${g.id}" data-i="${i}" data-hue="${caseOf(g.platform).hue}"${g.favorite ? ' data-fav' : ''}>
          <span class="flow-vis">${box(g, { lazy: false })}</span><span class="sr-only">${esc(g.title)}, ${esc(g.platform_name)}</span>
        </a>`).join('')}
    </div>
    <div class="flow-caption" aria-hidden="true"><p class="flow-plat"></p><p class="flow-title"></p></div>
  </section>` : '');

const search = (placeholder, label) => `
  <label class="search">
    <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
    <span class="sr-only">${label}</span>
    <input type="search" placeholder="${placeholder}" autocomplete="off" spellcheck="false" enterkeyhint="search">
  </label>`;

const empty = (icon, title, sub = '') => `
  <div class="empty"><i class="ph ph-${icon}" aria-hidden="true"></i><p>${title}</p>${sub ? `<p>${sub}</p>` : ''}</div>`;

// ---------- Data

let fixtures; // dev only: ?data=worst|one|empty|huge swaps the API data for stress fixtures (src/dev/fixtures.js)
let byId = new Map(); // every game of the last load, for the game card
async function load() {
  const data = new URLSearchParams(location.search).get('data');
  let result;
  if (import.meta.env.DEV && data !== null) {
    fixtures ??= (await import('./dev/fixtures.js')).default(data);
    result = fixtures;
  }
  if (!result) {
    const platforms = await api('/platforms'); // rescans the library first, so the next two see new ROMs
    const [games, recent, favorites] = await Promise.all([api('/games'), api('/games/recent'), api('/games/favorites')]);
    for (const p of platforms) p.games = games.filter((g) => g.platform === p.slug);
    result = { platforms, games, recent, favorites };
  }
  byId = new Map(result.games.map((g) => [g.id, g]));
  return result;
}

// ---------- Modal: a <dialog> over a dimmed, blurred set. Its panel lifts in and drops away (style.css); a figure
// (an object the opener carries in, like a game box) stands beside the panel and doesn't fade, so it can fly.
// B, Esc, the close button and a click outside close it; onClose runs as it starts closing.
function openModal(panel, { figure = '', labelledby, onClose } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  if (labelledby) dialog.setAttribute('aria-labelledby', labelledby);
  dialog.innerHTML = `${figure && `<div class="modal-figure">${figure}</div>`}
    <div class="modal-panel">
      <button class="modal-close" aria-label="Chiudi"><i class="ph ph-x" aria-hidden="true"></i></button>
      ${panel}
    </div>`;
  document.body.append(dialog);
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    onClose?.();
    dialog.close(); // focus goes back to whatever opened it
    markBack();
    setTimeout(() => dialog.remove(), 320); // after the exit transition
  };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Esc, and B (nav.js)
  dialog.addEventListener('click', (e) => (e.target === dialog || e.target.closest('.modal-close')) && close());
  dialog.showModal();
  legend.hidePopover?.(); // re-shown, so it stacks above the modal and still says what B does
  legend.showPopover?.();
  document.querySelector('[data-hint-b]').hidden = false;
  return { dialog, close };
}

// The transform that puts a box laid out at `to` where `from` is (FLIP): from its top-left corner.
const flyFrom = (from, to) => `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.height / to.height})`;


// The game card: picking a game opens it instead of launching. Its box flies from the grid (or cover flow) into the
// card and back when it closes; the card shows play time and the save states to start from.
function openGame(link) {
  const g = byId.get(+new URL(link.href).searchParams.get('id'));
  if (!g) return void (location.href = link.href);
  const src = link.querySelector('.box3d');
  const play = `/play.html?id=${g.id}`;
  const stream = g.runner === 'stream' ? ' data-stream' : '';
  const { dialog } = openModal(`
    <p class="game-plat">${esc(g.platform_name)}${streamBadge(g)}</p>
    <h2 id="game-title" class="game-title">${esc(g.title)}</h2>
    <p class="game-time"><i class="ph ph-clock" aria-hidden="true"></i>${playtimeText(g.playtime)}</p>
    <div class="game-plays">
      <a class="game-play" href="${play}"${stream} autofocus><i class="ph ph-play" aria-hidden="true"></i>${g.local ? 'Gioca in streaming' : 'Gioca'}</a>
      ${g.local ? `<a class="game-play game-play-alt" href="${play}&local"><i class="ph ph-browser" aria-hidden="true"></i>Gioca in locale</a>` : ''}
    </div>
    <h3 id="game-states-title" class="game-states-title">Stati salvati</h3>
    <div class="game-states" role="group" aria-labelledby="game-states-title"><p class="game-note">Carico…</p></div>`,
  {
    figure: box(g, { lazy: false }),
    labelledby: 'game-title',
    onClose: () => {
      const fig = dialog.querySelector('.modal-figure');
      if (!src?.isConnected || reduce()) return void (src && (src.style.visibility = ''));
      // The figure fades with the dialog, so a copy flies home above the page while it goes.
      const from = fig.getBoundingClientRect();
      const ghost = fig.cloneNode(true);
      ghost.firstElementChild.style.setProperty('--h', `${fig.firstElementChild.offsetHeight}px`);
      Object.assign(ghost.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, margin: 0, zIndex: 20, pointerEvents: 'none' });
      document.body.append(ghost);
      fig.style.visibility = 'hidden';
      const land = () => { ghost.remove(); src.style.visibility = ''; };
      ghost.animate([{ transform: 'none' }, { transform: flyFrom(src.getBoundingClientRect(), from) }],
        { duration: 420, easing: getComputedStyle(root).getPropertyValue('--ease').trim(), fill: 'forwards' }).finished.then(land);
      setTimeout(land, 600); // a hidden tab never finishes animations: the box must come back anyway
    },
  });
  if (src && !reduce()) {
    const fig = dialog.querySelector('.modal-figure');
    const from = src.getBoundingClientRect();
    src.style.visibility = 'hidden';
    fig.animate([{ transform: flyFrom(from, fig.getBoundingClientRect()) }, { transform: 'none' }],
      { duration: 620, easing: getComputedStyle(root).getPropertyValue('--spring').trim() });
  }
  const list = dialog.querySelector('.game-states');
  api(`/games/${g.id}/states`).then((states) => {
    list.innerHTML = states.length ? states.map((s) => `
      <a class="state" href="${play}&state=${s.name}">
        ${s.screenshot ? `<img src="/api/games/${g.id}/states/${s.name}/screenshot" alt="">` : '<span class="state-shot" aria-hidden="true"></span>'}
        <span>${stamp.format(s.time * 1000)}</span>
      </a>`).join('')
      : '<p class="game-note">Nessuno stato salvato. In gioco: Select + R, oppure Salva stato nel menu.</p>';
  }, () => { list.innerHTML = '<p class="game-note">Non riesco a leggere gli stati salvati.</p>'; });
}
document.addEventListener('click', (e) => {
  const link = e.target.closest?.('a.boxcard, a.flow-item');
  if (!link || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  openGame(link);
});

// ---------- Pages. Each returns its markup and what to wire once it is in the page (returning the default focus).

function home({ platforms, recent, favorites }) {
  const rows = [['home-recent', 'Giocati di recente', recent], ['home-favs', 'Preferiti', favorites]].filter(([, , l]) => l.length);
  const html = `
  <section aria-labelledby="home-title">
    <h1 id="home-title" class="sr-only">RetroMate</h1>
    ${rows.length ? rows.map((row) => flowRow(...row)).join('')
    : empty('game-controller', 'Nessun gioco avviato finora.', 'Scegli una console qui sotto e premi A su un gioco.')}
    <section aria-labelledby="home-consoles">
      <h2 id="home-consoles" class="sr-only">Console</h2>
      ${platforms.length ? `<div class="strip-row">${platforms.map(consoleCard).join('')}</div>`
        : empty('folder-open', 'Nessun gioco nella libreria.', 'Aggiungi le ROM in <code>library/roms/&lt;console&gt;/</code>.')}
    </section>
  </section>`;
  // Cover flow: the selected box faces you; the others stand turned at one shared depth and angle, spaced from
  // the box height so their spines line up like a shelf. Each link is a fixed slot in order (what nav.js
  // measures); only its .flow-vis moves, so a held D-pad never measures a box mid-flight.
  const coverFlow = (flow, list) => {
    const items = [...flow.querySelectorAll('.flow-item')];
    const plat = flow.nextElementSibling.querySelector('.flow-plat');
    const title = flow.nextElementSibling.querySelector('.flow-title');
    let current = 0;
    const arrange = () => {
      const h = flow.offsetHeight - 80; // = --fh, the box height
      const k = innerWidth < 760 ? 0.62 : 1;
      items.forEach((el, i) => {
        const o = i - current;
        const s = Math.sign(o);
        el.toggleAttribute('data-current', o === 0);
        el.style.setProperty('--x', `${Math.round(o === 0 ? 0 : s * k * h * (0.7 + (Math.abs(o) - 1) * 0.3))}px`);
        el.style.setProperty('--z', `${Math.round(o === 0 ? h * 0.22 : -h * 0.5)}px`);
        el.style.setProperty('--ry', `${o === 0 ? 0 : -s * 66}deg`);
        el.style.setProperty('--zi', 100 - Math.abs(o));
        el.firstElementChild.style.visibility = Math.abs(o) > 6 ? 'hidden' : ''; // the slot stays focusable
      });
    };
    const select = (el) => {
      const g = list[+el.dataset.i];
      current = +el.dataset.i;
      arrange();
      plat.innerHTML = esc(g.platform_name) + streamBadge(g);
      title.textContent = g.title;
    };
    flow.addEventListener('focusin', (e) => select(e.target.closest('.flow-item')));
    flow.addEventListener('click', (e) => {
      const item = e.target.closest('.flow-item');
      if (item && !item.hasAttribute('data-current')) { e.preventDefault(); item.focus({ preventScroll: true }); }
    });
    addEventListener('resize', arrange);
    select(items[0]);
    return () => removeEventListener('resize', arrange);
  };
  const init = () => {
    const stops = [...scene.querySelectorAll('.flow')].map((flow, i) => coverFlow(flow, rows[i][2]));
    return { first: scene.querySelector('.flow-item, .console'), stop: () => stops.forEach((stop) => stop()) };
  };
  return { html, init };
}

function library({ platforms, games }) {
  const html = `
  <section aria-labelledby="lib-title">
    <h1 id="lib-title" class="page-title">Libreria</h1>
    ${search(`Cerca tra ${giochi(games.length)}`, 'Cerca un gioco')}
    <div class="lib-results" hidden>
      <p class="results-count" role="status"></p>
      <div class="covers" role="group" aria-label="Risultati"></div>
    </div>
    ${platforms.length ? `<div class="lib-grid">${platforms.map(consoleCard).join('')}</div>`
      : empty('folder-open', 'Nessun gioco trovato.', 'Aggiungi le ROM in <code>library/roms/&lt;console&gt;/</code>.')}
  </section>`;
  const init = () => {
    const input = scene.querySelector('.search input');
    const results = scene.querySelector('.lib-results');
    const grid = scene.querySelector('.lib-grid');
    const list = results.querySelector('.covers');
    const count = results.querySelector('.results-count');
    const MAX = 60; // ponytail: first 60 matches rendered; paginate if libraries grow past a few thousand
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      const q = fold(raw);
      results.hidden = !q;
      if (grid) grid.hidden = !!q;
      if (!q) return;
      const found = games.filter((g) => fold(g.title).includes(q));
      count.textContent = !found.length ? `Nessun gioco trovato per "${raw}".`
        : found.length > MAX ? `${giochi(found.length)}, mostro i primi ${MAX}: scrivi ancora per restringere.`
        : giochi(found.length);
      list.innerHTML = found.slice(0, MAX).map(boxcard).join('');
    });
    return { first: scene.querySelector('.console') ?? input };
  };
  return { html, init };
}

function platform({ platforms }, slug) {
  const p = platforms.find((x) => x.slug === slug);
  if (!p) {
    return { html: empty('question', 'Console non trovata.', '<a href="#/library">Torna alla Libreria</a>'), init: () => ({ first: scene.querySelector('a') }) };
  }
  const c = caseOf(p.slug);
  const html = `
  <section aria-labelledby="plat-title">
    <header class="plat-head" style="--bh:${c.hue};view-transition-name:plat-${p.slug}">
      <span class="console-short" aria-hidden="true">${c.short}</span>
      <h1 id="plat-title" class="plat-title">${esc(p.name)}</h1>
      <span class="console-count">${giochi(p.count)}${p.runner === 'stream' ? ' · streaming' : ''}</span>
    </header>
    <div class="plat-body">
      <aside class="showcase" aria-hidden="true">
        <div class="showcase-stage"><span class="turntable"></span></div>
        <p class="showcase-title"></p>
        <p class="showcase-hint"><b class="pad-btn" data-btn="ok">A</b>Gioca</p>
      </aside>
      <div class="plat-games">
        ${search(`Cerca tra ${giochi(p.count)}`, `Cerca in ${esc(p.name)}`)}
        <p class="results-count" role="status" hidden></p>
        <div class="covers" role="group" aria-label="Giochi">${p.games.map(boxcard).join('')}</div>
      </div>
    </div>
  </section>`;
  const init = () => {
    root.style.setProperty('--hue', c.hue);
    const turntable = scene.querySelector('.turntable');
    const title = scene.querySelector('.showcase-title');
    let last = 0;
    // The selected game's box swings in spine-first from the grid side, then turns to show the front.
    const show = (g) => {
      turntable.innerHTML = box(g, { lazy: false });
      title.textContent = g.title;
      const now = performance.now();
      const fast = now - last < 260; // D-pad held down: no full spin per box
      last = now;
      if (reduce()) return;
      turntable.firstElementChild.animate(
        [{ transform: 'translateX(40%) rotateY(84deg) scale(0.82)', opacity: 0.4 }, { transform: 'none', opacity: 1 }],
        { duration: fast ? 200 : 620, easing: getComputedStyle(root).getPropertyValue(fast ? '--ease' : '--spring').trim() },
      );
    };
    scene.querySelector('.covers').addEventListener('focusin', (e) => show(p.games[+e.target.closest('.boxcard').dataset.i]));
    if (p.games[0]) show(p.games[0]);
    // Search within the console: hide the boxes that don't match, so indexes and remembered focus stay valid.
    const input = scene.querySelector('.search input');
    const count = scene.querySelector('.results-count');
    const cards = [...scene.querySelectorAll('.boxcard')];
    const titles = p.games.map((g) => fold(g.title));
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      const q = fold(raw);
      let n = 0;
      cards.forEach((el, i) => { el.hidden = !titles[i].includes(q); n += !el.hidden; });
      count.hidden = !q;
      count.textContent = n ? giochi(n) : `Nessun gioco trovato per "${raw}".`;
    });
    return { first: scene.querySelector('.boxcard') };
  };
  return { html, init };
}

const toggle = (opt, title) => `
  <button class="toggle" role="switch" aria-checked="false" data-opt="${opt}">
    <span class="toggle-text"><span class="toggle-title">${title}</span><span class="toggle-note"></span></span>
    <span class="toggle-track" aria-hidden="true"></span>
  </button>`;

function options() {
  const html = `
  <section aria-labelledby="opt-title">
    <h1 id="opt-title" class="page-title">Opzioni</h1>
    <div class="panel">
      <h2>Caratteri</h2>
      <p class="panel-note">La scelta vale per questo dispositivo.</p>
      <div class="font-picks">${FONTS.map(([id, name]) => `
        <button class="font-pick" data-fonts="${id}" aria-pressed="false">
          <span class="font-pick-display">Golden Sun</span>
          <span class="font-pick-body">136 giochi · Game Boy Advance</span>
          <span class="font-pick-name"><i class="ph ph-check-circle" aria-hidden="true"></i>${name}</span>
        </button>`).join('')}
      </div>
    </div>
    <div class="panel">
      <h2>Controller</h2>
      <p class="panel-note">La scelta vale per questo dispositivo.</p>
      ${toggle('swap', 'Inverti A e B')}
      ${toggle('back', 'B dalle sezioni torna alla Home')}
    </div>
    <div class="panel">
      <h2>Menu di gioco</h2>
      <p class="panel-note">Si apre mentre giochi con Home, Select + Start o Esc. Vale per questo dispositivo.</p>
      <div class="choices" data-choices="menu" role="group" aria-label="Aspetto del menu di gioco">${MENU_STYLES.map(([id, name]) => `
        <button class="choice" data-menu="${id}" aria-pressed="false">${name}</button>`).join('')}
      </div>
      <p class="panel-note" data-menu-note></p>
    </div>
    <div class="panel">
      <h2>Wii</h2>
      <p class="panel-note">Lingua del sistema Wii: i giochi la usano per menu e testi. Vale per questo dispositivo.</p>
      <div class="choices" data-choices="lang" role="group" aria-label="Lingua del sistema Wii">${WII_LANGUAGES.map(([id, name]) => `
        <button class="choice" data-lang="${id}" aria-pressed="false">${name}</button>`).join('')}
      </div>
    </div>
  </section>`;
  const init = () => {
    // [read, write, what it does now] per switch
    const SWITCHES = {
      swap: [getSwap, setSwap, (on) => (on ? 'B seleziona, A torna indietro' : 'A seleziona, B torna indietro')],
      back: [() => backHome, setBackHome, (on) => (on ? 'Da Libreria e Opzioni, B torna alla Home'
        : 'B torna indietro solo dalle pagine delle console')],
    };
    for (const t of scene.querySelectorAll('.toggle')) {
      const [get, set, note] = SWITCHES[t.dataset.opt];
      const mark = () => {
        t.setAttribute('aria-checked', get());
        t.querySelector('.toggle-note').textContent = note(get());
        labelButtons();
        markBack();
      };
      t.addEventListener('click', () => { set(!get()); mark(); });
      mark();
    }
    const langs = [...scene.querySelectorAll('.choice[data-lang]')];
    const markLang = () => langs.forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === getWiiLanguage()));
    scene.querySelector('[data-choices="lang"]').addEventListener('click', (e) => {
      const b = e.target.closest('.choice');
      if (b) { setWiiLanguage(b.dataset.lang); markLang(); }
    });
    markLang();
    const menus = [...scene.querySelectorAll('.choice[data-menu]')];
    const markMenu = () => {
      menus.forEach((b) => b.setAttribute('aria-pressed', b.dataset.menu === getMenuStyle()));
      scene.querySelector('[data-menu-note]').textContent = MENU_STYLES.find(([id]) => id === getMenuStyle())[2];
    };
    scene.querySelector('[data-choices="menu"]').addEventListener('click', (e) => {
      const b = e.target.closest('.choice');
      if (b) { setMenuStyle(b.dataset.menu); markMenu(); }
    });
    markMenu();
    const picks = [...scene.querySelectorAll('.font-pick')];
    const mark = () => picks.forEach((b) => b.setAttribute('aria-pressed', b.dataset.fonts === getFonts()));
    scene.querySelector('.font-picks').addEventListener('click', (e) => {
      const b = e.target.closest('.font-pick');
      if (!b) return;
      const apply = () => { setFonts(b.dataset.fonts); mark(); };
      if (!document.startViewTransition || reduce() || document.hidden) return apply();
      root.dataset.vt = 'fade'; // the whole page restyles: crossfade it rather than snap
      document.startViewTransition(apply).ready.catch(() => {});
    });
    mark();
    return { first: picks.find((b) => b.getAttribute('aria-pressed') === 'true') };
  };
  return { html, init };
}

const failed = () => ({
  html: empty('plugs', 'Il server di RetroMate non risponde.', 'Controlla che sia avviato, poi riprova.<br><button class="retry">Riprova</button>'),
  init: () => {
    scene.querySelector('.retry').addEventListener('click', () => draw().then((paint) => paint()));
    return { first: scene.querySelector('.retry') };
  },
});

// [pattern, page, depth]: depth decides which way the camera flies.
const ROUTES = [
  [/^#\/options$/, options, 1],
  [/^#\/library$/, library, 1],
  [/^#\/platform\/([\w-]+)$/, platform, 2],
  [/^/, home, 0],
];
const route = () => ROUTES.find(([re]) => re.test(location.hash));

// ---------- Shell

// A notice drops from the top edge like a hinged sign, then leaves the same way.
function notice(text) {
  document.querySelector('.notice')?.remove();
  const n = Object.assign(document.createElement('p'), { className: 'notice', textContent: text });
  n.setAttribute('role', 'status');
  n.popover = 'manual'; // the top layer: above an open modal too
  document.body.append(n);
  n.showPopover?.();
  setTimeout(() => n.classList.add('out'), 4500);
  setTimeout(() => n.remove(), 4800);
}

// Streamed games share one server slot: check it before leaving the page, so a busy slot is a notice here
// instead of a dead end on the play page. (Bubbles after the cover flow's own click handler, which may cancel.)
let launching = false;
document.addEventListener('click', async (e) => {
  const link = e.target.closest?.('a[data-stream]');
  if (!link || e.defaultPrevented) return;
  e.preventDefault();
  if (launching) return;
  launching = true;
  const free = await slotFree();
  launching = false;
  if (free) return void (location.href = link.href);
  notice(free === false ? 'Streaming occupato: qualcun altro sta già giocando. Riprova quando ha finito.'
    : 'Il server di streaming non risponde: controlla che cloud-game sia avviato.');
});

// Remember the focused element per page, so coming back from a game lands where you left.
const focusKey = () => 'focus:' + location.hash;
const focusables = () => [...scene.querySelectorAll('a[href], button, input')];
scene.addEventListener('focusin', (e) => {
  try { sessionStorage.setItem(focusKey(), focusables().indexOf(e.target)); } catch {}
});
// B (Escape) goes back from a console page; from the sections (Libreria, Opzioni) only if Opzioni says so, per
// device, and then straight to Home. nav.js reads where B leads from <html data-back>; the legend shows B only then.
const BACK_KEY = 'retromate-back-home';
let backHome = false;
try { backHome = localStorage.getItem(BACK_KEY) === '1'; } catch {}
function setBackHome(on) {
  backHome = on;
  try { localStorage.setItem(BACK_KEY, on ? '1' : '0'); } catch {}
}
function markBack() {
  const to = location.hash.startsWith('#/platform') ? 'history' : backHome && location.hash.length > 2 ? '#/' : '';
  if (to) root.dataset.back = to;
  else delete root.dataset.back;
  document.querySelector('[data-hint-b]').hidden = !to;
}

// Pad glyphs for confirm and back ([data-btn]) follow the A/B swap chosen in Opzioni.
function labelButtons() {
  for (const b of document.querySelectorAll('[data-btn]')) b.textContent = (b.dataset.btn === 'ok') === getSwap() ? 'B' : 'A';
}

// The set lights up in the color of whatever has focus, and the legend says what A (and X, on a game) will do there.
const legend = document.querySelector('.hints');
legend.showPopover?.();
const hintA = document.querySelector('[data-hint-a]');
const hintX = document.querySelector('[data-hint-x]');
const isGame = (el) => el?.matches?.('[href^="/play.html"]:not(.state)');
function hints(el) {
  hintA.textContent = isGame(el) && !el.matches('.boxcard, .flow-item') ? 'Gioca' : isGame(el) ? 'Apri'
    : el?.matches?.('.state') ? 'Riprendi' : el?.matches?.('input') ? 'Scrivi' : el?.matches?.('.font-pick, .choice') ? 'Scegli' : el?.matches?.('.toggle') ? 'Cambia' : 'Apri';
  hintX.hidden = !isGame(el);
  hintX.querySelector('[data-hint-x-label]').textContent = el?.hasAttribute?.('data-fav') ? 'Togli dai preferiti' : 'Preferito';
}
document.addEventListener('focusin', (e) => {
  const hue = e.target.closest?.('[data-hue]')?.dataset.hue;
  if (hue) root.style.setProperty('--hue', hue);
  hints(e.target);
});

// X on a game adds it to the favorites (a row on Home) or takes it out. The game's links carry the state (data-fav).
document.addEventListener('pad-x', async (e) => {
  const link = e.target;
  if (!isGame(link)) return;
  try {
    const { favorite } = await api(`/games/${new URL(link.href).searchParams.get('id')}/favorite`, { method: 'POST' });
    for (const a of scene.querySelectorAll(`a[href="${link.getAttribute('href')}"]`)) a.toggleAttribute('data-fav', favorite);
    hints(document.activeElement);
    notice(favorite ? 'Aggiunto ai preferiti.' : 'Tolto dai preferiti.');
  } catch {
    notice('Non riesco a salvare il preferito: controlla che il server di RetroMate sia avviato.');
  }
});

// The current tab: a console page belongs to Libreria.
function markTab() {
  for (const a of document.querySelectorAll('.nav a')) {
    const here = a.hash === (location.hash.startsWith('#/platform') ? '#/library' : location.hash || '#/');
    here ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
}

let stopPage;
async function draw() {
  const [re, view] = route();
  const args = location.hash.match(re).slice(1);
  let page;
  try {
    page = view === options ? view() : view(await load(), ...args);
  } catch {
    page = failed();
  }
  const paint = () => {
    stopPage?.();
    scene.innerHTML = page.html;
    scrollTo(0, 0);
    markTab();
    labelButtons();
    markBack();
    const { first, stop } = page.init();
    stopPage = stop;
    let i = -1;
    try { i = +(sessionStorage.getItem(focusKey()) ?? -1); } catch {}
    (focusables()[i] ?? first ?? document.querySelector('.nav a'))?.focus({ preventScroll: true });
  };
  return paint;
}

// Deeper = the camera flies forward through the old page; back = it pulls away. Data loads before the flight.
// Switching between tabs is a short crossfade instead, and never waits: the tab lights up at once (so LB/RB pressed
// again move on from it), a newer navigation drops an older one still loading and cuts a flight still running.
let depth = route()[2];
let seq = 0;
let flight;
async function navigate() {
  const mine = ++seq;
  document.querySelector('dialog.modal[open]')?.dispatchEvent(new Event('cancel', { cancelable: true })); // leaving the page closes it
  const next = route()[2];
  root.dataset.vt = Math.max(depth, next) <= 1 ? 'fade' : next >= depth ? 'in' : 'out';
  depth = next;
  markTab();
  flight?.skipTransition();
  const paint = await draw();
  if (mine !== seq) return;
  if (!document.startViewTransition || reduce() || document.hidden) return paint();
  // The browser skips the animation (and rejects .ready) if the page is hidden mid-flight; the page still updates.
  flight = document.startViewTransition(paint);
  flight.ready.catch(() => {});
}

addEventListener('hashchange', navigate);
// Leaving for a game flies forward into it; arriving back from one pulls the camera out.
// A skipped cross-document transition rejects its promises; the navigation itself is unaffected.
const quiet = (vt) => { vt?.ready.catch(() => {}); vt?.finished.catch(() => {}); };
addEventListener('pageswap', (e) => { root.dataset.vt = 'in'; quiet(e.viewTransition); });
addEventListener('pagereveal', (e) => { root.dataset.vt = 'out'; quiet(e.viewTransition); });
draw().then((paint) => paint());

// Clock and controller state in the top bar.
function status() {
  document.querySelector('[data-clock]').textContent = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const on = [...(navigator.getGamepads?.() ?? [])].some(Boolean);
  const pad = document.querySelector('[data-pad]');
  pad.toggleAttribute('data-on', on);
  pad.querySelector('[data-pad-label]').textContent = on ? 'Controller connesso' : 'Nessun controller';
}
status();
setInterval(status, 10000);
addEventListener('gamepadconnected', status);
addEventListener('gamepaddisconnected', status);
