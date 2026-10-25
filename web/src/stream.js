// Client for cloud-game (docker-compose.yml): WebSocket signalling with the coordinator, WebRTC video/audio
// from the worker, joypad state sent back on the "data" channel.
// Not a core option: the worker plugs this device id into port 1 (stream/cloud-game.patch, nanoarch.DeviceKey);
// players 2-4's are DEVICE_KEY_2.._4 (deviceKey(p)).
export const DEVICE_KEY = 'retromate_device';
export const deviceKey = (p) => (p ? `${DEVICE_KEY}_${p + 1}` : DEVICE_KEY);
const JOYPAD = '1'; // RETRO_DEVICE_JOYPAD: the plain RetroPad, which every port takes
// Over HTTPS (behind the reverse proxy, homeserver/edge/Caddyfile) the signalling shares the page's origin: a page on
// https can't open ws://, and the proxy routes /ws to cloud-game. Plain HTTP on the LAN talks to port 8100 directly.
const STREAM_URL = import.meta.env.VITE_STREAM_URL
  || (location.protocol === 'https:' ? `wss://${location.host}/ws` : `ws://${location.hostname}:8100/ws`);
const T = { INIT: 4, INIT_WEBRTC: 100, SIGNAL: 101, START: 104, SAVE: 106, LOAD: 107, NO_SLOTS: 112, RESET: 113, PAUSE: 114, OPTIONS: 115, SET_OPTION: 116,
  PLUG: 117, VIDEO_CHANGE: 150 };

// libretro RETRO_DEVICE_ID_JOYPAD_* bit -> standard Gamepad API button index
// (B, Y, Select, Start, Up, Down, Left, Right, A, X, L, R, L2, R2, L3, R3)
const PAD = [0, 2, 8, 9, 12, 13, 14, 15, 1, 3, 4, 5, 6, 7, 10, 11];

// Is the streaming slot free? cloud-game answers a new connection at once: "no free slots" (112) when every worker
// is busy, INIT (4) otherwise. A connection reserves nothing (the slot is taken only by START), so probing is safe.
// Resolves true (free), false (busy) or null (server unreachable or silent for 3 s).
export function slotFree() {
  return new Promise((resolve) => {
    const ws = new WebSocket(STREAM_URL);
    const done = (v) => { clearTimeout(timer); ws.close(); resolve(v); };
    const timer = setTimeout(() => done(null), 3000);
    ws.onmessage = ({ data }) => done(JSON.parse(data).t !== T.NO_SLOTS);
    ws.onerror = () => done(null);
  });
}

// Wii system language, chosen in Opzioni (per device) and sent with each start as Dolphin's dolphin_language.
export const WII_LANGUAGES = [['5', 'Italiano'], ['1', 'English'], ['2', 'Deutsch'], ['3', 'Français'], ['4', 'Español'],
  ['6', 'Nederlands'], ['0', '日本語'], ['9', '한국어'], ['7', '简体中文'], ['8', '繁體中文']];
const LANG_KEY = 'retromate-wii-language';
export function getWiiLanguage() {
  let v;
  try { v = localStorage.getItem(LANG_KEY); } catch {}
  return WII_LANGUAGES.some(([id]) => id === v) ? v : '5';
}
export function setWiiLanguage(id) {
  try { localStorage.setItem(LANG_KEY, id); } catch {}
}

// "Ottimizzazione giochi d'azione", chosen in Opzioni (per device, off by default). The browser holds frames back to
// show them evenly: with RPCS3's uneven frame rate Chrome's jitter buffer measured ~80 ms, peaks of 150, all of it
// input lag. On, it keeps the video's buffer as short as it can (jitterBufferTarget 0): quicker response, visible
// hitches when the game or the network stutters. Best with emulators at steady full speed.
const LOW_LATENCY_KEY = 'retromate-low-latency';
export function getLowLatency() {
  try { return localStorage.getItem(LOW_LATENCY_KEY) === '1'; } catch { return false; }
}
export function setLowLatency(on) {
  try { localStorage.setItem(LOW_LATENCY_KEY, on ? '1' : '0'); } catch {}
}

// The controllers Dolphin emulates on a Wii (the core lists them, stream/cloud-game.patch), by its device id: an Italian
// name and what each RetroPad input (EmulatorJS numbers, see below) becomes, from DolphinLibretro/Input.cpp
// (retro_set_controller_port_device_wii) with its default IR mode, the right stick aiming the pointer. sticks: what
// the left and right stick do, when not the same stick. The MotionPlus variants ((7..11) << 8 | 1) map like the
// device without it (MOTION_PLUS).
const WIIMOTE = { 2: '−', 3: '+', 15: 'Home', 13: 'Scuoti' };
const CLASSIC = { 8: 'A', 0: 'B', 9: 'X', 1: 'Y', 2: '−', 3: '+', 15: 'Home' };
const WII_DEVICES = {
  1: { name: 'Wii Remote', inputs: { ...WIIMOTE, 8: 'A', 0: 'B', 9: '1', 1: '2' }, sticks: ['Inclinazione', 'Puntatore'] },
  513: { name: 'Wii Remote orizzontale', inputs: { ...WIIMOTE, 9: 'A', 1: 'B', 0: '1', 8: '2' }, sticks: ['Inclinazione', 'Puntatore'] },
  769: { name: 'Wii Remote + Nunchuk', inputs: { 8: 'A', 0: 'B', 9: 'C', 1: 'Z', 3: '1', 2: '2', 10: '−', 11: '+', 15: 'Home', 13: 'Scuoti',
    12: 'Scuoti Nunchuk' }, sticks: ['Stick Nunchuk', 'Puntatore'] },
  1025: { name: 'Classic Controller', inputs: { ...CLASSIC, 10: 'ZL', 11: 'ZR', 12: 'L', 13: 'R' }, sticks: ['', ''] },
  1281: { name: 'Classic Controller Pro', inputs: { ...CLASSIC, 10: 'L', 11: 'R', 12: 'ZL', 13: 'ZR' }, sticks: ['', ''] },
  1537: { name: 'Controller GameCube', inputs: { 8: 'A', 0: 'B', 9: 'X', 1: 'Y', 12: 'L', 13: 'R', 11: 'Z', 3: 'Start' }, sticks: ['', 'C-Stick'] },
};
const MOTION_PLUS = { 1793: 1, 2049: 513, 2305: 769, 2561: 1025, 2817: 1281 };
const wiiBase = (id) => MOTION_PLUS[id] ?? id;
// The menu's view of a core device: { id, name, inputs?, sticks? } (inputs missing: the RetroPad's own names).
function emulatedDevice(platform, { id, label }) {
  const wii = platform === 'wii' && WII_DEVICES[wiiBase(id)];
  return wii ? { id, ...wii, name: wii.name + (wiiBase(id) !== id ? ' + MotionPlus' : '') } : { id, name: label };
}

// The in-game menu's controller model (see ingame.js) for a streamed game: four players on the one connection (the
// worker reads players 2-4's port from their packets), EmulatorJS's input numbers: 0-15 the RetroPad buttons (same
// order as the libretro joypad bits), 16-23 the stick directions (left stick right, left, down, up; then the right
// stick). Players 2-4 start with no device and no keys: pads are handed out as they show up (assignPads).
const PAD_LABELS = ['BUTTON_1', 'BUTTON_2', 'BUTTON_3', 'BUTTON_4', 'LEFT_TOP_SHOULDER', 'RIGHT_TOP_SHOULDER', 'LEFT_BOTTOM_SHOULDER',
  'RIGHT_BOTTOM_SHOULDER', 'SELECT', 'START', 'LEFT_STICK', 'RIGHT_STICK', 'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT'];
const STICKS = ['LEFT_STICK_X:+1', 'LEFT_STICK_X:-1', 'LEFT_STICK_Y:+1', 'LEFT_STICK_Y:-1',
  'RIGHT_STICK_X:+1', 'RIGHT_STICK_X:-1', 'RIGHT_STICK_Y:+1', 'RIGHT_STICK_Y:-1'];
const AXES = ['LEFT_STICK_X', 'LEFT_STICK_Y', 'RIGHT_STICK_X', 'RIGHT_STICK_Y'];
// Keyboard: Z B, A Y, right Shift Select, Enter Start, arrows, X A, S X, Q W L R, 1-4 L2 R2 L3 R3 (PS2: Z Cross,
// X Circle, A Square, S Triangle); the left stick on T F G H, the right one on I J K L, like EmulatorJS.
const KEY_CODES = [90, 65, 16, 13, 38, 40, 37, 39, 88, 83, 81, 87, 49, 50, 51, 52, 72, 70, 71, 84, 76, 74, 75, 73];
export function streamDefaultControls() {
  const pad = [...navigator.getGamepads()].find(Boolean);
  return {
    players: [0, 1, 2, 3].map((p) => (p ? { device: 'none', keys: {}, pad: {} } : {
      device: pad ? `pad:${pad.id}` : 'keyboard',
      keys: Object.fromEntries(KEY_CODES.map((k, bit) => [bit, k])),
      pad: Object.fromEntries([...PAD.map((b) => PAD_LABELS[b]), ...STICKS].map((label, i) => [i, label])),
    })),
  };
}
// How far this EmulatorJS-style label (BUTTON_1, GAMEPAD_17, LEFT_STICK_X:+1) is pushed on this pad, 0..1: a
// trigger's pressure, a stick's lean that way, 1 for a plain button.
function strength(gp, label) {
  const [name, dir] = String(label).split(':');
  const b = gp.buttons[name.startsWith('GAMEPAD_') ? +name.slice(8) : PAD_LABELS.indexOf(name)];
  if (b) return b.pressed ? b.value || 1 : 0;
  const a = AXES.indexOf(name);
  return a < 0 ? 0 : Math.max(0, (gp.axes[a] || 0) * (dir === '-1' ? -1 : 1));
}

// The pad player p plays with, or null: the very one (Gamepad.index) handed to them, else the first one with their
// device's id (a pad saved for player 1, or the local core, which hands out nothing).
function padOf(ctl, p) {
  const pl = ctl.controls.players[p];
  if (!pl.device.startsWith('pad:')) return null;
  const id = pl.device.slice(4);
  const i = ctl.padIndex?.[p];
  const pads = navigator.getGamepads();
  return i != null ? (pads[i]?.id === id ? pads[i] : null) : [...pads].find((gp) => gp?.id === id) ?? null;
}

// Hands each connected pad nobody holds to a player, in order: back to the player whose device it is (the pad saved for
// player 1, or the one a player had before it went away), else to the first free player: no device, a pad that isn't
// connected, or player 1 on the keyboard only because no pad was there yet (ctl.fallback). A pad that goes away leaves
// its player's place free. say(text) reports each change.
function assignPads(ctl, say) {
  const players = ctl.controls.players;
  ctl.padIndex = ctl.padIndex.map((i, p) => (i != null && padOf(ctl, p) ? i : null));
  for (const gp of navigator.getGamepads()) {
    if (!gp || ctl.padIndex.includes(gp.index)) continue;
    let p = players.findIndex((pl, q) => ctl.padIndex[q] == null && pl.device === `pad:${gp.id}`);
    if (p < 0) p = players.findIndex((pl, q) => pl.device === 'none' || (q === 0 && ctl.fallback) || (pl.device.startsWith('pad:') && ctl.padIndex[q] == null));
    if (p < 0) continue;
    players[p].device = `pad:${gp.id}`;
    ctl.padIndex[p] = gp.index;
    if (!p) ctl.fallback = false;
    say?.(`Giocatore ${p + 1}: ${gp.id.replace(/\s*\(.*$/, '').trim() || 'Controller'}`);
  }
}

// Starts a streamed game in container and returns its controller, which the in-game menu drives:
// { controls, setControls(model), block(on), pause(on), reset(), save(name), load(name), options(), setOption(key, value),
// replug(), video, flip, devices(), onPlaying, onPlayer(text) }. ctl.startOptions ({core option: value}) go with the start
// request, on top of ctl.baseOptions (what RetroMate itself sends: the Wii language). It survives the retries below.
export function stream(game, container, status, attempt = 0, ctl = newCtl()) {
  const gameName = game.file.split('/').pop().replace(/\.[^.]+$/, ''); // cloud-game ids games by file stem
  const video = Object.assign(document.createElement('video'), { autoplay: true, playsInline: true });
  container.append(video);
  ctl.video = video;
  const media = (video.srcObject = new MediaStream());
  video.addEventListener('playing', () => ctl.onPlaying?.(), { once: true }); // the core runs: a state can load
  // Display hints from the worker: aspect ratio, vertical flip (OpenGL frames come bottom-up), rotation
  const applyAv = ({ a, flip, rot }) => {
    if (a) Object.assign(video.style, { aspectRatio: a, width: `min(100vw, ${a * 100}vh)`, height: 'auto', objectFit: 'fill' });
    ctl.flip = !!flip;
    video.style.transform = [rot && `rotate(${-rot}deg)`, flip && 'scaleY(-1)'].filter(Boolean).join(' ');
  };

  const ws = new WebSocket(STREAM_URL);
  const send = (t, p) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t, p }));
  let pc, remoteIce = [], noSlots = false, started = false;
  const pending = {}; // replies (save, load, options) by message type
  const request = (t, p) => new Promise((resolve) => {
    pending[t] = resolve;
    send(t, p);
    setTimeout(() => pending[t] === resolve && (delete pending[t], resolve(null)), 15000);
  });
  Object.assign(ctl, {
    pause: (on) => ctl.roomId && send(T.PAUSE, { room_id: ctl.roomId, paused: on }),
    reset: () => ctl.roomId && send(T.RESET, { room_id: ctl.roomId }),
    // States are named by a timestamp; the worker keeps them in RetroMate's library/states (stream/cloud-game.patch).
    save: (name) => request(T.SAVE, { name }).then((p) => p === 'ok'),
    load: (name) => request(T.LOAD, { name }).then((p) => p === 'ok'),
    // The running core's own options, as it declares them (stream/cloud-game.patch, nanoarch/options.go):
    // { categories: [{key, label}], options: [{key, label, category, values: [{value, label}], default, value, hidden}] }
    options: () => request(T.OPTIONS).then((p) => (p?.options ? p : null)),
    setOption: (key, value) => request(T.SET_OPTION, { key, value }).then((p) => p === 'ok'),
    // The controllers the core can emulate on port 1 and the one plugged in: { list: [emulatedDevice], device }.
    // Devices built on RETRO_DEVICE_NONE read no RetroPad (Dolphin's real Wii Remote, over Bluetooth): left out.
    // One is chosen with setOption(DEVICE_KEY, id).
    devices: () => ctl.options().then((o) => o && (ctl.p1Device = String(o.device), {
      list: (o.devices ?? []).filter((d) => d.id & 0xff).map((d) => emulatedDevice(game.platform, d)), device: o.device })),
    block(on) { ctl.blocked = on; },
    // Player p (1-3) joins or leaves: the worker plugs their controller into their port or unplugs it. Theirs is the
    // one chosen for them in this game, else player 1's (ctl.p1Device, asked the first time it's needed).
    async plug(p, on) {
      ctl.plugged[p] = on;
      // one question for every player joining at once: a second request of the same type would drop the first's reply
      // (no answer: the plain RetroPad this time, asked again next time)
      if (on) ctl.p1Device ??= ctl.devices().then((d) => (d ? String(d.device) : ((ctl.p1Device = undefined), JOYPAD)));
      const device = on ? (ctl.startOptions?.[deviceKey(p)] ?? await ctl.p1Device) : '';
      if (ctl.plugged[p] === on) send(T.PLUG, { room_id: ctl.roomId, port: p, device: String(device) });
    },
    // Player 1's controller changed: the players who follow it (nothing chosen of their own) get it too.
    replug() {
      for (let p = 1; p < 4; p++) if (ctl.plugged?.[p] && !ctl.startOptions?.[deviceKey(p)]) ctl.plug(p, true);
    },
  });

  status('Connessione al server di streaming…');
  ws.onerror = () => status('Server di streaming non raggiungibile.');
  ws.onclose = () => pc?.connectionState !== 'connected' && !noSlots && status('Connessione chiusa dal server di streaming.');

  ws.onmessage = async ({ data: msg }) => {
    const { t, p } = JSON.parse(msg);
    if (t === T.INIT) {
      pc = new RTCPeerConnection({ iceServers: p.ice || [] });
      const data = pc.createDataChannel('data', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
      data.binaryType = 'arraybuffer';
      data.onmessage = (e) => {
        const m = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data));
        if (m.t === T.VIDEO_CHANGE) applyAv(m.p);
      };
      ctl.data = data;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (e) => {
        // video only: with audio's buffer at 0 too, Chrome stretched the sound when an emulator fell behind and sped
        // it up to catch up, and the video, synced to it, slowed down and raced. Browsers without it ignore it.
        if (getLowLatency() && e.track.kind === 'video') e.receiver.jitterBufferTarget = 0;
        media.addTrack(e.track);
      };
      pc.onicecandidate = (e) => e.candidate && send(T.SIGNAL, { ice: JSON.stringify(e.candidate) });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected' && !started) { // can fire again after a reconnect
          started = true;
          status('Avvio del gioco…');
          // The Wii language from Opzioni (GameCube games take it too), then what was chosen for this game in the
          // in-game menu.
          ctl.baseOptions = game.platform === 'wii' || game.platform === 'ngc' ? { dolphin_language: getWiiLanguage() } : {};
          // Players 2-4's controllers are plugged in when they join; only the Switch bridge needs them now (Eden
          // reads its controllers once, at start: all four are connected there from the beginning).
          const options = Object.fromEntries(Object.entries({ ...ctl.baseOptions, ...ctl.startOptions })
            .filter(([k]) => game.platform === 'switch' || ![1, 2, 3].some((p) => k === deviceKey(p))));
          send(T.START, { game_name: gameName, room_id: '', player_index: 0, options });
        } else if (pc.connectionState === 'failed') status('Connessione WebRTC fallita (porta UDP 8443?).');
      };
      send(T.INIT_WEBRTC, { initiator: false }); // the worker sends the offer
    } else if (t === T.SIGNAL && p.sdp) {
      await pc.setRemoteDescription(JSON.parse(p.sdp));
      const answer = await pc.createAnswer();
      answer.sdp = answer.sdp.replace(/(a=fmtp:111 .*)/g, '$1;stereo=1'); // stereo Opus (Chrome)
      await pc.setLocalDescription(answer);
      send(T.SIGNAL, { sdp: JSON.stringify(answer) });
      remoteIce.forEach((c) => pc.addIceCandidate(c));
      remoteIce = [];
    } else if (t === T.SIGNAL && p.ice) {
      const c = JSON.parse(p.ice);
      pc.remoteDescription ? pc.addIceCandidate(c) : remoteIce.push(c);
    } else if (t === T.START) {
      ctl.roomId = p.roomId;
      ctl.plugged = [true, false, false, false]; // the worker starts with players 2-4 unplugged
      if (p.av) applyAv(p.av); // null when the info comes later on the data channel
      status('');
      video.play().catch(() => {
        // Autoplay with sound needs a user gesture on this page: start muted, unmute on the first key/click.
        video.muted = true;
        video.play();
        const unmute = () => (video.muted = false);
        addEventListener('keydown', unmute, { once: true });
        addEventListener('pointerdown', unmute, { once: true });
      });
    } else if (pending[t]) {
      const resolve = pending[t];
      delete pending[t];
      resolve?.(p);
    } else if (t === T.NO_SLOTS) {
      noSlots = true;
      // Quitting a game frees the slot a moment later (the core shuts down first): a game launched right after
      // one ended is refused at first. Try again a few times before giving up.
      if (attempt < 4) {
        status('In attesa che il server di streaming si liberi…');
        ws.close();
        video.remove();
        return void setTimeout(() => stream(game, container, status, attempt + 1, ctl), 1500);
      }
      status('Nessun server di streaming libero, riprova più tardi.');
    }
  };
  // ponytail: no reply at all when the core fails to load the game (cloud-game only logs it)
  setTimeout(() => video.readyState || noSlots || status('Il server non ha avviato il gioco (BIOS o core mancante? vedi i log di cloud-game).'), 30000);

  if (!ctl.polling) sendInput(ctl);
  return ctl;
}

// A new controller (ctl) for stream(): the default controls, pads handed out as they come and go.
function newCtl() {
  const controls = streamDefaultControls();
  const ctl = { controls, blocked: false, padIndex: [null, null, null, null], fallback: controls.players[0].device === 'keyboard' };
  // A model from the server or the menu's Salva: the pads are handed out again (the model names them by id only).
  ctl.setControls = (model) => {
    Object.assign(ctl, { controls: model, fallback: false, padIndex: [null, null, null, null] });
    assignPads(ctl);
  };
  assignPads(ctl);
  addEventListener('gamepadconnected', () => assignPads(ctl, ctl.onPlayer));
  addEventListener('gamepaddisconnected', ({ gamepad }) => {
    const p = ctl.padIndex.indexOf(gamepad.index);
    if (p >= 0) ctl.onPlayer?.(`Giocatore ${p + 1} disconnesso`);
    assignPads(ctl, ctl.onPlayer);
  });
  return ctl;
}

// Is player p (2-4) playing: a pad of theirs connected, or the keyboard with keys of their own?
const joined = (ctl, p) => {
  const pl = ctl.controls.players[p];
  return pl.device === 'keyboard' ? Object.keys(pl.keys).length > 0 : !!padOf(ctl, p);
};

// The 24 inputs of player p (default 1) from their mapping (ctl.controls), 0..1: each as strong as the strongest key or
// pad control mapped to it. Returns the reader, read(p); null while blocked (the menu is open) or with no device:
// everything released. Player 1's keys count with a pad too; players 2-4's only on the keyboard.
export function inputReader(ctl) {
  const keys = new Set();
  const counts = (pl, p) => !p || pl.device === 'keyboard';
  const mapped = (code) => ctl.controls.players.some((pl, p) => counts(pl, p) && Object.values(pl.keys).includes(code));
  addEventListener('keydown', (e) => !ctl.blocked && mapped(e.keyCode) && (keys.add(e.keyCode), e.preventDefault()));
  addEventListener('keyup', (e) => keys.delete(e.keyCode));
  return (p = 0) => {
    const pl = ctl.controls.players[p];
    if (ctl.blocked || pl.device === 'none') return null;
    const v = new Array(24).fill(0);
    if (counts(pl, p)) for (const [i, code] of Object.entries(pl.keys)) if (keys.has(code)) v[i] = 1;
    const gp = padOf(ctl, p);
    if (gp) for (const [i, label] of Object.entries(pl.pad)) v[i] = Math.max(v[i] ?? 0, strength(gp, label));
    return v;
  };
}

// Input: [buttons u16][LX][LY][RX][RY][L2][R2] i16, little-endian, plus the port (1-3) as a 15th byte for players 2-4.
// Buttons are on past half way, sticks and triggers keep the analog value. The channel is unreliable, so a player's
// state is re-sent every 100 ms even when nothing changes. Players 2-4 send only while they play: joining plugs their
// controller in (ctl.plug), leaving unplugs it after a few "all released" packets, then nothing.
function sendInput(ctl) {
  ctl.polling = true;
  const read = inputReader(ctl);
  const last = ['', '', '', ''], lastAt = [0, 0, 0, 0], release = [0, 0, 0, 0];
  (function poll(now) {
    requestAnimationFrame(poll);
    if (ctl.data?.readyState !== 'open') return;
    for (let p = 0; p < 4; p++) {
      if (p) {
        const on = !!ctl.roomId && joined(ctl, p);
        if (ctl.plugged && on !== ctl.plugged[p]) {
          ctl.plug(p, on);
          release[p] = on ? 0 : 3;
        }
        if (!ctl.plugged?.[p] && !release[p]) continue;
      }
      const state = new Int16Array(p ? 8 : 7);
      const v = release[p] ? null : read(p);
      if (v) {
        for (let bit = 0; bit < 16; bit++) if (v[bit] > 0.5) state[0] |= 1 << bit;
        const axis = (plus, minus) => Math.round(Math.max(-1, Math.min(1, v[plus] - v[minus])) * 32767);
        [state[1], state[2], state[3], state[4]] = [axis(16, 17), axis(18, 19), axis(20, 21), axis(22, 23)];
        [state[5], state[6]] = [Math.round(v[12] * 32767), Math.round(v[13] * 32767)];
      }
      const bytes = new Uint8Array(state.buffer, 0, p ? 15 : 14);
      bytes[14] = p; // players 2-4 only: player 1's packet stops at 14
      if (release[p]) {
        release[p]--;
        ctl.data.send(bytes);
        continue;
      }
      const key = state.join();
      if (key === last[p] && now - lastAt[p] < 100) continue;
      [last[p], lastAt[p]] = [key, now];
      ctl.data.send(bytes);
    }
  })();
}
