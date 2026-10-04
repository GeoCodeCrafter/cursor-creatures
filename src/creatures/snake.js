// skeleton snake. hold still and it circles you, then strikes.
// click and it bites its own tail and rolls away like a wheel.

import { createStage, line, dot, quad } from '../kit/stage.js';
import { approach, clamp, ease, followChain, lerp, unit } from '../kit/math.js';

const BONE = '#effff5';
const BG = '#06070b';

const stage = createStage({
  file: 'snake.js',
  hint: 'stop moving and it strikes · click for ouroboros',
  layers: [{ name: 'body', glow: 'rgba(80,255,150,0.55)' }],
  vars: { accent: 'rgba(140,255,190,0.9)' },
});

const N = 72;
const SEG = 15;
const RING_R = (N * SEG) / (Math.PI * 2);

const p = stage.pointer;
const J = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  J[i * 2] = -100 - i * SEG * 0.9;
  J[i * 2 + 1] = stage.H * 0.7 + Math.sin(i * 0.25) * 40;
}

let phase = 0;
let ang = 0;
// hunt -> circle -> rear -> lunge -> (hunt | circle) ; ring is the ouroboros
let mode = 'hunt';
let modeT = 0;
let lunge = null;
let missed = 0;
let bitten = 0;
let mouth = 0;

// ouroboros
let ring = null; // { from: Float32Array, c: [x,y], roll, v, t0 }

const setMode = (m, t) => {
  mode = m;
  modeT = t;
};

stage.on('click', () => {
  if (ring) return;
  ring = { t0: stage.t, from: J.slice(), roll: 0, v: 0, a0: 0, c: [0, 0] };
  // put the ring just behind the head, so the head is already on it
  const [dx, dy] = unit(J[0] - J[6], J[1] - J[7]);
  ring.c = [J[0] - dy * RING_R, J[1] + dx * RING_R];
  ring.a0 = Math.atan2(J[1] - ring.c[1], J[0] - ring.c[0]);
  // roll away from the cursor
  ring.dir = p.x > ring.c[0] ? -1 : 1;
  stage.headline('ouroboros.');
  stage.bump();
});

function target(t) {
  const cur = [p.x, p.y];
  const head = [J[0], J[1]];
  if (mode === 'hunt') {
    if (p.still > 0.8 && p.real) {
      setMode('circle', t);
      ang = Math.atan2(head[1] - cur[1], head[0] - cur[0]);
      stage.headline("don't move");
    }
    return { p: cur, rate: 5.2, wig: 1 };
  }
  if (mode === 'circle' && p.speed > 300) {
    setMode('hunt', t);
    stage.headline('move your mouse');
    return { p: cur, rate: 5.2, wig: 1 };
  }
  if (mode === 'circle') {
    ang += 1.9 / 120;
    if (t - modeT > 1.6) setMode('rear', t);
    return { p: [cur[0] + Math.cos(ang) * 250, cur[1] + Math.sin(ang) * 250], rate: 6, wig: 0.6 };
  }
  if (mode === 'rear') {
    // pull back into an S, facing you
    const d = unit(head[0] - cur[0], head[1] - cur[1]);
    if (t - modeT > 0.45) {
      setMode('lunge', t);
      lunge = cur;
      stage.headline('dodge.');
    }
    return { p: [cur[0] + d[0] * 280, cur[1] + d[1] * 280], rate: 6.5, wig: 0.3 };
  }
  // lunge
  if (t - modeT > 0.3) {
    const hit = Math.hypot(p.x - J[0], p.y - J[1]) < 45;
    if (hit) {
      bitten++;
      stage.shake(16);
      stage.headline('got you');
    } else {
      missed++;
      stage.headline('missed');
    }
    stage.bump();
    ang = Math.atan2(J[1] - p.y, J[0] - p.x);
    setMode(p.still > 0.3 ? 'circle' : 'hunt', t);
  }
  return { p: lunge, rate: 34, wig: 0 };
}

function step(dt, t) {
  if (ring) {
    stepRing(dt, t);
    return;
  }
  const { p: tp, rate, wig } = target(t);
  const [dx, dy] = unit(J[0] - J[4], J[1] - J[5]);
  const speed = Math.hypot(tp[0] - J[0], tp[1] - J[1]);
  phase += Math.min(speed, 500) * dt * 0.022;
  const w = Math.sin(phase) * Math.min(46, speed * 0.12) * wig;
  J[0] = approach(J[0], tp[0] - dy * w, rate, dt);
  J[1] = approach(J[1], tp[1] + dx * w, rate, dt);
  followChain(J, N, SEG, 0.32);
  const open = (mode === 'rear' && t - modeT > 0.25) || (mode === 'lunge' && t - modeT < 0.2);
  mouth = approach(mouth, open ? 1 : 0, 25, dt);
}

function stepRing(dt, t) {
  const r = ring;
  const s = t - r.t0;
  // curl up, roll for a couple of seconds, then let go
  const v = s < 0.3 ? 0 : s < 2.6 ? 900 : Math.max(0, 900 - (s - 2.6) * 1800);
  r.v = v;
  r.roll += v * dt * r.dir;
  const blend = Math.min(1, s / 0.25);
  // bounce it off the screen edges
  const cx = r.c[0] + r.roll;
  if ((cx < RING_R && r.dir < 0) || (cx > stage.W - RING_R && r.dir > 0)) r.dir *= -1;
  const cy = r.c[1] - Math.abs(Math.sin(r.roll / 140)) * 36 * Math.min(1, Math.abs(r.roll) / 200);
  const rot = r.roll / RING_R;
  for (let i = 0; i < N; i++) {
    const a = r.a0 - (i / N) * Math.PI * 2 * 0.985 + rot;
    const rx = cx + Math.cos(a) * RING_R;
    const ry = cy + Math.sin(a) * RING_R;
    J[i * 2] = lerp(r.from[i * 2], rx, blend);
    J[i * 2 + 1] = lerp(r.from[i * 2 + 1], ry, blend);
  }
  mouth = 1;
  if (s > 3.1) {
    // let go of the tail and carry on hunting
    ring = null;
    setMode('hunt', t);
    stage.headline('move your mouse');
  }
}

const P = (i) => [J[i * 2], J[i * 2 + 1]];
const dir = (a, b) => unit(a[0] - b[0], a[1] - b[1]);
const width = (i) => {
  const u = i / N;
  return 38 * Math.min(1, u * 9) * (1 - Math.pow(u, 1.6)) + 3;
};

function draw(ctx, t) {
  const c = ctx.body;
  const pts = Array.from({ length: N }, (_, i) => P(i));
  c.strokeStyle = BONE;
  c.fillStyle = BONE;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  c.lineWidth = 3.4;
  line(c, pts);
  c.stroke();

  for (let i = 3; i < N - 2; i++) {
    const d = dir(pts[i - 1], pts[i + 1]);
    const n = [-d[1], d[0]];
    const len = width(i);
    const back = [-d[0] * len * 0.45, -d[1] * len * 0.45];
    c.lineWidth = i < N * 0.75 ? 2.2 : 1.6;
    c.beginPath();
    for (const s of [-1, 1]) {
      const end = [pts[i][0] + n[0] * len * s + back[0], pts[i][1] + n[1] * len * s + back[1]];
      const ctl = [pts[i][0] + n[0] * len * 0.75 * s, pts[i][1] + n[1] * len * 0.75 * s];
      quad(c, pts[i], ctl, end);
    }
    c.stroke();
    if (i % 2 === 0) dot(c, pts[i][0], pts[i][1], 3.6);
  }
  dot(c, pts[N - 1][0], pts[N - 1][1], 4);

  // skull, fangs out when it strikes
  const h = pts[0];
  const d = dir(pts[0], pts[3]);
  const n = [-d[1], d[0]];
  const m = mouth;
  const pt = (f, s) => [h[0] + d[0] * f + n[0] * s, h[1] + d[1] * f + n[1] * s];
  c.lineWidth = 3.4;
  line(c, [pt(46, 0), pt(30, 15 + 7 * m), pt(4, 22 + 5 * m), pt(-18, 20), pt(-30, 9), pt(-32, 0), pt(-30, -9), pt(-18, -20), pt(4, -22 - 5 * m), pt(30, -15 - 7 * m)], true);
  c.fillStyle = BG;
  c.fill();
  c.stroke();
  c.fillStyle = BONE;
  const a = Math.atan2(d[1], d[0]);
  for (const s of [-1, 1]) {
    const e = pt(6, 11 * s);
    c.beginPath();
    c.ellipse(e[0], e[1], 7, 4.5, a, 0, Math.PI * 2);
    c.fill();
    if (m > 0.3) {
      c.lineWidth = 4;
      line(c, [pt(36, 9 * s), pt(56, 5 * s)]);
      c.stroke();
    }
  }
  // forked tongue flicking (not mid strike)
  const flick = m < 0.1 && !ring ? Math.max(0, Math.sin(t * 9)) : 0;
  if (flick > 0.2) {
    const a0 = pt(46, 0);
    const b = pt(46 + 34 * flick, Math.sin(t * 40) * 3);
    c.strokeStyle = '#ff4f6d';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(a0[0], a0[1]);
    c.lineTo(b[0], b[1]);
    const c1 = pt(58 + 36 * flick, 9);
    const c2 = pt(58 + 36 * flick, -9);
    c.lineTo(c1[0], c1[1]);
    c.moveTo(b[0], b[1]);
    c.lineTo(c2[0], c2[1]);
    c.stroke();
  }
}

stage.headline('move your mouse');
stage.run({
  step,
  draw(ctx, t) {
    draw(ctx, t);
    const status = ring ? 'rolling' : mode === 'hunt' ? 'hunting' : `missed ${missed} · bit you ${bitten}`;
    stage.stats(`vertebrae ${N} · ${status}`);
  },
});
