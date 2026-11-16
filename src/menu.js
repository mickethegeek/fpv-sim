// Menus: start menu, Learn list, Settings, pause menu. Works with a controller (D-pad or left stick to move,
// cross to select, circle back, Options to pause), with the keyboard (arrows, Enter, Esc) and with the mouse.
// navUpdate is pure (unit-tested in node); Menu touches the page.

// Standard-layout gamepad buttons used by the menus.
export const NAV_BUTTONS = { select: 0, back: 1, pause: 9, up: 12, down: 13, left: 14, right: 15 };
const STICK = 0.6;          // left stick past this counts as a direction
const REPEAT_FIRST = 0.4;   // s a direction is held before it repeats
const REPEAT_NEXT = 0.12;   // s between repeats (sliders)

const down = (b) => !!b && (typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5);

export function createNav() { return { held: null, t: {} }; }

// One controller reading -> menu events: 'up' | 'down' | 'left' | 'right' (repeat while held), 'select' | 'back' | 'pause' (once per press).
// Whatever is already held on the first reading does nothing until it is let go (no phantom presses when a menu opens).
export function navUpdate(nav, buttons = [], axes = [], dt = 0) {
  const now = {
    up: down(buttons[NAV_BUTTONS.up]) || axes[1] < -STICK, down: down(buttons[NAV_BUTTONS.down]) || axes[1] > STICK,
    left: down(buttons[NAV_BUTTONS.left]) || axes[0] < -STICK, right: down(buttons[NAV_BUTTONS.right]) || axes[0] > STICK,
    select: down(buttons[NAV_BUTTONS.select]), back: down(buttons[NAV_BUTTONS.back]), pause: down(buttons[NAV_BUTTONS.pause]),
  };
  const events = [];
  if (!nav.held) { nav.held = now; for (const k of Object.keys(now)) nav.t[k] = now[k] ? -Infinity : 0; return events; }
  for (const k of Object.keys(now)) {
    if (!now[k]) { nav.t[k] = 0; continue; }
    const repeats = k === 'up' || k === 'down' || k === 'left' || k === 'right';
    if (!nav.held[k]) { events.push(k); nav.t[k] = repeats ? REPEAT_FIRST : -Infinity; }
    else if (repeats && nav.t[k] !== -Infinity) { nav.t[k] -= dt; if (nav.t[k] <= 0) { events.push(k); nav.t[k] = REPEAT_NEXT; } }
  }
  nav.held = now;
  return events;
}

// What the menu buttons are called on this controller.
export function navNames(id = '') {
  return /054c|dualsense|dualshock|playstation|ps[345] controller|wireless controller/i.test(id)
    ? { select: '✕', back: '◯', pause: 'Options' } : { select: 'A', back: 'B', pause: 'Menu' };
}

export class Menu {
  // root: the #menu element, holding one <section data-screen="name" data-title="..."> per screen.
  // onAction(act, el): a button with data-act was chosen. onBack(root): back was pressed on the bottom screen.
  constructor({ root, win = window, onAction, onBack, blocked = () => false }) {
    Object.assign(this, { root, win, onAction, onBack, blocked });
    this.stack = [];
    this.came = [];          // where the pointer was on the screens below, to come back to
    this.nav = createNav();
    this.index = 0;
    this.titleEl = root.querySelector('.menu-title');
    this.screens = Object.fromEntries([...root.querySelectorAll('[data-screen]')].map((el) => [el.dataset.screen, el]));
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go], [data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.go === 'back') this.back();
      else if (b.dataset.go) this.push(b.dataset.go);
      else this.onAction(b.dataset.act, b);
    });
    root.addEventListener('mouseover', (e) => { const i = this.items().indexOf(e.target.closest('button, select, input, summary')); if (i >= 0) this.mark(i, false); });
    root.addEventListener('focusin', (e) => { const i = this.items().indexOf(e.target); if (i >= 0) this.mark(i, false); });
    // Keys go to the menu while it is open (before the flying keys see them).
    win.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen() { return this.stack.length > 0; }
  get screen() { return this.stack[this.stack.length - 1] || null; }

  open(screen) { this.stack = [screen]; this.came = []; this.show(); }
  push(screen) { this.came.push(this.index); this.stack.push(screen); this.show(); }
  close() { this.stack = []; this.show(); const a = this.win.document.activeElement; if (a && this.root.contains(a)) a.blur(); }
  back() {
    if (this.stack.length > 1) { this.stack.pop(); this.show(); this.mark(Math.min(this.came.pop() ?? 0, this.items().length - 1)); } else if (this.isOpen) this.onBack(this.screen);
  }

  show() {
    this.root.hidden = !this.isOpen;
    for (const [name, el] of Object.entries(this.screens)) el.hidden = name !== this.screen;
    this.nav = createNav();
    if (!this.isOpen) return;
    const el = this.screens[this.screen];
    if (this.titleEl) this.titleEl.textContent = el.dataset.title || '';
    el.scrollTop = 0;
    this.refresh(true);
  }
  // Call after the content of the open screen changed. first: go to the screen's starting item.
  refresh(first = false) {
    if (!this.isOpen) return;
    const items = this.items();
    let i = Math.min(this.index, items.length - 1);
    if (first) { i = items.findIndex((b) => b.hasAttribute('data-first')); if (i < 0) i = 0; }
    this.mark(Math.max(0, i));
  }

  // Everything that can be chosen on the open screen, top to bottom.
  items() {
    const el = this.screens[this.screen];
    return el ? [...el.querySelectorAll('button, select, input, summary')].filter((b) => !b.disabled && b.offsetParent !== null) : [];
  }
  get current() { return this.items()[this.index] || null; }
  mark(i, focus = true) {
    const items = this.items();
    this.index = i;
    for (const b of this.root.querySelectorAll('.sel')) b.classList.remove('sel');
    const b = items[i];
    if (!b) return;
    b.classList.add('sel');
    if (focus) { b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' }); }
  }
  move(d) { const n = this.items().length; if (n) this.mark((this.index + d + n) % n); }
  // Left / right on a slider or a choice changes it.
  adjust(d) {
    const b = this.current;
    if (!b) return false;
    if (b.tagName === 'INPUT' && b.type === 'range') {
      const step = Number(b.step) || 1, v = Math.max(Number(b.min), Math.min(Number(b.max), Number(b.value) + d * step));
      b.value = String(v);
      b.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (b.tagName === 'SELECT') {
      const i = Math.max(0, Math.min(b.options.length - 1, b.selectedIndex + d));
      if (i !== b.selectedIndex) { b.selectedIndex = i; b.dispatchEvent(new Event('change', { bubbles: true })); if (this.isOpen) b.focus({ preventScroll: true }); }
      return true;
    }
    return false;
  }
  select() { const b = this.current; if (b && (b.tagName === 'BUTTON' || b.tagName === 'SUMMARY')) { b.click(); if (b.tagName === 'SUMMARY') this.refresh(); } }

  handle(ev) {
    if (ev === 'up') this.move(-1); else if (ev === 'down') this.move(1);
    else if (ev === 'left') this.adjust(-1); else if (ev === 'right') this.adjust(1);
    else if (ev === 'select') this.select(); else if (ev === 'back') this.back();
    else if (ev === 'pause' && this.stack[0] === 'pause') this.onBack('pause'); // Options again: back to flying
  }

  onKey(e) {
    if (this.blocked()) return;
    if (!this.isOpen) {
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); this.onAction('pause', null); }
      return;
    }
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'select', Space: 'select', Escape: 'back' };
    const ev = map[e.code];
    e.stopImmediatePropagation(); // no flying keys while a menu is open
    if (!ev || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((ev === 'select' || ev === 'back') && e.repeat) { e.preventDefault(); return; }
    if (ev === 'select' && this.current && this.current.tagName === 'SELECT') return; // let the browser open the list
    e.preventDefault();
    this.handle(ev);
  }

  // Call once per frame with the controller (or null). Returns true while a menu is open.
  update(pad, dt, canPause = true) {
    if (this.blocked()) { this.nav = createNav(); return this.isOpen; }
    const std = pad && pad.mapping === 'standard';
    const events = std ? navUpdate(this.nav, pad.buttons, pad.axes, dt) : [];
    if (!this.isOpen) { if (canPause && events.includes('pause')) this.onAction('pause', null); return this.isOpen; }
    for (const ev of events) { if (!this.isOpen) break; this.handle(ev); }
    return this.isOpen;
  }
}
