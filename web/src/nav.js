// Controller/keyboard navigation: arrows/D-pad/stick move focus spatially, A/Enter activates (a click: it also opens
// the gamepad keyboard on a text field), B/Escape goes back (A and B can be swapped in Opzioni),
// X (or the X key) sends a 'pad-x' event to the focused element, LB/RB switch the header tabs.
const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const DPAD = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
// The standard mapping numbers face buttons by position (0 = bottom, 1 = right). Buttons go by their print: Nintendo
// pads (vendor 057e) have A on the right, B at the bottom and X on top; Xbox-style pads A bottom, B right, X left.
// A confirms and B goes back, unless Opzioni swaps them (per device).
const SWAP_KEY = 'retromate-swap-ab';
let swap = false;
try { swap = localStorage.getItem(SWAP_KEY) === '1'; } catch {}
export const getSwap = () => swap;
export function setSwap(on) {
  swap = on;
  try { localStorage.setItem(SWAP_KEY, on ? '1' : '0'); } catch {}
}
const faces = (gp) => {
  const [a, b, x] = /057e/i.test(gp.id) ? [1, 0, 3] : [0, 1, 2];
  return { [swap ? b : a]: 'Enter', [swap ? a : b]: 'Back', [x]: 'X' };
};
const SHOULDERS = { 4: 'PrevTab', 5: 'NextTab' };
// Worn sticks rest well off center (a Pro Controller here idles at 0.49): only a deliberate push moves focus.
const DEADZONE = 0.65;

const root = document.documentElement;
// An open modal <dialog> is the whole world: the page behind it is inert.
const focusables = () => [...(document.querySelector('dialog[open]') ?? document).querySelectorAll('a[href], button:not(:disabled), input:not(:disabled)')]
  // hidden ones measure at (0, 0) and would steal up/left moves; inert ones (behind a panel) can't take focus
  .filter((el) => el.checkVisibility() && !el.closest('[inert]'));
const inField = (el) => el?.matches?.('input, textarea');
// Last input device, for components that behave differently with a controller (e.g. the gamepad keyboard).
const setInput = (kind) => { if (root.dataset.input !== kind) root.dataset.input = kind; };
// The top bar is pinned (sticky): it takes focus only with the page scrolled all the way up, never from content that
// just scrolled under it. Up with nothing left above scrolls to the top first; the next up reaches the bar.
const pinned = (el) => el.closest('.top');
const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const overlap = (e, f) => e.top < f.bottom && e.bottom > f.top;
const least = (list, f) => list.reduce((m, c) => (m && f(m) <= f(c) ? m : c), undefined);

// Lines first: left/right stay on the current line (targets overlapping it vertically), up/down go to the nearest line
// (targets overlapping the closest one) and then to the closest target on it. A [data-row] is one line however it is
// laid out (the cover flow, the tabs): left/right stay inside it, up/down leave it and land on the row's current item
// ([data-current] box, [aria-current] tab) rather than the nearest one. A [data-col] is the other way round (the
// in-game options: categories beside their options, lines that don't align): up/down stay inside it, and stop at its
// end rather than wander into the other column; left/right leave it even with nothing level on the other side, and
// land on the other column's current item.
export function move(key) {
  const [dx, dy] = DIRS[key];
  const cur = document.activeElement;
  const items = focusables();
  if (!items.includes(cur)) return items[0]?.focus();
  const row = cur.closest('[data-row]');
  const col = cur.closest('[data-col]');
  const r = cur.getBoundingClientRect();
  const a = center(r);
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const atTop = scrollY < 1;
  let cands = items.filter((el) => el !== cur && !(row && row.contains(el) === !!dy) && (atTop || !pinned(el))).map((el) => {
    const e = el.getBoundingClientRect();
    const b = center(e);
    return { el, e, along: (b.x - a.x) * dx + (b.y - a.y) * dy, side: Math.abs((b.x - a.x) * dy + (b.y - a.y) * dx) };
  }).filter((c) => c.along > 1);
  if (!dy) {
    const level = cands.filter((c) => overlap(c.e, r));
    cands = level.length || !col ? level : cands.filter((c) => !col.contains(c.el));
  } else if (col) {
    const inside = cands.filter((c) => col.contains(c.el));
    cands = inside.length ? inside : cands.filter((c) => !c.el.closest('[data-col]'));
  }
  const near = dy && least(cands, (c) => (dy > 0 ? c.e.top : -c.e.bottom));
  if (near) cands = cands.filter((c) => overlap(c.e, near.e));
  const best = least(cands, (c) => c.along + 2 * c.side)?.el; // prefer aligned targets
  const into = best?.closest('[data-row], [data-col]');
  const target = (into !== row && into !== col && into?.querySelector('[data-current], [aria-current]')) || best;
  if (!target) return dy < 0 && !atTop && scrollTo({ top: 0, behavior });
  // Focus alone jumps the page; glide it instead (scroll-margin still decides how much stays in view).
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
}

function tab(step) {
  if (document.querySelector('dialog[open]')) return;
  const tabs = [...document.querySelectorAll('.nav a')];
  tabs[tabs.findIndex((t) => t.hasAttribute('aria-current')) + step]?.click();
}

function act(action) {
  if (action in DIRS) move(action);
  else if (action === 'Enter') document.activeElement?.click();
  else if (action === 'Back' && document.querySelector('dialog[open]')) {
    document.querySelector('dialog[open]').dispatchEvent(new Event('cancel', { cancelable: true })); // the modal closes
  } else if (action === 'Back' && root.dataset.back) { // app.js decides where B leads: back in history, or a page
    if (root.dataset.back === 'history') history.back();
    else location.hash = root.dataset.back;
  }
  else if (action === 'X') document.activeElement?.dispatchEvent(new Event('pad-x', { bubbles: true }));
  else if (action === 'PrevTab') tab(-1);
  else if (action === 'NextTab') tab(1);
}

document.addEventListener('keydown', (e) => {
  setInput('keys');
  // A component that owns the input (the gamepad keyboard, a running game) has the keyboard too.
  if (e.defaultPrevented || root.hasAttribute('data-nav-lock')) return;
  const typing = inField(e.target);
  if (e.key in DIRS) {
    if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return; // move the caret, not the focus
    e.preventDefault();
    act(e.key);
  } else if (e.key === 'Escape' || (e.key === 'Backspace' && !typing)) {
    e.preventDefault(); // one Back: an open <dialog> would also close itself on Esc
    act('Back');
  }
  else if (e.key.toLowerCase() === 'x' && !typing) act('X');
});
addEventListener('pointerdown', () => setInput('pointer'));

// Gamepads have no events for buttons: poll every frame. Directions auto-repeat when held.
const held = {};
let armed = false;
function poll(t) {
  const pressed = new Set();
  for (const gp of navigator.getGamepads()) {
    if (!gp) continue;
    for (const [i, a] of Object.entries({ ...DPAD, ...SHOULDERS, ...faces(gp) })) if (gp.buttons[i]?.pressed) pressed.add(a);
    const [x = 0, y = 0] = gp.axes;
    if (x < -DEADZONE) pressed.add('ArrowLeft');
    if (x > DEADZONE) pressed.add('ArrowRight');
    if (y < -DEADZONE) pressed.add('ArrowUp');
    if (y > DEADZONE) pressed.add('ArrowDown');
  }
  if (pressed.size) setInput('pad');
  for (const a in held) if (!pressed.has(a)) delete held[a];
  // Buttons count as held, never as presses, when: a component owns the pad (data-nav-lock); this window lacks focus
  // (every open tab sees the same controller, so a press in one must not launch a game in another); or it is the
  // first frame, when a button already down from the previous page would otherwise fire.
  const live = armed && document.hasFocus() && !root.hasAttribute('data-nav-lock');
  armed = true;
  for (const a of pressed) {
    if (!live) { held[a] = Infinity; continue; }
    if (held[a] > t) continue;
    held[a] = a in DIRS ? t + (held[a] ? 120 : 400) : Infinity;
    act(a);
  }
  requestAnimationFrame(poll);
}
requestAnimationFrame(poll);
