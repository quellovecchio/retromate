// PS2 in the browser: Play! (github.com/jpd002/Play-, BSD licence), its WebAssembly build vendored in public/play
// (from playjs.purei.org, built 2026-09-03). The alternative to the streamed PCSX2 (play.html?local): far fewer games
// run, and slower, but it needs no server GPU. It uses threads (SharedArrayBuffer), so play.html?local and public/play
// are served cross-origin isolated (server.py, vite.config.js). The core offers little: boot a disc, count frames.
// No pause, no save states; input is keyboard events on its canvas, so the pad is turned into those.
import { inputReader, streamDefaultControls } from './stream.js';

// The 24 RetroPad inputs (see stream.js) as the keys Play! binds (Source/ui_js/Main.cpp): B Cross, Y Square, A Circle,
// X Triangle, then the sticks as directions. Play! names the number keys Key1, not the browser's Digit1.
const CODES = ['KeyZ', 'KeyA', 'Backspace', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyX', 'KeyS',
  'Key1', 'Key8', 'Key2', 'Key9', 'Key3', 'Key0', 'KeyH', 'KeyF', 'KeyG', 'KeyT', 'KeyL', 'KeyJ', 'KeyK', 'KeyI'];

// The disc, read from the server with HTTP ranges in 1 MB pieces (the core asks for a few KB at a time), the last
// 64 kept. The core waits on isDone(), so a failed piece is simply asked again.
const CHUNK = 1 << 20;
function httpDisc(module, url, size) {
  const chunks = new Map();
  const chunk = (i) => {
    if (!chunks.has(i)) {
      const range = `bytes=${i * CHUNK}-${Math.min(size, (i + 1) * CHUNK) - 1}`;
      const p = fetch(url, { headers: { Range: range } })
        .then((r) => (r.status === 206 ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((b) => new Uint8Array(b));
      p.catch(() => chunks.delete(i));
      chunks.set(i, p);
      if (chunks.size > 64) chunks.delete(chunks.keys().next().value);
    }
    return chunks.get(i);
  };
  let done = true;
  return {
    getFileSize: () => size,
    isDone: () => done,
    read(dst, offset, length) {
      done = false;
      (async function copy() {
        try {
          for (let at = offset; at < offset + length;) {
            const i = Math.floor(at / CHUNK);
            const data = await chunk(i);
            const n = Math.min(data.length - (at - i * CHUNK), offset + length - at);
            module.HEAPU8.set(data.subarray(at - i * CHUNK, at - i * CHUNK + n), dst + at - offset);
            at += n;
          }
          done = true;
        } catch {
          setTimeout(copy, 1000);
        }
      })();
    },
  };
}

// Play!'s memory card 1 is a folder, a file per save. It lives on the server as this game's save (GET/PUT
// /api/games/{id}/save -> library/saves/ps2/{game}.srm, JSON {path: base64}): written back before the boot, sent
// whenever it changes. Not the streamed PCSX2's cards (library/saves/ps2/memcards): the two cores share no saves.
const CARD = '/home/web_user/.local/share/Play Data Files/vfs/mc0';
const base64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
function pack(FS, dir = CARD, out = {}, rel = '') {
  for (const name of FS.readdir(dir)) {
    if (name === '.' || name === '..') continue;
    const path = `${dir}/${name}`;
    if (FS.isDir(FS.stat(path).mode)) pack(FS, path, out, `${rel}${name}/`);
    else out[rel + name] = base64(FS.readFile(path));
  }
  return out;
}
async function memoryCard(FS, api) {
  const r = await fetch(`${api}/save`).catch(() => null);
  if (r?.ok) {
    for (const [rel, data] of Object.entries(await r.json())) {
      FS.mkdirTree(`${CARD}/${rel}`.replace(/\/[^/]*$/, ''));
      FS.writeFile(`${CARD}/${rel}`, Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
    }
  }
  let last = JSON.stringify(pack(FS));
  let upload = Promise.resolve();
  const flush = () => {
    const now = JSON.stringify(pack(FS));
    if (now === last || now === '{}') return upload; // an empty card never replaces a saved one
    last = now;
    // keepalive lets a small card finish even if the page is closing (browsers cap it at 64 KB)
    upload = fetch(`${api}/save`, { method: 'PUT', body: now, keepalive: now.length < 60000 }).catch(() => {});
    return upload;
  };
  setInterval(flush, 5000);
  addEventListener('visibilitychange', () => document.hidden && flush());
  return flush;
}

// The core plays through OpenAL straight to the speakers: route whatever reaches them through one gain, the volume.
function masterVolume() {
  const out = { level: 1, muted: false, gain: null };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...rest) {
    if (dst instanceof AudioDestinationNode) {
      if (out.gain?.context !== dst.context) {
        out.gain = dst.context.createGain();
        out.gain.gain.value = out.muted ? 0 : out.level;
        connect.call(out.gain, dst);
      }
      dst = out.gain;
    }
    return connect.call(this, dst, ...rest);
  };
  out.apply = () => out.gain && (out.gain.gain.value = out.muted ? 0 : out.level);
  return out;
}

// Starts the game in container and returns its controller for the in-game menu:
// { controls, blocked, reset(), volume, flush() -> Promise (the memory card to the server) }. status(text) reports progress and errors ('' when the game shows).
export async function local(game, container, status) {
  if (!crossOriginIsolated) {
    status('Il PS2 locale richiede Chrome, Edge o Firefox.');
    return null;
  }
  status('Avvio di Play!…');
  const volume = masterVolume();
  const canvas = Object.assign(document.createElement('canvas'), { id: 'outputCanvas', width: 640, height: 480 });
  container.append(canvas);
  const core = `${location.origin}/play/Play.js`; // a runtime URL: Vite refuses to import public files by name
  const { default: Play } = await import(/* @vite-ignore */ core);
  const module = await Play({ locateFile: (path) => `/play/${path}`, mainScriptUrlOrBlob: core });
  const name = game.file.split('/').pop();
  const url = `/api/games/${game.id}/rom/${encodeURIComponent(name)}`;
  const size = +(await fetch(url, { method: 'HEAD' })).headers.get('content-length');
  module.discImageDevice = httpDisc(module, url, size);
  module.ccall('initVm', '', [], []);
  const flush = await memoryCard(module.FS, `/api/games/${game.id}`);
  module.bootDiscImage(name);

  const ctl = { controls: streamDefaultControls(), blocked: false, volume, flush, reset: () => module.bootDiscImage(name) };
  const read = inputReader(ctl);
  const down = new Array(24).fill(false);
  (function poll() {
    requestAnimationFrame(poll);
    const v = read();
    for (let i = 0; i < 24; i++) {
      const on = !!v && v[i] > 0.5;
      if (on === down[i]) continue;
      down[i] = on;
      canvas.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: CODES[i] }));
    }
  })();

  // The first frame ends the loading message; none after a minute: this game probably doesn't run on Play!.
  const started = Date.now();
  const timer = setInterval(() => {
    if (module.getFrames() > 0) {
      status('');
      clearInterval(timer);
    } else if (Date.now() - started > 60000) status('Nessuna immagine dopo un minuto: questo gioco forse non va con il core locale, prova lo streaming.');
  }, 500);
  return ctl;
}
