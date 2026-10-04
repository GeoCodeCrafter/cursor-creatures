// skeleton centipede. every click splits every centipede in half.
// at eight, the next click merges them into one giant one.

import { createStage, line, dot, quad } from '../kit/stage.js';
import { approach, clamp, ease, followChain, ik2, unit } from '../kit/math.js';

const BONE = '#fff6e6';
const BG = '#06070b';

const stage = createStage({
  file: 'centipede.js',
  hint: 'click to split it · stop moving and they surround you',
  layers: [{ name: 'body', glow: 'rgba(255,175,60,0.6)' }],
  vars: { accent: 'rgba(255,205,130,0.95)' },
  ripple: 'rgba(255,220,160,0.8)',
});

const CAP = 64;
const SEG = 14;
const GIANT_SCALE = 1.9;

const p = stage.pointer;

const make = (joints, scale = 1, born = -10) => ({ J: joints, n: joints.length / 2, scale, dist: 0, born, id: Math.random() });

function fresh() {
  const J = new Float32Array(CAP * 2);
  for (let i = 0; i < CAP; i++) {
    J[i * 2] = -60 - i * SEG * 0.9;
    J[i * 2 + 1] = stage.H * 0.7 + Math.sin(i * 0.3) * 30;
  }
  return make(J);
}

let pedes = [fresh()];
let giant = false;
let phase = 0;

stage.on('click', (x, y) => {
  const t = stage.t;
  stage.bump();
  stage.shake(10);
  if (giant) {
    // the giant shrinks back down to one normal centipede
    const g = pedes[0];
    const J = new Float32Array(CAP * 2);
    for (let i = 0; i < CAP; i++) {
      J[i * 2] = g.J[i * 2];
      J[i * 2 + 1] = g.J[i * 2 + 1];
    }
    pedes = [make(J, 1, t)];
    giant = false;
    stage.headline('move your mouse');
    return;
  }
  if (pedes.length >= 8) {
    // eight become one giant, pouring out of the spot they meet
    const J = new Float32Array(CAP * 2);
    for (let i = 0; i < CAP; i++) {
      J[i * 2] = x - i * 0.6;
      J[i * 2 + 1] = y + i * 0.3;
    }
    pedes = [make(J, GIANT_SCALE, t)];
    giant = true;
    stage.shake(30);
    stage.headline('RUN.');
    return;
  }
  // snap every one in half. the back half grows a head where it broke
  const next = [];
  for (const c of pedes) {
    const half = Math.floor(c.n / 2);
    const a = make(c.J.slice(0, half * 2), c.scale, c.born);
    const b = make(c.J.slice(half * 2), c.scale, t);
    a.dist = c.dist;
    b.dist = c.dist + 37;
    next.push(a, b);
  }
  pedes = next;
  stage.headline(['click.', 'again.', 'stop clicking'][Math.min(2, Math.log2(pedes.length) - 1)]);
});

function target(c, k, t) {
  const cur = [p.x, p.y];
  if (giant) return { p: cur, rate: 6.5 };
  const n = pedes.length;
  if (n === 1) return { p: cur, rate: 5.4 };
  if (p.still > 0.6 && p.real) {
    // a carousel round the cursor
    const a = (k / n) * Math.PI * 2 + t * 1.7;
    return { p: [cur[0] + Math.cos(a) * 240, cur[1] + Math.sin(a) * 240], rate: 7 };
  }
  // close in from different sides
  const a = (k / n) * Math.PI * 2 + t * 0.6;
  const r = 150 + 40 * n;
  return { p: [cur[0] + Math.cos(a) * r, cur[1] + Math.sin(a) * r], rate: 4.2 + 0.4 * (k % 3) };
}

function step(dt, t) {
  phase += dt;
  pedes.forEach((c, k) => {
    const { p: tp, rate } = target(c, k, t);
    const J = c.J;
    const [dx, dy] = unit(J[0] - J[4], J[1] - J[5]);
    const w = Math.sin(phase * 7 + k) * 10;
    const nx = approach(J[0], tp[0] - dy * w, rate, dt);
    const ny = approach(J[1], tp[1] + dx * w, rate, dt);
    c.dist += Math.hypot(nx - J[0], ny - J[1]);
    J[0] = nx;
    J[1] = ny;
    followChain(J, c.n, SEG * c.scale, 0.42);
  });
}

const dir = (a, b) => unit(a[0] - b[0], a[1] - b[1]);

function drawOne(cx, c, k, t) {
  const { J, n, scale, dist } = c;
  const P = Array.from({ length: n }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
  const w = (i) => (i >= n - 3 ? 11 + (n - 1 - i) * 2 : 16) * scale;
  const s0 = clamp((t - c.born) / 0.35);
  const pop = c.born > 0 ? ease.back(s0) : 1;
  const stride = 64 * scale;
  const sq = Math.sqrt(scale);

  // legs, rippling down the body as it walks
  cx.lineWidth = 2.2 * sq;
  for (let i = 1; i < n - 1; i++) {
    const d = dir(P[i - 1], P[i + 1]);
    const nn = [-d[1], d[0]];
    for (const s of [-1, 1]) {
      const ph = (dist / stride) * Math.PI * 2 - i * 0.75 + (s > 0 ? Math.PI : 0);
      const hip = [P[i][0] + nn[0] * s * w(i), P[i][1] + nn[1] * s * w(i)];
      const reach = 34 * scale;
      const foot = [hip[0] + nn[0] * s * reach + d[0] * Math.cos(ph) * 16 * scale, hip[1] + nn[1] * s * reach + d[1] * Math.cos(ph) * 16 * scale];
      const k1 = ik2(hip, foot, 20 * scale, 24 * scale, 1);
      const k2 = ik2(hip, foot, 20 * scale, 24 * scale, -1);
      const far = (q) => (q[0] - P[i][0]) ** 2 + (q[1] - P[i][1]) ** 2;
      const knee = far(k1) > far(k2) ? k1 : k2;
      line(cx, [hip, knee, foot]);
      cx.stroke();
      if (Math.sin(ph) > 0.3) dot(cx, foot[0], foot[1], 2.4 * scale);
    }
  }

  // spine + plates
  cx.lineWidth = 3 * sq;
  line(cx, P);
  cx.stroke();
  cx.lineWidth = 2.6 * sq;
  cx.beginPath();
  for (let i = 1; i < n; i++) {
    const d = dir(P[i - 1], P[Math.min(n - 1, i + 1)]);
    const nn = [-d[1], d[0]];
    const a = [P[i][0] + nn[0] * w(i), P[i][1] + nn[1] * w(i)];
    const b = [P[i][0] - nn[0] * w(i), P[i][1] - nn[1] * w(i)];
    const ctl = [P[i][0] - d[0] * 8 * scale, P[i][1] - d[1] * 8 * scale];
    quad(cx, a, ctl, b);
  }
  cx.stroke();

  // tail feelers
  if (n > 3) {
    const tl = P[n - 1];
    const d = dir(P[n - 2], P[n - 1]);
    const nn = [-d[1], d[0]];
    cx.lineWidth = 2;
    cx.beginPath();
    for (const s of [-1, 1]) {
      cx.moveTo(tl[0], tl[1]);
      cx.lineTo(tl[0] - d[0] * 46 * scale + nn[0] * s * 22 * scale, tl[1] - d[1] * 46 * scale + nn[1] * s * 22 * scale);
    }
    cx.stroke();
  }

  // head: plate, fangs, long antennae that sway
  const h = P[0];
  const d = dir(P[0], P[Math.min(2, n - 1)]);
  const nn = [-d[1], d[0]];
  const pt = (f, s) => [h[0] + (d[0] * f + nn[0] * s) * scale * pop, h[1] + (d[1] * f + nn[1] * s) * scale * pop];
  cx.lineWidth = 3;
  line(cx, [pt(22, 0), pt(14, 16), pt(-6, 20), pt(-12, 0), pt(-6, -20), pt(14, -16)], true);
  cx.fillStyle = BG;
  cx.fill();
  cx.stroke();
  cx.fillStyle = BONE;
  for (const s of [-1, 1]) {
    const e = pt(6, 9 * s);
    dot(cx, e[0], e[1], 4 * scale);
    cx.lineWidth = 3;
    cx.beginPath();
    quad(cx, pt(18, 10 * s), pt(34, 14 * s), pt(32, 4 * s));
    cx.stroke();
    const sway = Math.sin(t * 6 + k + s) * 14;
    cx.lineWidth = 2;
    cx.beginPath();
    quad(cx, pt(20, 8 * s), pt(60, (34 + sway) * s), pt(96, (54 - sway) * s));
    cx.stroke();
  }
}

stage.headline('move your mouse');
stage.run({
  step,
  draw(ctx, t) {
    const cx = ctx.body;
    cx.strokeStyle = BONE;
    cx.fillStyle = BONE;
    cx.lineCap = 'round';
    cx.lineJoin = 'round';
    pedes.forEach((c, k) => drawOne(cx, c, k, t));
    const legs = pedes.reduce((s, c) => s + Math.max(0, c.n - 2) * 2, 0);
    stage.stats(`centipedes ${pedes.length} · legs ${legs}`);
  },
});
