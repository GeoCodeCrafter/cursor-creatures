// the page every creature lives on: stacked canvases, pointer tracking,
// a fixed-step loop, plus the ghost headline + readout in the corner.
//
// everything is in "world units". the world is the screen divided by Z, so a
// creature is roughly the same size relative to the screen on a phone and a laptop.

import { clamp } from './math.js';

const ARROW = new Path2D('M2 2 L2 30 L9 23.5 L13.5 34 L18 32 L13.5 21.8 L22.5 21.8 Z');

export function createStage(opts) {
  const {
    file,
    hint = '',
    layers = [{ name: 'main' }],
    theme = 'dark',
    vars = {},
  } = opts;

  document.body.classList.add('stage', `theme-${theme}`);
  // ?clean hides the corner text, handy for screen recording
  if (new URLSearchParams(location.search).has('clean')) document.body.classList.add('clean');
  for (const [k, v] of Object.entries(vars)) document.body.style.setProperty(`--${k}`, v);

  const el = (tag, cls, parent = document.body) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    parent.appendChild(e);
    return e;
  };

  el('div', 'dots');
  const ghost = el('h1', 'ghost');
  const back = el('a', 'back');
  back.href = '../';
  back.textContent = '← all creatures';
  const readout = el('div', 'readout');
  el('div', 'file', readout).textContent = file;
  const statsEl = el('div', 'stats', readout);
  const hintEl = el('div', 'hint');
  hintEl.textContent = hint;

  // canvases, bottom to top. the cursor always gets its own on top
  const canvases = {};
  const all = [];
  for (const l of [...layers, { name: 'cursor' }]) {
    const c = el('canvas', `layer layer-${l.name}`);
    if (l.glow) c.style.filter = `drop-shadow(0 0 ${l.blur ?? 7}px ${l.glow})`;
    if (l.blend) c.style.mixBlendMode = l.blend;
    if (l.filter) c.style.filter = l.filter;
    if (l.opacity != null) c.style.opacity = l.opacity;
    const ctx = c.getContext('2d');
    canvases[l.name] = ctx;
    all.push({ c, ctx });
  }

  const stage = {
    Z: 1,
    W: 0,
    H: 0,
    t: 0,
    ctx: canvases,
    pointer: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      speed: 0,
      still: 0,
      down: false,
      real: false, // false until the visitor actually moves the mouse
    },
    cursor: {
      hidden: false,
      // set this to draw the arrow somewhere other than the pointer (stuck, carried off...)
      override: null,
    },
    ghost,
    rand: Math.random,
  };

  let dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    stage.Z = clamp(Math.min(w, h) / 1000, 0.36, 1);
    stage.W = w / stage.Z;
    stage.H = h / stage.Z;
    document.body.style.setProperty('--z', stage.Z);
    for (const { c } of all) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
  };
  resize();
  window.addEventListener('resize', resize);

  // ── pointer ──────────────────────────────────────────────────────────────
  const p = stage.pointer;
  p.x = stage.W * 0.5;
  p.y = stage.H * 0.55;
  let lastMove = { x: p.x, y: p.y };
  const handlers = { click: [], dblclick: [], down: [], up: [] };
  stage.on = (name, fn) => handlers[name].push(fn);
  const ripples = [];

  const toWorld = (e) => [e.clientX / stage.Z, e.clientY / stage.Z];
  window.addEventListener('pointermove', (e) => {
    const [x, y] = toWorld(e);
    if (!p.real) {
      p.real = true;
      document.body.classList.add('touched');
    }
    p.x = x;
    p.y = y;
  });
  let lastDown = -1;
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('a')) return;
    const [x, y] = toWorld(e);
    p.real = true;
    document.body.classList.add('touched');
    p.x = x;
    p.y = y;
    p.down = true;
    ripples.push({ x, y, t: stage.t });
    for (const fn of handlers.down) fn(x, y);
    for (const fn of handlers.click) fn(x, y);
    if (stage.t - lastDown < 0.32) for (const fn of handlers.dblclick) fn(x, y);
    lastDown = stage.t;
  });
  window.addEventListener('pointerup', () => {
    p.down = false;
    for (const fn of handlers.up) fn(p.x, p.y);
  });

  // before anyone touches the mouse, a ghost hand moves it around so the page isn't dead
  const autopilot = (t) => {
    const { W, H } = stage;
    p.x = W * 0.5 + Math.cos(t * 0.55) * W * 0.3 + Math.sin(t * 1.4) * W * 0.06;
    p.y = H * 0.55 + Math.sin(t * 0.8) * H * 0.22;
  };

  // ── headline + readout ───────────────────────────────────────────────────
  let headlineText = null;
  stage.headline = (text) => {
    if (text === headlineText) return;
    headlineText = text;
    ghost.textContent = text;
    ghost.classList.remove('pop');
    void ghost.offsetWidth; // restart the animation
    ghost.classList.add('pop');
  };
  let statsText = null;
  stage.stats = (text) => {
    if (text === statsText) return;
    statsText = text;
    statsEl.textContent = text;
  };
  stage.bump = () => {
    statsEl.classList.remove('bump');
    void statsEl.offsetWidth;
    statsEl.classList.add('bump');
  };

  // ── screen shake ─────────────────────────────────────────────────────────
  let shake = 0;
  stage.shake = (amount) => {
    shake = Math.max(shake, amount);
  };

  // ── cursor ───────────────────────────────────────────────────────────────
  // `size` is relative to a normal cursor (1 = same size as the real one)
  stage.drawArrow = (ctx, x, y, { scale = 1, size, angle = 0, fill = '#000', stroke = '#fff', alpha = 1 } = {}) => {
    const k = (size !== undefined ? size * 1.1 : scale) / stage.Z;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(k, k);
    ctx.translate(-2, -2);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.fill(ARROW);
    ctx.stroke(ARROW);
    ctx.restore();
  };

  const drawCursor = (ctx) => {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const s = stage.t - r.t;
      if (s > 0.45) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(r.x, r.y, (14 + s * 120) / stage.Z, 0, Math.PI * 2);
      ctx.strokeStyle = opts.ripple || 'rgba(255,255,255,0.7)';
      ctx.globalAlpha = 1 - s / 0.45;
      ctx.lineWidth = 2.5 / stage.Z;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (stage.cursor.hidden) return;
    const o = stage.cursor.override;
    if (o) stage.drawArrow(ctx, o.x, o.y, o);
    else stage.drawArrow(ctx, p.x, p.y, { scale: 1.1 });
  };

  // ── the loop ─────────────────────────────────────────────────────────────
  const DT = 1 / 120;
  stage.run = ({ step, draw }) => {
    let prev = performance.now();
    let acc = 0;
    const frame = (now) => {
      const real = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      acc += real;
      while (acc >= DT) {
        acc -= DT;
        stage.t += DT;
        if (!p.real) autopilot(stage.t);
        const vx = (p.x - lastMove.x) / DT;
        const vy = (p.y - lastMove.y) / DT;
        p.vx += (vx - p.vx) * 0.2;
        p.vy += (vy - p.vy) * 0.2;
        p.speed = Math.hypot(p.vx, p.vy);
        if (Math.hypot(p.x - lastMove.x, p.y - lastMove.y) > 0.4) p.still = 0;
        else p.still += DT;
        lastMove = { x: p.x, y: p.y };
        step(DT, stage.t);
      }
      shake *= Math.exp(-9 * real);
      const sx = (Math.random() - 0.5) * shake;
      const sy = (Math.random() - 0.5) * shake;
      for (const { c, ctx } of all) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        const k = dpr * stage.Z;
        ctx.setTransform(k, 0, 0, k, sx * k, sy * k);
      }
      draw(canvases, stage.t);
      drawCursor(canvases.cursor);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  return stage;
}

// small path helpers so the creature files stay readable
export function line(ctx, pts, close = false) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

export function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
}

export function quad(ctx, a, c, b) {
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
}

// newer creatures are written as { meta, create(stage) } so the same file can also
// be driven by a scripted cursor (that's how the videos get made)
export function play(mod) {
  const stage = createStage(mod.meta);
  if (mod.meta.ghost === false) stage.ghost.hidden = true;
  stage.run(mod.create(stage));
  return stage;
}
