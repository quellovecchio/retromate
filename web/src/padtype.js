// Gamepad text entry, daisy-wheel style: no on-screen QWERTY to walk through key by key.
// The left stick picks one of 8 petals; the face button in the same position as a character types it.
// Opens when a text field is activated, not merely focused: a click, or confirm on the pad (nav.js clicks).
import './padtype.css';
import { move } from './nav.js';

// Petals clockwise from the top. Inside a petal: left, top, right, bottom = X, Y, B, A by position.
const SETS = {
  abc: ['abcd', 'efgh', 'ijkl', 'mnop', 'qrst', 'uvwx', "yz-'", '.,:!'],
  123: ['1234', '5678', '90&?', '()#+', '/=_@', '%*;"', '[]<>', '$~^|'],
};
const BUTTONS = [2, 3, 1, 0]; // standard mapping, by physical position: X left, Y top, B right, A bottom
const root = document.documentElement;

let input, el, raf, prev, petal = 0, set = 'abc', caps = false;

const chars = (i) => [...SETS[set][i]].map((c) => (caps && set === 'abc' ? c.toUpperCase() : c));

function draw() {
  el.querySelector('.daisy-mode').textContent = set === '123' ? '123' : caps ? 'ABC' : 'abc';
  el.querySelectorAll('.daisy-petal').forEach((p, i) => {
    p.toggleAttribute('data-active', i === petal);
    p.querySelectorAll('.daisy-key').forEach((k, j) => (k.textContent = chars(i)[j]));
  });
}

function type(ch) {
  const s = input.selectionStart ?? input.value.length;
  input.setRangeText(ch, s, input.selectionEnd ?? s, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function erase() {
  const s = input.selectionStart, e = input.selectionEnd;
  if (s === e && s === 0) return;
  input.setRangeText('', s === e ? s - 1 : s, e, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function caret(d) {
  const p = Math.max(0, Math.min(input.value.length, input.selectionStart + d));
  input.setSelectionRange(p, p);
}

function place() {
  const r = input.getBoundingClientRect();
  const size = el.offsetWidth;
  const below = r.bottom + 16 + el.offsetHeight < innerHeight;
  el.style.left = `${Math.max(12, Math.min(innerWidth - size - 12, r.left + r.width / 2 - size / 2))}px`;
  el.style.top = `${below ? r.bottom + 16 : Math.max(12, r.top - el.offsetHeight - 16)}px`;
}

function poll() {
  const gp = [...navigator.getGamepads()].find(Boolean);
  if (gp) {
    const [x = 0, y = 0] = gp.axes;
    if (Math.hypot(x, y) > 0.6) {
      const next = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) / 45) % 8;
      if (next !== petal) { petal = next; draw(); }
    }
    const now = gp.buttons.map((b) => b.pressed);
    const down = (i) => now[i] && !prev[i];
    BUTTONS.forEach((b, k) => down(b) && type(chars(petal)[k]));
    if (down(4)) erase();
    if (down(5)) type(' ');
    if (down(6)) { caps = !caps; draw(); }
    if (down(7)) { set = set === 'abc' ? '123' : 'abc'; draw(); }
    if (down(14)) caret(-1);
    if (down(15)) caret(1);
    const leave = down(12) ? 'ArrowUp' : down(13) ? 'ArrowDown' : null;
    const done = down(8) || down(9); // Select / Start
    prev = now;
    if (leave) { // leave the field the way you would without the wheel
      close();
      return move(leave);
    }
    if (done) return close();
  }
  raf = requestAnimationFrame(poll);
}

// Shoulder and menu buttons by their printed names: Nintendo pads say L/R/ZL/ZR/+, the others LB/RB/LT/RT/Start.
function legend() {
  const n = /057e/i.test([...navigator.getGamepads()].find(Boolean)?.id ?? '');
  const [lb, rb, lt, rt, start] = n ? ['L', 'R', 'ZL', 'ZR', '+'] : ['LB', 'RB', 'LT', 'RT', 'Start'];
  return `<span><b>${lb}</b>Cancella</span><span><b>${rb}</b>Spazio</span><span><b>${lt}</b>Maiuscole</span>
    <span><b>${rt}</b>Numeri</span><span><b>◀ ▶</b>Cursore</span><span><b>${start}</b>Fine</span>`;
}

function open(field) {
  if (el) return;
  input = field;
  const host = field.closest('[data-daisy-host]') ?? document.body;
  host.insertAdjacentHTML('beforeend', `
    <div class="daisy" role="dialog" aria-label="Tastiera del controller">
      <div class="daisy-wheel">
        ${SETS.abc.map((_, i) => `<div class="daisy-petal" style="--a:${i * 45}deg">${'<span class="daisy-key"></span>'.repeat(4)}</div>`).join('')}
        <span class="daisy-mode" aria-hidden="true"></span>
      </div>
      <p class="daisy-legend">${legend()}</p>
    </div>`);
  el = host.lastElementChild;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // keep the field focused
    const k = e.target.closest('.daisy-key');
    if (k) type(k.textContent);
  });
  draw();
  place();
  root.setAttribute('data-nav-lock', '');
  prev = [...navigator.getGamepads()].find(Boolean)?.buttons.map((b) => b.pressed) ?? [];
  raf = requestAnimationFrame(poll);
}

function close() {
  if (!el) return;
  cancelAnimationFrame(raf);
  root.removeAttribute('data-nav-lock');
  const old = el;
  old.classList.add('out'); // leaves the way it came, faster
  setTimeout(() => old.remove(), 160);
  el = input = null;
}

const isText = (t) => t?.matches?.('input:not([type]), input[type=text], input[type=search]');
document.addEventListener('click', (e) => isText(e.target) && open(e.target));
document.addEventListener('focusout', (e) => e.target === input && close());
document.addEventListener('keydown', close, true); // a physical keyboard takes over
addEventListener('resize', () => el && place());
