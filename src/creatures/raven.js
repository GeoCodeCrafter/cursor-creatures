// skeleton ravens, side view. one follows you around. hold still and it lands on
// the cursor. every click another one lands on top. move too fast and the tower goes over.

import { createStage, line, dot } from '../kit/stage.js';
import { approach, clamp, ease, hash, lerp } from '../kit/math.js';

const BONE = '#f4f2ff';
const BG = '#06070b';
const S = 1.3;
const SPACING = 90;
const FLY_T = 0.5;
const MAX = 12;

const stage = createStage({
  file: 'ravens.js',
  hint: 'hold still, then click · move gently',
  layers: [{ name: 'body', glow: 'rgba(150,130,255,0.65)' }],
  vars: { accent: 'rgba(190,175,255,0.95)' },
  ripple: 'rgba(210,200,255,0.8)',
});

const p = stage.pointer;

// cursor history so the leader can follow a slightly delayed copy of it
const hist = [];
const pastCursor = (t, lag) => {
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i].t <= t - lag) return hist[i];
  return hist[0] || { x: p.x, y: p.y };
};

// the leader: 'follow' | 'landing' | 'perched' | 'gone'
let leader = { mode: 'follow', x: p.x - 400, y: p.y - 300, f: 1, t0: 0, from: [0, 0], back: 0 };
let stack = []; // ravens above the leader: { landAt, fromLeft, y0 }
let flyers = []; // scattering ravens
let feathers = [];
let lean = 0;
let leanV = 0;
let toppling = false;
let ax = 0;
let lastVx = 0;

const perchedCount = () => (leader.mode === 'perched' ? 1 + stack.filter((r) => stage.t >= r.landAt).length : 0);

stage.on('click', () => {
  if (leader.mode !== 'perched' || toppling) return;
  if (stack.length >= MAX - 1) {
    stage.headline('no more room');
    return;
  }
  stack.push({ landAt: stage.t + FLY_T, fromLeft: stack.length % 2 === 0, y0: 380 + Math.random() * 300 });
  const n = stack.length + 1;
  stage.headline(n >= 6 ? 'careful…' : n >= 4 ? 'one more?' : 'click');
});

// where each perched raven's feet are: a stack that bends as the tower leans
function tower(t, count) {
  const feet = [[p.x, p.y]];
  const tilts = [];
  let ang = 0;
  const sway = (0.02 + 0.01 * count) * Math.sin(t * 2.6);
  for (let i = 0; i < count; i++) {
    ang += (lean + sway) / Math.max(1, count) * (i === 0 ? 1.4 : 1);
    tilts.push(ang);
    const f = feet[i];
    feet.push([f[0] + Math.sin(ang) * SPACING * S, f[1] - Math.cos(ang) * SPACING * S]);
  }
  return { feet, tilts };
}

function scatter(t) {
  const n = perchedCount();
  const tw = tower(t, n);
  flyers = [];
  for (let i = 0; i < n; i++) {
    const dirx = i % 2 === 0 ? -1 : 1;
    flyers.push({ x: tw.feet[i][0], y: tw.feet[i][1], vx: dirx * (300 + hash(i, 1) * 600), vy: -500 - hash(i, 2) * 700, f: dirx, t0: t, k: i });
  }
  feathers = [];
  for (let i = 0; i < 14; i++) {
    const at = tw.feet[1 + Math.floor(hash(i, 3) * Math.max(1, n - 1))] || tw.feet[0];
    feathers.push({ x0: at[0], y0: at[1] - 60, t0: t, k: i, hero: i === 0 });
  }
  stack = [];
  leader = { mode: 'gone', x: -300, y: 200, f: 1, t0: t, from: [0, 0], back: t + 2.6 };
  lean = 0;
  leanV = 0;
  toppling = false;
  stage.shake(18);
  stage.bump();
  stage.headline('');
}

function step(dt, t) {
  hist.push({ t, x: p.x, y: p.y });
  while (hist.length > 120) hist.shift();
  ax = (p.vx - lastVx) / dt;
  lastVx = p.vx;

  if (leader.mode === 'follow') {
    const c = pastCursor(t, 0.32);
    const c2 = pastCursor(t, 0.36);
    const tx = c.x - 30;
    const ty = c.y - 150 + Math.sin(t * 3) * 14;
    leader.x = approach(leader.x, tx, 8, dt);
    leader.y = approach(leader.y, ty, 8, dt);
    if (Math.abs(c.x - c2.x) > 0.5) leader.f = c.x >= c2.x ? 1 : -1;
    if (p.still > 0.6 && p.real && Math.hypot(leader.x - tx, leader.y - ty) < 60) {
      leader.mode = 'landing';
      leader.t0 = t;
      leader.from = [leader.x, leader.y];
      stage.headline('hold still');
    }
  } else if (leader.mode === 'landing') {
    const k = clamp((t - leader.t0) / 0.3);
    leader.x = lerp(leader.from[0], p.x, ease.inOut(k));
    leader.y = lerp(leader.from[1], p.y, ease.inOut(k));
    if (p.speed > 600) leader.mode = 'follow';
    else if (k >= 1) {
      leader.mode = 'perched';
      stage.headline('click');
      stage.bump();
    }
  } else if (leader.mode === 'perched') {
    const n = perchedCount();
    // the tower is a spring that gets floppier the taller it is
    const stiff = 40 / (0.6 + n * 0.5);
    if (toppling) leanV += Math.sign(lean) * 9 * dt; // past the point of no return
    else leanV += (-stiff * lean - 3 * leanV - ax * 0.0006 * Math.sqrt(n)) * dt;
    lean += leanV * dt;
    if (n >= 3 && Math.abs(lean) > 0.3) toppling = true;
    if (toppling && Math.abs(lean) > 1.1) scatter(t);
    else if (n < 3 && p.speed > 700) {
      // just one or two on there: they hop off and follow again
      stack = [];
      leader.mode = 'follow';
      lean = 0;
      leanV = 0;
      stage.headline('move your mouse');
    }
  } else if (leader.mode === 'gone' && t > leader.back) {
    leader = { mode: 'follow', x: -200, y: 120, f: 1, t0: t, from: [0, 0], back: 0 };
    stage.headline('move your mouse');
  }
}

// one skeleton raven. local units: ~120 long, feet at (0, 0)
function raven(c, { x, y, f, tilt, fold, flap, beak, alpha = 1 }) {
  const a = Math.sin(flap);
  const sh = [14, -86];
  const up = lerp(a * 1.1, 0, fold);
  const hum = lerp(-1.9 + up * 0.9, 2.75, fold);
  const ul = lerp(-2.1 + up * 1.2, -0.25, fold);
  const hd = lerp(-2.4 + up * 1.4, 2.95, fold);
  const el = [sh[0] + Math.cos(hum) * 44, sh[1] + Math.sin(hum) * 44];
  const wr = [el[0] + Math.cos(ul) * 50, el[1] + Math.sin(ul) * 50];
  const tip = [wr[0] + Math.cos(hd) * 40, wr[1] + Math.sin(hd) * 40];

  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.rotate(tilt);
  c.scale(f * S, S);

  // legs: gripping when perched, tucked when flying
  c.lineWidth = 3;
  if (fold > 0.5) {
    line(c, [[-6, -46], [6, -24], [0, 0]]);
    c.stroke();
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(-16, 2);
    c.lineTo(0, 0);
    c.lineTo(18, 2);
    c.moveTo(0, 0);
    c.lineTo(12, 9);
    c.moveTo(0, 0);
    c.lineTo(-8, 8);
    c.stroke();
  } else {
    line(c, [[-6, -46], [-22, -32], [-44, -36]]);
    c.stroke();
  }
  // tail feathers
  c.lineWidth = 1.8;
  c.beginPath();
  for (const dy of [-10, -4, 2, 8, 14]) {
    c.moveTo(-42, -58);
    c.lineTo(-108, -62 + dy * 1.6);
  }
  c.stroke();
  // rib cage, keel, spine
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(0, -64, 34, 24, 0, 0, Math.PI * 2);
  c.fillStyle = BG;
  c.fill();
  c.stroke();
  c.lineWidth = 2;
  c.beginPath();
  for (const rx of [-18, -6, 6, 18]) {
    c.moveTo(rx, -86);
    c.quadraticCurveTo(rx + 4, -64, rx - 2, -42);
  }
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(22, -46);
  c.quadraticCurveTo(0, -28, -24, -40);
  c.stroke();
  line(c, [[-44, -58], [-20, -78], [14, -86], [30, -90]]);
  c.stroke();
  // neck, skull, beak
  c.beginPath();
  c.moveTo(30, -90);
  c.quadraticCurveTo(44, -98, 48, -112);
  c.stroke();
  c.fillStyle = BONE;
  for (const u of [0.3, 0.6]) dot(c, 30 + 18 * u, -90 - 22 * u, 3);
  c.beginPath();
  c.arc(52, -122, 17, 0, Math.PI * 2);
  c.fillStyle = BG;
  c.fill();
  c.stroke();
  c.fillStyle = BONE;
  dot(c, 56, -125, 6);
  c.fillStyle = BG;
  c.lineWidth = 2.6;
  line(c, [[64, -130], [104, -122 - beak * 4], [66, -118]], true);
  c.fill();
  c.stroke();
  if (beak > 0.05) {
    c.lineWidth = 2.4;
    line(c, [[64, -116], [98, -112 + beak * 14], [62, -110]], true);
    c.fill();
    c.stroke();
  }
  // the wing
  c.lineWidth = 3.2;
  line(c, [sh, el, wr, tip]);
  c.stroke();
  c.fillStyle = BONE;
  dot(c, el[0], el[1], 3.4);
  dot(c, wr[0], wr[1], 3);
  c.lineWidth = 1.8;
  c.beginPath();
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const base = u < 0.5 ? [lerp(el[0], wr[0], u * 2), lerp(el[1], wr[1], u * 2)] : [lerp(wr[0], tip[0], (u - 0.5) * 2), lerp(wr[1], tip[1], (u - 0.5) * 2)];
    const ang = lerp(hum + Math.PI * 0.55, hd + 0.5, u) + lerp(0, 0.25, fold);
    const len = lerp(46, 86, u) * lerp(1, 0.8, fold);
    const fa = lerp(ang, Math.PI - 0.1 + u * 0.12, fold);
    c.moveTo(base[0], base[1]);
    c.lineTo(base[0] + Math.cos(fa) * len, base[1] + Math.sin(fa) * len);
  }
  c.stroke();
  c.restore();
}

function feather(c, x, y, rot, sc, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.rotate(rot);
  c.scale(sc, sc);
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, -30);
  c.quadraticCurveTo(10, -10, 2, 26);
  c.moveTo(0, -30);
  c.quadraticCurveTo(-10, -10, 2, 26);
  c.moveTo(1, -28);
  c.lineTo(2, 30);
  c.stroke();
  c.lineWidth = 1.2;
  c.beginPath();
  [-18, -10, -2, 6, 14].forEach((yy, k) => {
    c.moveTo(1.5, yy);
    c.lineTo(-9 + k, yy - 6);
    c.moveTo(1.5, yy);
    c.lineTo(11 - k, yy - 6);
  });
  c.stroke();
  c.restore();
}

const bez = (a, k, b, u) => [(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * k[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * k[1] + u * u * b[1]];

function draw(ctx, t) {
  const c = ctx.body;
  c.strokeStyle = BONE;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  const n = perchedCount();
  const tw = tower(t, Math.max(1, n));

  // leader
  if (leader.mode === 'follow' || leader.mode === 'landing') {
    const fold = leader.mode === 'landing' ? clamp((t - leader.t0) / 0.3) : 0;
    raven(c, { x: leader.x, y: leader.y, f: leader.f, tilt: 0, fold, flap: t * 16, beak: 0 });
  } else if (leader.mode === 'perched') {
    raven(c, { x: tw.feet[0][0], y: tw.feet[0][1], f: 1, tilt: tw.tilts[0] || 0, fold: 1, flap: 0, beak: 0 });
  }

  // the stack (and anyone still flying in)
  stack.forEach((r, j) => {
    const i = j + 1;
    if (t < r.landAt) {
      const u = ease.out(clamp((t - (r.landAt - FLY_T)) / FLY_T));
      const from = [r.fromLeft ? -180 : stage.W + 180, r.y0];
      const to = tw.feet[Math.min(i, tw.feet.length - 1)];
      const ctl = [lerp(from[0], to[0], 0.5), Math.min(from[1], to[1]) - 260];
      const q = bez(from, ctl, to, u);
      raven(c, { x: q[0], y: q[1], f: r.fromLeft ? 1 : -1, tilt: 0, fold: clamp((u - 0.75) * 4), flap: t * 20, beak: 0 });
      return;
    }
    const caw = [r.landAt + 0.35, r.landAt + 0.55].some((a) => t >= a && t < a + 0.12) ? 1 : 0;
    const settle = Math.max(0, 1 - (t - r.landAt) / 0.25);
    const ft = tw.feet[i] || tw.feet[tw.feet.length - 1];
    raven(c, { x: ft[0], y: ft[1] - 6 * settle, f: i % 2 === 0 ? 1 : -1, tilt: tw.tilts[i] || 0, fold: 1, flap: 0, beak: caw });
  });

  // scattering
  flyers = flyers.filter((r) => t - r.t0 < 3);
  for (const r of flyers) {
    const s = t - r.t0;
    raven(c, { x: r.x + r.vx * s, y: r.y + r.vy * s + 120 * s * s, f: r.f, tilt: -0.3 * r.f, fold: Math.max(0, 1 - s * 6), flap: t * 22 + r.k, beak: 0.4 });
  }

  // feathers. one drifts down onto the cursor
  feathers = feathers.filter((fe) => fe.hero || t - fe.t0 < 2.4);
  for (const fe of feathers) {
    const s = t - fe.t0;
    if (fe.hero) {
      const u = clamp(s / 2.2);
      const x = lerp(fe.x0, p.x + 8, u) + Math.sin(u * Math.PI * 4) * 90 * (1 - u);
      const y = lerp(fe.y0, p.y - 18, ease.inOut(u));
      const rot = ((Math.sin(u * Math.PI * 4) * 40 - 20) * Math.PI) / 180;
      feather(c, x, y, rot, 1.4, u >= 1 ? clamp(1 - (s - 2.2) / 1.5) : 1);
      if (s > 3.7) fe.hero = false;
    } else {
      const x = fe.x0 + (hash(fe.k, 5) - 0.5) * 500 * Math.min(1, s) + Math.sin(s * 3 + fe.k) * 40;
      const y = fe.y0 + s * (60 + hash(fe.k, 6) * 120);
      feather(c, x, y, (Math.sin(s * 3 + fe.k) * 50 * Math.PI) / 180, 0.8 + hash(fe.k, 7) * 0.5, Math.max(0, 1 - s / 2.2));
    }
  }

  stage.stats(leader.mode === 'gone' ? 'ravens 0 · feathers everywhere' : `ravens perched ${n} · cursor load ${(n * 1.2).toFixed(1)} kg`);
}

stage.headline('move your mouse');
stage.run({ step, draw });
