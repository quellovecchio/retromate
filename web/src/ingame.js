// In-game menu: a dashboard over the paused game, opened with the pad's Home button (16) or Esc. A command bar on top,
// the game's card and the volume on the left, the players on the right; bigger tasks (load a state, controller
// mapping, emulator options, quit) open as a panel in the middle. It knows nothing about the emulator: everything
// goes through the adapter play.js builds (EmulatorJS today, the streaming client later).
//
// adapter: { game, block(on), restart(), volume(), muted(), setVolume(0..1), setMuted(bool),
//            defaultControls() -> model, applyControls(model), exit() }
//   optional: pause(), resume()  (missing: the game runs under the menu, no In pausa),
//             saveState() -> Promise<name|null>, states() -> Promise<[{name, time, screenshot}]>, loadState(name)
//             (missing: no save states), players (default 4), keyMap {keyCode: name},
//             options() -> Promise<[Category]>, setOption(id, value)  (missing: Opzioni is disabled),
//             resetOptions() -> Promise  (back to the defaults; missing: no reset button)
//             emulated() -> Promise<{ list: [Device], device: id } | null>, setEmulated(id) -> Promise  (the controller
//             the emulator plugs in for player 1, e.g. a Wii Remote; missing or null: no choice)
// Device = { id, name, inputs?: { input: what it does }, sticks?: [left, right] }  (missing: the RetroPad's names)
// Controls model, saved per console on the server: { players: [{ device: 'keyboard' | 'none' | 'pad:<id>',
//            keys: { input: keyCode }, pad: { input: EmulatorJS gamepad label } } x 4] }
// Options, whatever the emulator offers: Category = { label, icon (Phosphor name), items: [Node] },
//            Node = { label, children: [Node] } (a branch) or { id, label, note?, value, values: [{ value, label }] }.
import '@phosphor-icons/web/regular';
import './ingame.css';
import { box, caseOf, esc, playtimeText, stamp } from './box.js';
import { getSwap } from './nav.js';

const root = document.documentElement;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const PLAYERS = 4;

// RetroPad inputs by EmulatorJS number, grouped as they sit on a pad.
const INPUTS = [
  ['Pulsanti', [[8, 'A'], [0, 'B'], [9, 'X'], [1, 'Y']]],
  ['Croce', [[4, 'Su', 'arrow-up'], [5, 'Giù', 'arrow-down'], [6, 'Sinistra', 'arrow-left'], [7, 'Destra', 'arrow-right']]],
  ['Dorsali', [[10, 'L'], [11, 'R'], [12, 'L2'], [13, 'R2']]],
  ['Sistema', [[2, 'Select'], [3, 'Start'], [14, 'L3'], [15, 'R3']]],
  ['Stick sinistro', [[19, 'Su', 'arrow-up'], [18, 'Giù', 'arrow-down'], [17, 'Sinistra', 'arrow-left'], [16, 'Destra', 'arrow-right']]],
  ['Stick destro', [[23, 'Su', 'arrow-up'], [22, 'Giù', 'arrow-down'], [21, 'Sinistra', 'arrow-left'], [20, 'Destra', 'arrow-right']]],
];

// EmulatorJS names pad buttons by standard-mapping position; show them the way an Xbox-style pad prints them.
const BUTTONS = ['BUTTON_1', 'BUTTON_2', 'BUTTON_3', 'BUTTON_4', 'LEFT_TOP_SHOULDER', 'RIGHT_TOP_SHOULDER', 'LEFT_BOTTOM_SHOULDER',
  'RIGHT_BOTTOM_SHOULDER', 'SELECT', 'START', 'LEFT_STICK', 'RIGHT_STICK', 'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT'];
const BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', 'Croce su', 'Croce giù',
  'Croce sinistra', 'Croce destra'];
// Nintendo pads (vendor 057e) print B at the bottom, A on the right, Y left, X on top; ZL/ZR, minus and plus.
const NINTENDO_NAMES = ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', 'Tasto -', 'Tasto +', 'L3', 'R3', 'Croce su', 'Croce giù',
  'Croce sinistra', 'Croce destra'];
const AXES = ['LEFT_STICK_X', 'LEFT_STICK_Y', 'RIGHT_STICK_X', 'RIGHT_STICK_Y'];
const AXIS_NAMES = { LEFT_STICK_X: ['Stick sx a sinistra', 'Stick sx a destra'], LEFT_STICK_Y: ['Stick sx su', 'Stick sx giù'],
  RIGHT_STICK_X: ['Stick dx a sinistra', 'Stick dx a destra'], RIGHT_STICK_Y: ['Stick dx su', 'Stick dx giù'] };
const HOME = 16; // opens and closes this menu: never offered as a binding

function padName(label, nintendo) {
  if (label === undefined || label === null || label === '') return null;
  const i = BUTTONS.indexOf(label);
  if (i >= 0) return (nintendo ? NINTENDO_NAMES : BUTTON_NAMES)[i];
  const [axis, dir] = String(label).split(':');
  if (AXIS_NAMES[axis]) return AXIS_NAMES[axis][dir === '+1' ? 1 : 0];
  return `Tasto ${String(label).replace('GAMEPAD_', '')}`;
}
const KEY_NAMES = { 8: 'Backspace', 9: 'Tab', 13: 'Invio', 16: 'Maiusc', 17: 'Ctrl', 18: 'Alt', 32: 'Spazio', 37: 'Freccia sinistra',
  38: 'Freccia su', 39: 'Freccia destra', 40: 'Freccia giù' };
const keyName = (code, keyMap) => {
  if (code === undefined || code === null) return null;
  const k = keyMap?.[code];
  if (k) return k.replace(/\b\w/g, (c) => c.toUpperCase());
  return KEY_NAMES[code] ?? (/[0-9A-Z]/.test(String.fromCharCode(code)) ? String.fromCharCode(code) : `Tasto ${code}`);
};
// "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e ...)" -> "Xbox Wireless Controller"
const shortPad = (id) => id.replace(/\s*\(.*$/, '').trim() || 'Controller';
const connectedPads = () => [...navigator.getGamepads()].filter(Boolean);

// Mappings saved for this console, or null when none were saved yet.
export async function loadControls(platform) {
  try {
    const r = await fetch(`/api/controls/${platform}`);
    const m = r.ok ? await r.json() : null;
    return m?.players?.length === PLAYERS ? m : null;
  } catch {
    return null;
  }
}

// The commands, shared by both layouts.
const cmd = (name, icon, label) => `<button class="ig-cmd" data-cmd="${name}"><i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span></button>`;
const CMD = {
  resume: cmd('resume', 'play', 'Riprendi'),
  hold: cmd('hold', 'pause', 'In pausa'),
  restart: cmd('restart', 'arrow-counter-clockwise', 'Riavvia'),
  save: cmd('save', 'floppy-disk', 'Salva stato'),
  load: cmd('load', 'clock-counter-clockwise', 'Carica stato'),
  controls: cmd('controls', 'game-controller', 'Controller'),
  options: cmd('options', 'sliders-horizontal', 'Opzioni'),
  exit: cmd('exit', 'sign-out', 'Esci'),
};
const SEP = '<span class="ig-sep" aria-hidden="true"></span>';

// variant 'vetrina' (chosen in Opzioni, or play.html?menu=vetrina): the box is the centrepiece on a lit plinth and the
// commands hang on two shelves either side of it, facing it; the box turns toward the shelf that has focus.
// Default ('bar'): the game bar.
export function ingame(adapter, saved, { variant } = {}) {
  const vetrina = variant === 'vetrina';
  const g = adapter.game;
  const c = caseOf(g.platform);
  const started = Date.now();
  const players = adapter.players ?? PLAYERS;
  let controls = saved ?? adapter.defaultControls(); // what the emulator uses now
  let held = false; // the player paused from the menu: closing leaves the game paused
  let panel = null; // { el, name, trigger, back? }
  let capture = null; // remapping: waiting for a key or button
  let clock;

  const dlg = document.createElement('dialog');
  dlg.className = 'ingame';
  if (vetrina) dlg.dataset.variant = 'vetrina';
  dlg.setAttribute('aria-label', `Menu di gioco, ${g.title}`);
  dlg.style.setProperty('--bh', c.hue);
  dlg.innerHTML = `
    <div class="ig">
      ${vetrina ? `
      <p class="ig-top"><time class="ig-clock"></time></p>
      <nav class="ig-shelf ig-shelf-l" aria-label="Partita">${CMD.resume}${CMD.hold}${CMD.restart}${CMD.exit}</nav>
      <nav class="ig-shelf ig-shelf-r" aria-label="Salvataggi e impostazioni">${CMD.save}${CMD.load}${CMD.controls}${CMD.options}</nav>`
      : `
      <nav class="ig-bar" data-row aria-label="Comandi">
        <time class="ig-clock"></time>
        ${CMD.resume}${CMD.hold}${CMD.restart}${SEP}${CMD.save}${CMD.load}${SEP}${CMD.controls}${CMD.options}${SEP}${CMD.exit}
      </nav>`}

      <section class="ig-w ig-game" aria-labelledby="ig-title">
        <div class="ig-box">${box(g, { lazy: false })}</div>
        <p class="ig-plat"><span class="ig-short">${esc(c.short)}</span>${esc(g.platform_name)}</p>
        <h2 id="ig-title" class="ig-title">${esc(g.title)}</h2>
        <dl class="ig-stats">
          <div><dt>Tempo di gioco</dt><dd data-stat="total"></dd></div>
          <div><dt>Questa sessione</dt><dd data-stat="session"></dd></div>
          <div><dt>Ultimo stato</dt><dd data-stat="state">-</dd></div>
        </dl>
      </section>

      <section class="ig-w ig-volume" aria-labelledby="ig-vol-title">
        <h2 id="ig-vol-title" class="ig-w-title"><i class="ph ph-speaker-high" aria-hidden="true"></i>Volume<output class="ig-vol-value"></output></h2>
        <div class="ig-rocker" data-row>
          <button class="ig-round" data-vol="-1" aria-label="Abbassa il volume"><i class="ph ph-minus" aria-hidden="true"></i></button>
          <span class="ig-meter" aria-hidden="true">${'<i></i>'.repeat(10)}</span>
          <button class="ig-round" data-vol="1" aria-label="Alza il volume"><i class="ph ph-plus" aria-hidden="true"></i></button>
          <button class="ig-round" data-vol="mute" aria-pressed="false" aria-label="Muto"><i class="ph ph-speaker-slash" aria-hidden="true"></i></button>
        </div>
      </section>

      <section class="ig-w ig-players" aria-labelledby="ig-pl-title">
        <h2 id="ig-pl-title" class="ig-w-title"><i class="ph ph-users-three" aria-hidden="true"></i>Giocatori</h2>
        <ol class="ig-slots"></ol>
        <button class="ig-link" data-cmd="controls">Configura i controller<i class="ph ph-caret-right" aria-hidden="true"></i></button>
      </section>

      <div class="ig-stage"></div>

      <p class="ig-hints hints" aria-hidden="true">
        <span><b class="pad-btn" data-btn="ok">A</b>Seleziona</span>
        <span><b class="pad-btn" data-btn="back">B</b>Indietro</span>
        <span><b class="pad-btn pad-btn-wide">Home</b>Chiudi il menu</span>
      </p>
      <p class="ig-toast" role="status"></p>
    </div>`;
  document.body.append(dlg);
  const $ = (s) => dlg.querySelector(s);
  const stage = $('.ig-stage');
  const dash = [...dlg.querySelectorAll('.ig-bar, .ig-top, .ig-shelf, .ig-game, .ig-volume, .ig-players')];
  // What this emulator can't do (see the adapter contract)
  const missing = [['options', !adapter.options], ['hold', !adapter.pause]];
  for (const [name, off] of missing) if (off) $(`[data-cmd="${name}"]`).disabled = true;
  // No save states (PS3, Switch): both commands go, and in the bar the separator before them.
  if (!adapter.saveState) {
    const save = $('[data-cmd="save"]');
    if (save.previousElementSibling?.matches('.ig-sep')) save.previousElementSibling.hidden = true;
    save.hidden = $('[data-cmd="load"]').hidden = true;
  }
  // Vetrina: the box turns to face the shelf where focus is (its spine shows on the other side).
  if (vetrina) dlg.addEventListener('focusin', (e) => {
    const side = e.target.closest('.ig-shelf');
    dlg.style.setProperty('--lean', side ? (side.classList.contains('ig-shelf-l') ? '22deg' : '-22deg') : '0deg');
  });

  // Paused from the menu: a quiet pill on the game says so and how to come back.
  const pausedPill = Object.assign(document.createElement('button'), { className: 'ig-paused', type: 'button', tabIndex: -1 });
  pausedPill.innerHTML = '<i class="ph ph-pause" aria-hidden="true"></i>In pausa<span>Home, o tocca qui</span>';
  pausedPill.hidden = true;
  pausedPill.addEventListener('pointerdown', (e) => e.preventDefault());
  pausedPill.addEventListener('click', () => open());
  document.body.append(pausedPill);

  // Touch and mouse have no Home button: a quiet corner button opens the menu (hidden while a pad is in use).
  const fab = Object.assign(document.createElement('button'), { className: 'ig-fab', type: 'button' });
  fab.setAttribute('aria-label', 'Apri il menu di gioco');
  fab.innerHTML = '<i class="ph ph-list" aria-hidden="true"></i>';
  fab.tabIndex = -1; // never keeps focus: Enter during play is the game's Start, not a click on this
  fab.addEventListener('pointerdown', (e) => e.preventDefault());
  fab.addEventListener('click', () => open());
  document.body.append(fab);

  function toast(text) {
    const t = $('.ig-toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  // ---------- Dashboard state

  function renderBar() {
    $('.ig-clock').textContent = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  function renderStats(lastState) {
    const session = (Date.now() - started) / 1000;
    $('[data-stat="total"]').textContent = playtimeText((g.playtime || 0) + session);
    $('[data-stat="session"]').textContent = playtimeText(session);
    if (lastState !== undefined) $('[data-stat="state"]').textContent = lastState ? stamp.format(lastState * 1000) : 'Nessuno';
  }
  function renderVolume() {
    const v = Math.round(adapter.volume() * 10);
    const muted = adapter.muted();
    $('.ig-vol-value').textContent = muted ? 'Muto' : `${v * 10}%`;
    dlg.querySelectorAll('.ig-meter i').forEach((el, i) => el.toggleAttribute('data-on', !muted && i < v));
    $('[data-vol="mute"]').setAttribute('aria-pressed', muted);
    $('.ig-volume').toggleAttribute('data-muted', muted);
  }
  const deviceOf = (p) => {
    const d = controls.players[p].device;
    if (d === 'keyboard') return { icon: 'keyboard', name: 'Tastiera' };
    if (d?.startsWith('pad:')) {
      const id = d.slice(4);
      return { icon: 'game-controller', name: shortPad(id), off: !connectedPads().some((gp) => gp.id === id) };
    }
    return { icon: 'minus-circle', name: 'Nessuno', none: true };
  };
  function renderSlots() {
    $('.ig-slots').innerHTML = controls.players.slice(0, players).map((_, p) => {
      const d = deviceOf(p);
      return `<li${d.none ? ' data-none' : ''}><span class="ig-slot-n">G${p + 1}</span><i class="ph ph-${d.icon}" aria-hidden="true"></i>
        <span class="ig-slot-name">${esc(d.name)}${d.off ? '<small>non collegato</small>' : ''}</span></li>`;
    }).join('');
  }
  function relabel() {
    dlg.querySelectorAll('[data-btn]').forEach((b) => { b.textContent = (b.dataset.btn === 'ok') === getSwap() ? 'B' : 'A'; });
  }
  async function refreshLastState() {
    try { renderStats((await adapter.states?.())?.[0]?.time ?? null); } catch { renderStats(null); }
  }

  // ---------- Open / close: the game pulls back under a dimmed, blurred set; the bar drops in, the cards slide in
  // from their sides and the box swings round to face you. Closing reverses it, faster.

  function open() {
    if (dlg.open) return;
    adapter.pause?.();
    adapter.block(true);
    renderBar(); renderStats(); renderVolume(); renderSlots(); relabel(); refreshLastState();
    clock = setInterval(() => { renderBar(); renderStats(); }, 10000);
    pausedPill.hidden = true;
    dlg.dataset.state = 'opening';
    dlg.showModal();
    root.removeAttribute('data-nav-lock'); // nav.js drives the menu
    document.body.dataset.ingame = '';
    requestAnimationFrame(() => requestAnimationFrame(() => { dlg.dataset.state = 'open'; }));
    $('[data-cmd="resume"]').focus({ preventScroll: true });
  }

  function close() {
    if (!dlg.open || dlg.dataset.state === 'closing') return;
    stopCapture();
    clearInterval(clock);
    dlg.dataset.state = 'closing';
    delete document.body.dataset.ingame;
    root.setAttribute('data-nav-lock', ''); // the pad belongs to the game again
    setTimeout(() => {
      dlg.close();
      document.activeElement?.blur?.(); // nothing on the page keeps focus while the game has the keys
      closePanel(true);
      dlg.dataset.state = '';
      adapter.block(false);
      if (held) pausedPill.hidden = false;
      else adapter.resume?.();
    }, reduce() ? 0 : 230);
  }
  const toggle = () => (dlg.open && dlg.dataset.state !== 'closing' ? close() : open());

  // B / Esc: cancel a capture, then step back inside a panel, then close the panel, then close the menu.
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (capture) return stopCapture();
    if (panel?.back?.()) return;
    if (panel) return closePanel();
    close();
  });
  // A click on the bare set (not on a card or panel) steps back like B does.
  dlg.addEventListener('click', (e) => {
    if (e.target !== dlg && !e.target.classList.contains('ig')) return;
    if (panel) closePanel();
    else close();
  });

  // ---------- Panels in the middle of the dashboard

  function openPanel(name, trigger, title, body, init) {
    closePanel(true);
    const el = document.createElement('section');
    el.className = `ig-panel ig-panel-${name}`;
    el.setAttribute('aria-labelledby', `ig-panel-${name}`);
    el.innerHTML = `<header class="ig-panel-head"><h2 id="ig-panel-${name}">${title}</h2>
      <button class="ig-x" aria-label="Chiudi"><i class="ph ph-x" aria-hidden="true"></i></button></header>${body}`;
    stage.append(el);
    panel = { el, name, trigger };
    dash.forEach((d) => { d.inert = true; });
    el.querySelector('.ig-x').addEventListener('click', () => closePanel());
    init?.(el, panel);
    (el.querySelector('[data-autofocus]') ?? el.querySelector('button:not(.ig-x)'))?.focus({ preventScroll: true });
  }
  function closePanel(instant) {
    if (!panel) return;
    const { el, trigger } = panel;
    panel = null;
    dash.forEach((d) => { d.inert = false; });
    if (instant || reduce()) el.remove();
    else {
      el.classList.add('out');
      setTimeout(() => el.remove(), 160);
    }
    if (!instant) trigger?.focus({ preventScroll: true });
  }

  // Load a state: the screenshots, newest first. Picking one loads it and drops you back in the game.
  function statesPanel(trigger) {
    openPanel('load', trigger, 'Carica stato', '<div class="ig-states"><p class="ig-note">Carico gli stati salvati…</p></div>', async (el) => {
      const list = el.querySelector('.ig-states');
      let states;
      try { states = await adapter.states(); } catch { states = null; }
      if (!states) return void (list.innerHTML = '<p class="ig-note">Non riesco a leggere gli stati salvati: controlla che il server sia avviato.</p>');
      if (!states.length) {
        list.innerHTML = '<p class="ig-note">Nessuno stato salvato per questo gioco. Usa Salva stato nella barra in alto.</p>';
        return;
      }
      list.innerHTML = states.map((s, i) => `
        <button class="ig-state" data-state="${esc(s.name)}"${i ? '' : ' data-autofocus'}>
          ${s.screenshot ? `<img src="/api/games/${g.id}/states/${esc(s.name)}/screenshot" alt="">` : '<span class="ig-shot" aria-hidden="true"><i class="ph ph-image"></i></span>'}
          <span>${stamp.format(s.time * 1000)}</span>
        </button>`).join('');
      list.addEventListener('click', (e) => {
        const b = e.target.closest('.ig-state');
        if (!b) return;
        adapter.loadState(b.dataset.state);
        held = false;
        close();
      });
      el.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
    });
  }

  // Restart: one A from the default focus would lose everything since the last save, so it asks.
  function restartPanel(trigger) {
    openPanel('restart', trigger, 'Riavviare il gioco?',
      `<p class="ig-note">Il gioco riparte dall'inizio: i progressi dopo l'ultimo salvataggio si perdono.</p>
       <div class="ig-actions" data-row>
         <button class="ig-btn" data-act="stay" data-autofocus>Annulla</button>
         <button class="ig-btn ig-btn-go" data-act="restart"><i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>Riavvia</button>
       </div>`, (el) => {
        el.querySelector('[data-act="stay"]').addEventListener('click', () => closePanel());
        el.querySelector('[data-act="restart"]').addEventListener('click', () => {
          adapter.restart();
          held = false;
          close();
        });
      });
  }

  // Quit: a plain confirmation. The in-game save goes to the server either way (adapter.exit flushes it).
  function exitPanel(trigger) {
    const session = playtimeText((Date.now() - started) / 1000).toLowerCase();
    openPanel('exit', trigger, 'Uscire dal gioco?',
      `<p class="ig-note">Hai giocato ${session} in questa sessione. Il salvataggio fatto nel gioco è al sicuro sul server; i progressi dopo l'ultimo salvataggio si perdono.</p>
       <div class="ig-actions" data-row>
         <button class="ig-btn" data-act="stay" data-autofocus>Resta</button>
         <button class="ig-btn ig-btn-go" data-act="leave"><i class="ph ph-sign-out" aria-hidden="true"></i>Esci</button>
       </div>`, (el) => {
        el.querySelector('[data-act="stay"]').addEventListener('click', () => closePanel());
        el.querySelector('[data-act="leave"]').addEventListener('click', async (e) => {
          e.currentTarget.disabled = true;
          e.currentTarget.lastChild.textContent = 'Esco…';
          await adapter.exit();
        });
      });
  }

  // ---------- Controller mapping: four players, a device each, every input rebindable. Edits stay in a draft until
  // Salva (server, per console) or are dropped with Annulla; Ripristina puts the emulator's defaults in the draft.

  function controlsPanel(trigger) {
    let draft = structuredClone(controls);
    let player = 0;
    let asking = false; // B pressed with unsaved edits: say so once, a second B drops them
    let emu = null; // the emulated controller: applied and saved (per game) at once, not part of the draft
    openPanel('controls', trigger, 'Controller', '<div class="ig-ctl"></div>', (el, pn) => {
      const host = el.querySelector('.ig-ctl');
      adapter.emulated?.().then((e) => { emu = e; if (e && !capture) render(); }).catch(() => {});
      const dirty = () => JSON.stringify(draft) !== JSON.stringify(controls);
      const render = (focusSel) => {
        const pl = draft.players[player];
        const pads = connectedPads();
        const devices = [...pads.map((gp) => [`pad:${gp.id}`, shortPad(gp.id), 'game-controller']), ['keyboard', 'Tastiera', 'keyboard'], ['none', 'Nessuno', 'minus-circle']];
        if (pl.device.startsWith('pad:') && !devices.some(([d]) => d === pl.device)) devices.unshift([pl.device, `${shortPad(pl.device.slice(4))} (non collegato)`, 'game-controller']);
        const usesPad = pl.device.startsWith('pad:');
        const binding = (i) => (usesPad ? padName(pl.pad[i], /057e/i.test(pl.device)) : keyName(pl.keys[i], adapter.keyMap));
        const as = player === 0 && emu?.list.find((d) => d.id === emu.device); // what player 1's inputs do in the game
        const stickOf = (i) => (i >= 16 ? +(i >= 20) : -1);
        const does = (i) => (stickOf(i) < 0 ? as?.inputs?.[i] : as?.sticks?.[stickOf(i)]);
        const unused = (i) => as?.inputs && i < 16 && !(i >= 4 && i <= 7) && !does(i); // the d-pad and sticks always count
        host.innerHTML = `
          ${players > 1 ? `<div class="ig-tabs" data-row role="tablist" aria-label="Giocatore">${draft.players.slice(0, players).map((_, p) => `
            <button class="ig-chip" role="tab" data-player="${p}" aria-selected="${p === player}"${p === player ? ' aria-current="true"' : ''}>Giocatore ${p + 1}</button>`).join('')}
          </div>` : ''}
          <div class="ig-devices" data-row role="group" aria-label="Dispositivo del giocatore ${player + 1}">${devices.map(([d, name, icon]) => `
            <button class="ig-chip" data-device="${esc(d)}" aria-pressed="${pl.device === d}"${pl.device === d ? ' aria-current="true"' : ''}><i class="ph ph-${icon}" aria-hidden="true"></i><span>${esc(name)}</span></button>`).join('')}
          </div>
          ${player === 0 && emu ? `
          <h3 class="ig-ctl-title">Controller emulato <small>salvato per questo gioco</small></h3>
          <div class="ig-devices" data-row role="group" aria-label="Controller emulato">${emu.list.map((d) => `
            <button class="ig-chip" data-emu="${d.id}" aria-pressed="${d.id === emu.device}"${d.id === emu.device ? ' aria-current="true"' : ''}><i class="ph ph-plug" aria-hidden="true"></i><span>${esc(d.name)}</span></button>`).join('')}
          </div>` : ''}
          ${pl.device === 'none' ? '<p class="ig-note">Nessun dispositivo: questo giocatore non partecipa.</p>' : `
          <div class="ig-map">${INPUTS.map(([group, list]) => `
            <div class="ig-map-group" role="group" aria-label="${group}"><h3>${group}${does(list[0][0]) && stickOf(list[0][0]) >= 0 ? ` <small>${esc(does(list[0][0]))}</small>` : ''}</h3>${list.map(([i, name, icon]) => {
              const b = binding(i);
              const waiting = capture?.input === i;
              const act = stickOf(i) < 0 && does(i);
              return `<button class="ig-bind" data-input="${i}"${waiting ? ' data-waiting' : ''}${unused(i) ? ' data-unused' : ''}>
                <span class="ig-bind-in">${icon ? `<i class="ph ph-${icon}" aria-hidden="true"></i><span class="sr-only">${name}</span>` : name}${act ? `<small class="ig-bind-as">${esc(act)}</small>` : ''}</span>
                <span class="ig-bind-out">${waiting ? (usesPad ? 'Premi un tasto del controller…' : 'Premi un tasto (Esc annulla)') : b ? esc(b) : '<em>Non assegnato</em>'}</span>
              </button>`;
            }).join('')}</div>`).join('')}
          </div>`}
          ${asking ? '<p class="ig-ask" role="status">Modifiche non salvate. Salva per tenerle, B di nuovo per scartarle.</p>' : ''}
          <div class="ig-actions" data-row>
            <button class="ig-btn" data-act="reset"><i class="ph ph-arrow-u-up-left" aria-hidden="true"></i>Ripristina</button>
            <button class="ig-btn" data-act="cancel"${dirty() ? '' : ' disabled'}>Annulla</button>
            <button class="ig-btn ig-btn-go" data-act="save"${dirty() ? '' : ' disabled'}><i class="ph ph-check" aria-hidden="true"></i>Salva</button>
          </div>`;
        (focusSel && host.querySelector(focusSel))?.focus({ preventScroll: true });
      };
      pn.render = render;
      render('[aria-current="true"]');
      // Back with unsaved edits asks first: one B points at Salva, a second one drops the edits and closes.
      pn.back = () => {
        if (!dirty()) return false;
        if (!asking) {
          asking = true;
          render('[data-act="save"]');
          return true;
        }
        draft = structuredClone(controls);
        toast('Modifiche scartate');
        return false;
      };
      host.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        asking = false;
        if (b.dataset.player) { player = +b.dataset.player; render(`[data-player="${player}"]`); }
        else if (b.dataset.emu) {
          const d = emu.list.find((x) => x.id === +b.dataset.emu);
          try {
            await adapter.setEmulated(d.id);
            emu.device = d.id;
            toast(`${d.name} collegato per questo gioco`);
          } catch {
            toast('Il core non accetta questo controller');
          }
          render(`[data-emu="${d.id}"]`);
        }
        else if (b.dataset.device) {
          // A pad belongs to one player at a time: taking it frees it elsewhere.
          if (b.dataset.device.startsWith('pad:')) draft.players.forEach((p, i) => { if (i !== player && p.device === b.dataset.device) p.device = 'none'; });
          draft.players[player].device = b.dataset.device;
          render(`[data-device="${CSS.escape(b.dataset.device)}"]`);
        } else if (b.dataset.input) startCapture(draft, player, +b.dataset.input, render);
        else if (b.dataset.act === 'reset') {
          draft.players[player] = adapter.defaultControls().players[player];
          render('[data-act="reset"]');
          toast(`Comandi predefiniti per il giocatore ${player + 1}: premi Salva per usarli`);
        }
        else if (b.dataset.act === 'cancel') { draft = structuredClone(controls); render('[data-act="reset"]'); }
        else if (b.dataset.act === 'save') {
          b.disabled = true;
          try {
            const r = await fetch(`/api/controls/${g.platform}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
            if (!r.ok) throw new Error(r.status);
            controls = structuredClone(draft);
            adapter.applyControls(controls);
            renderSlots();
            render('[data-act="reset"]');
            toast(`Controller salvati per ${c.short}`);
          } catch {
            b.disabled = false;
            toast('Non riesco a salvare: controlla che il server sia avviato');
          }
        }
      });
    });
  }

  // Waiting for the new key or button. The pad stops driving the menu meanwhile; Esc, or 6 seconds, gives up.
  function startCapture(draft, player, input, render) {
    stopCapture();
    const pl = draft.players[player];
    const usesPad = pl.device.startsWith('pad:');
    capture = { input };
    render(`[data-input="${input}"]`);
    const done = (value) => {
      stopCapture();
      if (value !== undefined) (usesPad ? pl.pad : pl.keys)[input] = value;
      render(`[data-input="${input}"]`);
      if (value !== undefined) panel?.el.querySelector(`[data-input="${input}"]`)?.setAttribute('data-bound', '');
    };
    capture.timer = setTimeout(() => { done(); toast('Nessun tasto premuto: comando invariato'); }, 6000);
    if (!usesPad) {
      capture.key = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        done(e.key === 'Escape' ? undefined : e.keyCode);
      };
      addEventListener('keydown', capture.key, true);
      return;
    }
    // Only presses that start now count: whatever is held (the A that opened this) must be released first.
    root.setAttribute('data-nav-lock', '');
    const id = pl.device.slice(4);
    const pad = () => connectedPads().find((gp) => gp.id === id);
    const was = new Set((pad()?.buttons ?? []).flatMap((b, i) => (b.pressed ? [i] : [])));
    capture.key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(); } };
    addEventListener('keydown', capture.key, true);
    const poll = () => {
      if (!capture) return;
      const gp = pad();
      if (gp) {
        for (const [i, b] of gp.buttons.entries()) {
          if (!b.pressed) was.delete(i);
          else if (!was.has(i) && i !== HOME) return done(BUTTONS[i] ?? `GAMEPAD_${i}`);
        }
        for (const [a, v] of gp.axes.slice(0, 4).entries()) if (Math.abs(v) > 0.7) return done(`${AXES[a]}:${v > 0 ? '+1' : '-1'}`);
      }
      capture.raf = requestAnimationFrame(poll);
    };
    capture.raf = requestAnimationFrame(poll);
  }
  function stopCapture() {
    if (!capture) return;
    clearTimeout(capture.timer);
    cancelAnimationFrame(capture.raf);
    if (capture.key) removeEventListener('keydown', capture.key, true);
    capture = null;
    // The button just bound is still down: give the pad back to the menu once it is released (nav.js skips held ones).
    if (dlg.open && dlg.dataset.state !== 'closing') root.removeAttribute('data-nav-lock');
  }

  // ---------- Emulator options: whatever adapter.options() returns, as a tree. A opens a branch, flips a two-value
  // option or opens the list of values (A picks one); B climbs back up. Under the categories, Ripristina predefinite
  // (when the adapter can) asks first, in the list's place.

  function optionsPanel(trigger) {
    let tree = null;
    let cat = 0;
    let resetting = false; // the reset confirmation is on show
    const path = []; // indexes from the category down; the last can be an option whose values are on show
    openPanel('options', trigger, 'Opzioni emulatore',
      `<div class="ig-opts">
        <div class="ig-cats" role="tablist" aria-orientation="vertical" data-col></div>
        <div class="ig-opt-list" data-col><p class="ig-note">Carico le opzioni…</p></div>
      </div>`, async (el, pn) => {
        const cats = el.querySelector('.ig-cats');
        const list = el.querySelector('.ig-opt-list');
        const load = async () => {
          try { tree = (await adapter.options()).filter((c) => c.items?.length); } catch { tree = null; }
        };
        await load();
        if (!tree?.length) {
          list.innerHTML = `<p class="ig-note">${tree ? 'Questo emulatore non ha opzioni da regolare.' : 'Non riesco a leggere le opzioni dell\'emulatore.'}</p>`;
          return;
        }
        const nodeAt = (depth) => path.slice(0, depth).reduce((n, i) => (n.items ?? n.children)[i], tree[cat]);
        const valueLabel = (o) => o.values.find((v) => v.value === o.value)?.label ?? String(o.value ?? '');
        const render = (focus = 0) => {
          cats.innerHTML = tree.map((c, i) => `
            <button class="ig-cat" role="tab" data-cat="${i}" aria-selected="${i === cat}"${i === cat ? ' aria-current="true"' : ''}><i class="ph ph-${esc(c.icon ?? 'sliders-horizontal')}" aria-hidden="true"></i>${esc(c.label)}</button>`).join('')
            + (adapter.resetOptions ? '<button class="ig-cat ig-reset" data-reset><i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>Ripristina predefinite</button>' : '');
          const node = nodeAt(path.length);
          const crumbs = [tree[cat], ...path.map((_, d) => nodeAt(d + 1))].map((n) => esc(n.label));
          list.innerHTML = `<p class="ig-crumbs">${crumbs.join('<i class="ph ph-caret-right" aria-hidden="true"></i>')}</p>${node.values
            ? `<div class="ig-opt-items" role="radiogroup" aria-label="${esc(node.label)}">${node.values.map((v, i) => `
              <button class="ig-opt" role="radio" data-val="${i}" aria-checked="${v.value === node.value}"><i class="ph ph-check" aria-hidden="true"></i><span>${esc(v.label)}</span></button>`).join('')}</div>`
            : `<div class="ig-opt-items">${(node.items ?? node.children).map((it, i) => `
              <button class="ig-opt" data-opt="${i}">
                <span>${esc(it.label)}${it.note ? `<small>${esc(it.note)}</small>` : ''}</span>
                ${it.children ? '<i class="ph ph-caret-right" aria-hidden="true"></i>' : `<span class="ig-value">${esc(valueLabel(it))}</span>`}
              </button>`).join('')}</div>`}`;
          const opts = list.querySelectorAll('.ig-opt');
          (opts[focus] ?? opts[0])?.focus({ preventScroll: true });
          opts[focus]?.scrollIntoView({ block: 'nearest', container: 'nearest' }); // the list only, not the panel
        };
        const set = async (o, value) => {
          const was = o.value;
          o.value = value;
          try { await adapter.setOption(o.id, value); } catch { o.value = was; toast('Opzione non applicata'); }
        };
        const stepped = (i) => {
          const v = list.querySelectorAll('.ig-opt')[i]?.querySelector('.ig-value');
          v?.classList.add('stepped');
        };
        const confirmReset = () => {
          resetting = true;
          path.length = 0;
          list.innerHTML = `<p class="ig-crumbs">Ripristina predefinite</p>
            <p class="ig-note">Tutte le opzioni di questo gioco tornano ai valori predefiniti. Alcune valgono solo dal prossimo avvio.</p>
            <div class="ig-actions" data-row>
              <button class="ig-btn" data-act="keep">Annulla</button>
              <button class="ig-btn ig-btn-go" data-act="reset"><i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>Ripristina</button>
            </div>`;
          list.querySelector('[data-act="keep"]').focus({ preventScroll: true });
        };
        render();
        pn.back = () => {
          if (resetting) {
            resetting = false;
            render();
            return true;
          }
          if (!path.length) return false;
          render(path.pop());
          return true;
        };
        cats.addEventListener('click', (e) => {
          const b = e.target.closest('.ig-cat');
          if (!b) return;
          if (b.dataset.reset !== undefined) return confirmReset();
          resetting = false;
          cat = +b.dataset.cat;
          path.length = 0;
          render();
        });
        list.addEventListener('click', async (e) => {
          const act = e.target.closest('[data-act]');
          if (act?.dataset.act === 'keep') return pn.back();
          if (act?.dataset.act === 'reset') {
            act.disabled = true;
            try { await adapter.resetOptions(); } catch { toast('Ripristino non riuscito'); }
            await load(); // the values the core runs with now
            resetting = false;
            if (tree?.length) render();
            else list.innerHTML = '<p class="ig-note">Non riesco a leggere le opzioni dell’emulatore.</p>';
            return;
          }
          const b = e.target.closest('.ig-opt');
          if (!b) return;
          const node = nodeAt(path.length);
          if (node.values) { // a value from the list: set it and go back to the option
            const i = path.pop();
            await set(node, node.values[+b.dataset.val].value);
            render(i);
            stepped(i);
            return;
          }
          const i = +b.dataset.opt;
          const it = (node.items ?? node.children)[i];
          if (it.values?.length === 2) { // on/off and the like: A flips it in place
            await set(it, it.values.find((v) => v.value !== it.value)?.value ?? it.values[0].value);
            render(i);
            stepped(i);
            return;
          }
          path.push(i);
          render(it.values ? Math.max(0, it.values.findIndex((v) => v.value === it.value)) : 0);
        });
      });
  }

  // ---------- Commands

  dlg.addEventListener('click', async (e) => {
    const cmd = e.target.closest('[data-cmd]');
    const vol = e.target.closest('[data-vol]');
    if (vol) {
      if (vol.dataset.vol === 'mute') adapter.setMuted(!adapter.muted());
      else {
        if (adapter.muted()) adapter.setMuted(false);
        adapter.setVolume(Math.min(1, Math.max(0, Math.round(adapter.volume() * 10 + +vol.dataset.vol) / 10)));
      }
      return renderVolume();
    }
    if (!cmd) return;
    switch (cmd.dataset.cmd) {
      case 'resume':
        held = false;
        close();
        break;
      case 'hold': // close the menu but leave the game paused
        held = true;
        close();
        break;
      case 'restart': restartPanel(cmd); break;
      case 'save': {
        const label = cmd.querySelector('span');
        cmd.disabled = true;
        label.textContent = 'Salvo…';
        const name = await adapter.saveState();
        cmd.disabled = false;
        label.textContent = 'Salva stato';
        cmd.focus({ preventScroll: true });
        if (name) { toast('Stato salvato'); refreshLastState(); }
        else toast('Stato non salvato: il gioco non lo permette o il server non risponde');
        break;
      }
      case 'load': statesPanel(cmd); break;
      case 'controls': controlsPanel(cmd); break;
      case 'options': optionsPanel(cmd); break;
      case 'exit': exitPanel(cmd); break;
    }
  });

  // Pads come and go: keep the players card (and an open mapping panel) honest.
  const onPads = () => { renderSlots(); if (panel?.name === 'controls' && !capture) panel.render?.(); };
  addEventListener('gamepadconnected', onPads);
  addEventListener('gamepaddisconnected', onPads);

  root.setAttribute('data-nav-lock', ''); // until the menu opens, the pad belongs to the game
  return { open, close, toggle, isOpen: () => dlg.open && dlg.dataset.state !== 'closing', controls: () => controls };
}
