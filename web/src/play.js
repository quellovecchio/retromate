import './fonts.js';
import './style.css';
import './nav.js';
import { getMenuStyle } from './box.js';
import { ingame, loadControls } from './ingame.js';

// EmulatorJS = RetroArch/libretro cores compiled to WASM.
// ponytail: loaded from the public CDN; self-host the data folder (like RomM does) for offline/LAN-only installs.
const EJS_DATA = 'https://cdn.emulatorjs.org/4.2.3/data/';

const msg = document.getElementById('msg');
const params = new URLSearchParams(location.search);
const id = params.get('id');
let leaving; // set for browser games and the local core: flushes the in-game save to the server before the page goes
const combos = {}; // pad shortcuts that need the running emulator (see poll below)
let menu; // the in-game menu (ingame.js), once the game runs
// nav.js stays out of the way while a game runs: the pad and the keys are the game's (the menu unlocks it).
document.documentElement.setAttribute('data-nav-lock', '');
const back = async () => {
  await leaving?.();
  history.length > 1 ? history.back() : location.replace('/');
};

function status(text) {
  msg.textContent = text;
  msg.hidden = !text;
}

// Player 1's mapping saved for this console (stream and local cores share it). Mappings saved before the sticks could
// be mapped have no 16-23: those take the defaults.
async function savedControls(platform, defaults) {
  const saved = await loadControls(platform);
  saved?.players.forEach((p, i) => {
    p.keys = { ...defaults.players[i].keys, ...p.keys };
    p.pad = { ...defaults.players[i].pad, ...p.pad };
  });
  return saved;
}

function toast(text) {
  const t = Object.assign(document.createElement('p'), { className: 'toast', textContent: text });
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

const res = await fetch(`/api/games/${encodeURIComponent(id)}`);
if (!res.ok) {
  msg.textContent = 'Gioco non trovato.';
} else {
  const game = await res.json();
  document.title = `${game.title} · RetroMate`;
  fetch(`/api/games/${game.id}/played`, { method: 'POST' });
  playtime(game.id);

  if (game.threads && !self.crossOriginIsolated) {
    // PPSSPP needs SharedArrayBuffer: reload as play.html?threads, which the server isolates.
    location.replace(`${location.pathname}${location.search}&threads${location.hash}`);
  } else if (game.runner === 'browser') {
    msg.remove();
    Object.assign(window, {
      EJS_player: '#game',
      EJS_core: game.core,
      EJS_gameUrl: `/api/games/${game.id}/rom/${encodeURIComponent(game.file.split('/').pop())}`,
      EJS_gameName: game.title,
      EJS_pathtodata: EJS_DATA,
      EJS_startOnLoaded: true,
      EJS_threads: !!game.threads,
      EJS_onGameStart: () => saves(game, window.EJS_emulator, params.get('state')),
    });
    document.body.append(Object.assign(document.createElement('script'), { src: EJS_DATA + 'loader.js' }));
  } else if (game.local && params.has('local')) {
    // The console's in-browser core (PS2: Play!), chosen on the game card instead of the stream.
    const { local } = await import('./local.js');
    const { streamDefaultControls } = await import('./stream.js');
    const ctl = await local(game, document.getElementById('game'), status);
    if (ctl) {
      leaving = () => Promise.race([ctl.flush(), new Promise((r) => setTimeout(r, 2000))]);
      const saved = await savedControls(game.platform, streamDefaultControls());
      if (saved) ctl.controls = saved;
      menu = ingame(localAdapter(game, ctl, streamDefaultControls), saved, { variant: params.get('menu') ?? getMenuStyle() });
    }
  } else {
    // Server-side emulation: same page, a WebRTC <video> instead of EmulatorJS, and the same in-game menu.
    const { stream, streamDefaultControls, DEVICE_KEY } = await import('./stream.js');
    // Core options chosen for this game in the in-game menu: they go with the start request.
    const options = await fetch(`/api/games/${game.id}/options`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const ctl = stream(game, document.getElementById('game'), status);
    ctl.startOptions = options;
    const state = params.get('state');
    if (state) ctl.onPlaying = async () => (await ctl.load(state)) || toast('Stato non trovato.');
    const saved = await savedControls(game.platform, streamDefaultControls());
    if (saved) ctl.controls = saved;
    const adapter = streamAdapter(game, ctl, streamDefaultControls, options, DEVICE_KEY);
    // No save states where the core can't make them (PS3, Switch): the menu hides them and Select + R does nothing.
    if (!game.states) for (const k of ['saveState', 'states', 'loadState']) delete adapter[k];
    else combos.saveState = async () => toast((await adapter.saveState()) ? 'Stato salvato.' : 'Salvataggio non riuscito.');
    menu = ingame(adapter, saved, { variant: params.get('menu') ?? getMenuStyle() });
  }
}

// Saves live on the server (library/saves, library/states), not in this browser: EmulatorJS only writes the in-game
// save to IndexedDB every 5 minutes or on unload, too late to finish, so a save made just before leaving was lost.
async function saves(game, ejs, state) {
  const gm = ejs.gameManager;
  const api = `/api/games/${game.id}`;

  const flush = game.platform === 'psp' ? await memstick(gm, api) : await sram(ejs, api);
  setInterval(flush, 30000);
  addEventListener('visibilitychange', () => document.hidden && flush());
  leaving = () => Promise.race([flush(), new Promise((r) => setTimeout(r, 2000))]);

  // Save states: EmulatorJS's own Save/Load State buttons, and Select + R on the pad, go to the server.
  // Returns the new state's name, or null. quiet: the caller (the in-game menu) reports it itself; shot: a frame
  // grabbed earlier (the menu pauses the game, and a paused core takes no screenshots).
  async function saveState(quiet, shot) {
    const say = (text) => quiet !== true && toast(text);
    let data;
    try { data = gm.getState(); } catch { say('Questo gioco non supporta i salvataggi rapidi.'); return null; }
    const r = await fetch(`${api}/states`, { method: 'POST', body: data }).catch(() => null);
    if (!r?.ok) { say('Salvataggio non riuscito: il server non risponde.'); return null; }
    const { name } = await r.json();
    say('Stato salvato.');
    const png = shot ?? await frame();
    if (png) fetch(`${api}/states/${name}/screenshot`, { method: 'PUT', body: png });
    return name;
  }
  async function loadState(name) {
    const r = await fetch(`${api}/states/${name}`);
    if (r.ok) gm.loadState(new Uint8Array(await r.arrayBuffer()));
    else toast('Stato non trovato.');
  }
  ejs.on('saveState', saveState);
  ejs.on('loadState', async () => {
    const [newest] = await (await fetch(`${api}/states`)).json();
    newest ? loadState(newest.name) : toast('Nessuno stato salvato.');
  });
  combos.saveState = saveState;
  if (state) loadState(state);

  // The in-game menu (Home on the pad, Esc on the keyboard) replaces EmulatorJS's own bar and menus.
  const adapter = ejsAdapter(game, ejs, saveState, loadState, api);
  const saved = await loadControls(game.platform);
  if (saved) adapter.applyControls(saved);
  // The layout chosen in Opzioni; ?menu=bar|vetrina overrides it (handy to compare the two).
  menu = ingame(adapter, saved, { variant: params.get('menu') ?? getMenuStyle() });
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// keepalive lets a small save finish even if the page is closing (browsers cap it at 64 KB).
const putSave = (api, data) => fetch(`${api}/save`, { method: 'PUT', body: data, keepalive: data.length < 60000 }).catch(() => {});
function mkdirs(FS, path) {
  let dir = '';
  for (const part of path.split('/').slice(1, -1)) if (!FS.analyzePath((dir += '/' + part)).exists) FS.mkdir(dir);
}

// In-game save (SRAM): the server copy replaces whatever this browser had. None on the server yet: keep the
// browser's (saves made before this existed) and upload it at the first flush. Returns the flush.
async function sram(ejs, api) {
  const gm = ejs.gameManager;
  const sav = await fetch(`${api}/save`);
  if (sav.ok) {
    const path = gm.getSaveFilePath();
    mkdirs(gm.FS, path);
    gm.FS.writeFile(path, new Uint8Array(await sav.arrayBuffer()));
    gm.loadSaveFiles();
  }
  // EmulatorJS emits saveSaveFiles with the file whenever it flushes the core's SRAM (its own timer, or ours).
  let last;
  let upload = Promise.resolve();
  ejs.on('saveSaveFiles', (data) => {
    if (!data?.length || (last && same(last, data))) return;
    // A game never saved has blank SRAM (all 0xFF or 0x00): never let it replace a real save on the server.
    if (data.every((b) => b === data[0]) && (data[0] === 0xff || data[0] === 0)) return;
    last = data.slice();
    upload = putSave(api, last);
  });
  return () => { try { gm.saveSaveFiles(); } catch {} return upload; };
}

// PSP: PPSSPP has no SRAM. Its saves are folders on the emulated memory stick (PSP/SAVEDATA/{game code}...), beside
// EmulatorJS's save file, and go to the server as one tar per game. The memory stick starts each game with only that
// game's folders, so whatever is there at a flush is this game's. Server unreachable: no sync at all, rather than
// emptying the memory stick and then overwriting the server's save with this session's.
async function memstick(gm, api) {
  const { FS } = gm;
  const root = gm.getSaveFilePath().replace(/[^/]*$/, 'PSP/SAVEDATA');
  const sav = await fetch(`${api}/save`).catch(() => null);
  if (!sav || (!sav.ok && sav.status !== 404)) {
    toast('Server non raggiungibile: i salvataggi restano in questo browser.');
    return () => Promise.resolve();
  }
  const rm = (p) => {
    if (!FS.isDir(FS.stat(p).mode)) return FS.unlink(p);
    for (const n of FS.readdir(p)) if (n !== '.' && n !== '..') rm(`${p}/${n}`);
    FS.rmdir(p);
  };
  if (FS.analyzePath(root).exists) rm(root);
  let last = sav.ok ? new Uint8Array(await sav.arrayBuffer()) : tar([]);
  for (const [name, data] of untar(last)) {
    mkdirs(FS, `${root}/${name}`);
    FS.writeFile(`${root}/${name}`, data);
  }
  const files = (dir, rel = '') => !FS.analyzePath(dir).exists ? [] : FS.readdir(dir).sort().flatMap((n) => {
    if (n === '.' || n === '..') return [];
    const p = `${dir}/${n}`;
    return FS.isDir(FS.stat(p).mode) ? files(p, `${rel}${n}/`) : [[rel + n, FS.readFile(p)]];
  });
  let upload = Promise.resolve();
  // PPSSPP writes the memory stick straight into EmulatorJS's file system: nothing to ask the core first.
  return () => {
    const data = tar(files(root));
    if (data.length > 1024 && !same(data, last)) upload = putSave(api, (last = data)); // 1024 = no files: never upload
    return upload;
  };
}

// The few tar bits the PSP saves need: ustar, regular files, deterministic (same files, same bytes). Python's tarfile
// and any archiver open it.
function tar(files) {
  const enc = new TextEncoder();
  const blocks = [];
  for (const [name, data] of files) {
    const h = new Uint8Array(512);
    const put = (s, at) => h.set(enc.encode(s), at);
    put(name, 0);
    put('0000644\0', 100);
    put('0000000\0', 108);
    put('0000000\0', 116);
    put(data.length.toString(8).padStart(11, '0') + '\0', 124);
    put('00000000000\0', 136);
    put('        ', 148); // the checksum field counts as spaces while it is summed
    put('0', 156);
    put('ustar\x0000', 257);
    put(h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    const body = new Uint8Array(Math.ceil(data.length / 512) * 512);
    body.set(data);
    blocks.push(h, body);
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  blocks.reduce((at, b) => (out.set(b, at), at + b.length), 0);
  return out;
}
function untar(bytes) {
  const dec = new TextDecoder();
  const files = [];
  for (let at = 0; at + 512 <= bytes.length && bytes[at];) {
    const field = (from, len) => dec.decode(bytes.subarray(at + from, at + from + len)).replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim(), 8) || 0;
    const name = field(0, 100);
    if ((field(156, 1) || '0') === '0' && !name.split('/').includes('..')) files.push([name, bytes.slice(at + 512, at + 512 + size)]);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

// The current frame as a PNG at the core's own resolution (240x160 on GBA), straight from the core: the WebGL
// canvas reads back black outside its own frame. The core only answers while it runs (null after 1.5 s).
const frame = () => Promise.race([window.EJS_emulator.gameManager.screenshot(), new Promise((r) => setTimeout(r, 1500, null))]);

// What the in-game menu needs from EmulatorJS (see the adapter contract at the top of ingame.js).
function ejsAdapter(game, ejs, saveState, loadState, api) {
  const gm = ejs.gameManager;
  let shot = null; // the last frame before the menu paused the game, for a state saved from the menu
  const INPUTS = 24; // RetroPad buttons and both sticks; EmulatorJS's 24-29 are its own hotkeys
  // EmulatorJS ignores the pad and the keyboard while one of its popups is open: claim to be one while the menu is up.
  let blocked = false;
  const popupOpen = ejs.isPopupOpen.bind(ejs);
  ejs.isPopupOpen = () => blocked || popupOpen();
  const pads = () => [...navigator.getGamepads()].filter(Boolean);
  // EmulatorJS controls ({player: {input: {value: key, value2: pad label}}}) -> the menu's model
  const toModel = (src, devices) => ({
    players: [0, 1, 2, 3].map((p) => {
      const keys = {};
      const pad = {};
      for (let i = 0; i < INPUTS; i++) {
        const c = src?.[p]?.[i];
        if (!c) continue;
        const k = +ejs.keyLookup(c.value);
        if (k > 0) keys[i] = k;
        if (c.value2 !== undefined && c.value2 !== '') pad[i] = c.value2;
      }
      return { device: devices[p], keys, pad };
    }),
  });
  // Connected pads go to players in order; player 1 falls back to the keyboard.
  const autoDevices = () => [0, 1, 2, 3].map((p) => (pads()[p] ? `pad:${pads()[p].id}` : p === 0 ? 'keyboard' : 'none'));
  let current;
  // Pads show up late (a browser exposes one only after its first press) and EmulatorJS then hands each to the first
  // free player: put them back where the mapping says.
  const select = () => {
    if (!current) return;
    ejs.gamepadSelection = current.players.map(({ device }) => {
      const gp = device.startsWith('pad:') && pads().find((x) => x.id === device.slice(4));
      return gp ? `${gp.id}_${gp.index}` : '';
    });
  };
  addEventListener('gamepadconnected', () => setTimeout(select));
  return {
    game,
    keyMap: ejs.keyMap,
    // Grab the frame on screen first: once paused, the core takes no screenshots. A couple of frames at most.
    async pause() {
      shot = await Promise.race([gm.screenshot(), new Promise((r) => setTimeout(r, 250, null))]);
      ejs.pause();
    },
    resume: () => ejs.play(),
    block(on) {
      blocked = on;
      // Whatever was held when the menu opened was released unseen: let go of everything on the way back.
      if (!on) for (let p = 0; p < 4; p++) for (let i = 0; i < INPUTS; i++) gm.simulateInput(p, i, 0);
    },
    restart: () => gm.restart(),
    saveState: () => saveState(true, shot),
    states: () => states(api),
    loadState,
    volume: () => ejs.volume ?? 0.5,
    muted: () => !!ejs.muted,
    // EmulatorJS's setVolume saves its settings before updating `muted`, so the stored flag is always the previous
    // one (a game reopened muted after unmuting): save again once it is current.
    setVolume(v) { ejs.volume = v; ejs.setVolume(v); ejs.saveSettings(); },
    setMuted(m) {
      if (!m && !ejs.volume) ejs.volume = 0.5;
      ejs.setVolume(m ? 0 : ejs.volume);
      ejs.saveSettings();
    },
    defaultControls: () => toModel(ejs.defaultControllers, autoDevices()),
    options: async () => ejsOptions(ejs),
    // EmulatorJS applies it (core variable, shader, speed...) and keeps it for this game in this browser.
    setOption: (id, value) => ejs.changeSettingOption(id, value),
    applyControls(model) {
      current = model;
      ejs.controls = Object.fromEntries(model.players.map(({ keys, pad }, p) => {
        const inputs = {};
        for (let i = 0; i < INPUTS; i++) if (keys[i] !== undefined || pad[i] !== undefined) inputs[i] = { value: keys[i], value2: pad[i] };
        return [p, inputs];
      }));
      select();
    },
    exit: back,
  };
}

// EmulatorJS's settings worth having from a sofa, in the menu's options format (see ingame.js), plus every option the
// libretro core declares. Its own menu also has screenshots, recording, keyboard capture and the like: not needed here.
const ON_OFF = [{ value: 'enabled', label: 'Acceso' }, { value: 'disabled', label: 'Spento' }];
// Core option values worth translating; the rest (numbers, modes) stay as the core names them.
const WORDS = { enabled: 'Acceso', disabled: 'Spento', on: 'Acceso', off: 'Spento' };
const word = (v) => WORDS[v.toLowerCase()] ?? v;
const RATIOS = (top) => ['1.5', '2.0', '2.5', '3.0', '4.0', '5.0', '6.0', '8.0', '10.0', ...top].map((v) => ({ value: v, label: v === 'unlimited' ? 'Senza limite' : `${v.replace('.0', '').replace('.', ',')}x` }));
function ejsOptions(ejs) {
  const opt = (id, label, values, note) => ({ id, label, note, values, value: ejs.getSettingValue(id) ?? values[0].value });
  const shaders = Object.keys(ejs.config.shaders ?? {}).map((s) => ({ value: s, label: s.replace(/\.glslp$/, '').replace(/^crt-/, 'CRT ').replace(/-/g, ' ') }));
  // Core options come as "key|default; value|value|...". Their keys share the core's prefix (mgba_, pcsx_rearmed_).
  const lines = (ejs.gameManager.getCoreOptions?.() ?? '').split('\n').filter((l) => l.includes('|'));
  const keys = lines.map((l) => l.split('|')[0]);
  let prefix = keys[0] ?? '';
  for (const k of keys) while (!k.startsWith(prefix)) prefix = prefix.slice(0, -1);
  prefix = prefix.slice(0, prefix.lastIndexOf('_') + 1);
  const core = lines.map((l) => {
    const [key, rest] = [l.slice(0, l.indexOf('|')), l.slice(l.indexOf('|') + 1)];
    const values = rest.slice(rest.indexOf(';') + 1).trim().split('|').map((v) => ({ value: v, label: word(v) }));
    const name = key.slice(prefix.length).replace(/_/g, ' ');
    return opt(key, name.charAt(0).toUpperCase() + name.slice(1), values);
  });
  return [
    { label: 'Video', icon: 'monitor', items: [
      opt('shader', 'Filtro (shader)', [{ value: 'disabled', label: 'Nessuno' }, ...shaders]),
      opt('videoRotation', 'Rotazione', ['0°', '90°', '180°', '270°'].map((label, i) => ({ value: String(i), label }))),
      opt('vsync', 'Sincronia verticale', ON_OFF),
      opt('fps', 'Mostra FPS', [{ value: 'show', label: 'Sì' }, { value: 'hide', label: 'No' }]),
    ] },
    { label: 'Velocità', icon: 'gauge', items: [
      opt('fastForward', 'Avanti veloce', ON_OFF),
      opt('ff-ratio', 'Quanto veloce', RATIOS(['unlimited'])),
      opt('slowMotion', 'Rallentatore', ON_OFF),
      opt('sm-ratio', 'Quanto lento', RATIOS([])),
      opt('rewindEnabled', 'Riavvolgimento', ON_OFF, 'Vale dal prossimo avvio del gioco'),
    ] },
    { label: `Core ${ejs.getCore?.() ?? ''}`.trim(), icon: 'cpu', items: core },
  ];
}

const states = (api) => fetch(`${api}/states`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));

// Phosphor icons for the core's option categories, guessed from their keys (pcsx2: system, video, audio, input, hacks).
const CATEGORY_ICONS = [[/video|graphic|render|display|screen/, 'monitor'], [/audio|sound/, 'speaker-high'],
  [/input|control|pad/, 'game-controller'], [/hack|advanced|debug/, 'wrench'], [/system|emulation|cpu|core/, 'cpu']];
const categoryIcon = (key) => CATEGORY_ICONS.find(([re]) => re.test(key))?.[1] ?? 'sliders-horizontal';

// What the in-game menu needs from a streamed game (stream.js): one player (cloud-game gives a connection one port).
// States go to the same server folder as the browser games' ones: the worker writes the file (named here), this page
// uploads the screenshot. Emulator options are whatever the server's libretro core declares, so any console works
// without a list per emulator: a change applies to the running core (some only take effect at the next start, the
// core decides) and is saved for this game (saved: {key: value}, sent with every start).
function streamAdapter(game, ctl, defaults, saved, deviceKey) {
  const api = `/api/games/${game.id}`;
  let shot = null; // the frame on screen when the menu paused the game
  let defaultsOf = {}; // each option's default (stream/config.yaml's, else the core's), from the last options()
  // What an option goes back to without this game's choice: RetroMate's own start value (Wii language), else the default.
  const baseline = (key) => ctl.baseOptions?.[key] ?? defaultsOf[key];
  // The <video> frame as a PNG, drawn now (encoded later). OpenGL frames come upside down, like on screen.
  const snap = () => {
    const v = ctl.video;
    if (!v?.videoWidth) return Promise.resolve(null);
    const c = Object.assign(document.createElement('canvas'), { width: v.videoWidth, height: v.videoHeight });
    const x = c.getContext('2d');
    if (ctl.flip) x.setTransform(1, 0, 0, -1, 0, c.height);
    x.drawImage(v, 0, 0);
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  };
  return {
    game,
    players: 1,
    pause() { shot = snap(); ctl.pause(true); },
    resume() { shot = null; ctl.pause(false); },
    block: (on) => ctl.block(on),
    restart: () => ctl.reset(),
    async saveState() {
      const png = shot ?? snap();
      const name = String(Date.now());
      if (!(await ctl.save(name))) return null;
      png.then((b) => b && fetch(`${api}/states/${name}/screenshot`, { method: 'PUT', body: b }));
      return name;
    },
    states: () => states(api),
    loadState: async (name) => (await ctl.load(name)) || toast('Stato non caricato.'),
    volume: () => ctl.video.volume,
    muted: () => ctl.video.muted,
    setVolume: (v) => { ctl.video.volume = v; },
    setMuted: (m) => { ctl.video.muted = m; },
    defaultControls: defaults,
    applyControls: (m) => { ctl.controls = m; },
    async options() {
      const o = await ctl.options();
      if (!o) throw new Error('no options');
      defaultsOf = Object.fromEntries(o.options.map((x) => [x.key, x.default]));
      const shown = o.options.filter((x) => !x.hidden && x.values.length > 1);
      const item = (x) => ({ id: x.key, label: x.label, value: x.value, values: x.values.map((v) => ({ value: v.value, label: word(v.label) })) });
      const cats = o.categories ?? [];
      return [
        ...cats.map((c) => ({ label: c.label, icon: categoryIcon(c.key), items: shown.filter((x) => x.category === c.key).map(item) })),
        // options outside any category (cores without categories: all of them)
        { label: cats.length ? 'Altre' : 'Core', icon: 'cpu', items: shown.filter((x) => !cats.some((c) => c.key === x.category)).map(item) },
      ];
    },
    async setOption(id, value) {
      if (!(await ctl.setOption(id, value))) throw new Error('option refused');
      // Back to the default: forget it, so a future default applies.
      if (value === baseline(id)) delete saved[id];
      else saved[id] = value;
      fetch(`${api}/options`, { method: 'PUT', body: JSON.stringify(saved) });
    },
    // Every option chosen for this game back to its baseline, one at a time (the controller keeps one reply per type).
    async resetOptions() {
      for (const key of Object.keys(saved)) {
        if (baseline(key) !== undefined && !(await ctl.setOption(key, baseline(key)))) throw new Error('option refused');
        delete saved[key];
      }
      await fetch(`${api}/options`, { method: 'PUT', body: '{}' });
    },
    // The emulated controller (Wii: Wii Remote, + Nunchuk...), saved for this game like an option.
    emulated: () => ctl.devices().then((d) => (d?.list.length > 1 ? d : null)),
    setEmulated(id) { return this.setOption(deviceKey, String(id)); },
    exit: back,
  };
}

// What the in-game menu needs from the local core (local.js): one player, no pause, no states, no options.
function localAdapter(game, ctl, defaults) {
  const { volume } = ctl;
  return {
    game,
    players: 1,
    block: (on) => { ctl.blocked = on; },
    restart: () => ctl.reset(),
    volume: () => volume.level,
    muted: () => volume.muted,
    setVolume: (v) => { volume.level = v; volume.apply(); },
    setMuted: (m) => { volume.muted = m; volume.apply(); },
    defaultControls: defaults,
    applyControls: (m) => { ctl.controls = m; },
    exit: back,
  };
}

// Play time: seconds with the game on screen, sent every minute and when the page is hidden or closed.
function playtime(gameId) {
  let from = document.hidden ? 0 : performance.now();
  const send = () => {
    if (!from) return;
    const seconds = (performance.now() - from) / 1000;
    from = document.hidden ? 0 : performance.now();
    if (seconds >= 1) fetch(`/api/games/${gameId}/playtime?seconds=${seconds.toFixed(0)}`, { method: 'POST', keepalive: true });
  };
  setInterval(send, 60000);
  addEventListener('visibilitychange', () => (document.hidden ? send() : (from = performance.now())));
  addEventListener('pagehide', send);
}

// Browsers expose a gamepad only after one of its buttons is pressed on this page: say when it happens.
addEventListener('gamepadconnected', ({ gamepad }) => toast(`🎮 ${gamepad.id}`));

// Pad shortcuts. Home (button 16) opens and closes the in-game menu; so does Select + Start, for pads whose Home never
// reaches the page (Chrome on Windows keeps the Xbox Guide button for itself). Keyboard: Esc. Select + R saves a state.
// Leaving the game is the menu's Esci (keyboard: Shift+Esc).
let rWas = false;
let homeWas = true; // a Home still down from the previous page must not open the menu at once
function poll() {
  const pads = [...navigator.getGamepads()].filter(Boolean);
  const down = (i) => pads.some((gp) => gp.buttons[i]?.pressed);
  const select = down(8);
  const home = document.hasFocus() && (down(16) || (select && down(9)));
  if (home && !homeWas) menu?.toggle();
  homeWas = home;
  if (!menu?.isOpen()) {
    const r = select && down(5);
    if (r && !rWas) combos.saveState?.();
    rWas = r;
  }
  requestAnimationFrame(poll);
}
requestAnimationFrame(poll);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (e.shiftKey) return back();
  // Inside the menu nav.js turns Esc into Back (and marks it handled); here it only opens the menu.
  if (!e.defaultPrevented && menu && !menu.isOpen()) {
    e.preventDefault();
    menu.open();
  }
});
