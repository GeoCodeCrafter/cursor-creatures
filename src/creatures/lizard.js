// skeleton lizard. chases the cursor, legs plant and step like a real one.
// click to feed it (it grows). once it's full, stop moving and see what happens

import { createStage, line, dot, quad } from '../kit/stage.js';
import { approach, clamp, ease, lerp, unit } from '../kit/math.js';

const BONE = '#eef7ff';
const BG = '#06070b';

const stage = createStage({
  file: 'lizard.js',
  hint: 'click to feed it',
  layers: [{ name: 'body', glow: 'rgba(0,230,255,0.55)' }],
  vars: { accent: 'rgba(160,240,255,0.85)' },
});

const MAXJ = 114;
const K = 1.15;
const SEG = 17 * K;
const MAX_BEND = 0.3;
const LEG_JOINTS = [9, 21, 35, 49, 63, 77, 91];
const LEGS = LEG_JOINTS.length * 2;
const UPPER = 58 * K;
const LOWER = 62 * K;
const REACH = 104 * K;
const STEP_AT = 60 * K;
const STEP_TIME = 0.1;

const p = stage.pointer;
const J = new Float32Array(MAXJ * 2);
for (let i = 0; i < MAXJ; i++) {
  J[i * 2] = p.x - 60 - i * SEG * 0.9;
  J[i * 2 + 1] = p.y + 40 + Math.sin(i * 0.3) * 20;
}
const feet = new Float32Array(LEGS * 2);
const from = new Float32Array(LEGS * 2);
const to = new Float32Array(LEGS * 2);
const stepT = new Float32Array(LEGS);
const stepping = new Uint8Array(LEGS);
const lift = new Float32Array(LEGS);

const FULL = 110;
let N = 46; // visible segments
let targetN = 46;
let phase = 0;
let blinkAt = 3;

// chase -> trap (circles you like a python) -> swallow -> spit
let mode = 'chase';
let modeT = 0;
let trapC = [0, 0];
let orbit0 = 0;
let cooldown = 0;
let sw = -1; // where the swallowed cursor is along the spine

function setMode(m, t) {
  mode = m;
  modeT = t;
}

function legGeom(li) {
  const a = LEG_JOINTS[li >> 1];
  const side = li % 2 === 0 ? -1 : 1;
  const hx = J[a * 2];
  const hy = J[a * 2 + 1];
  const [fx, fy] = unit(J[(a - 1) * 2] - J[(a + 1) * 2], J[(a - 1) * 2 + 1] - J[(a + 1) * 2 + 1]);
  const ang = side * 1.1;
  const rx = fx * Math.cos(ang) - fy * Math.sin(ang);
  const ry = fx * Math.sin(ang) + fy * Math.cos(ang);
  return { fx, fy, restX: hx + rx * REACH, restY: hy + ry * REACH };
}
for (let li = 0; li < LEGS; li++) {
  const g = legGeom(li);
  feet[li * 2] = g.restX;
  feet[li * 2 + 1] = g.restY;
}

stage.on('click', () => {
  if (mode === 'swallow') return;
  if (targetN >= FULL) {
    stage.headline("it's full. stop moving");
    return;
  }
  targetN = Math.min(FULL, targetN + 16);
  stage.bump();
  stage.headline(targetN >= FULL ? "don't stop moving" : 'feed it');
});

function target(t) {
  const n = Math.round(N);
  if (mode === 'chase') {
    if (targetN >= FULL && N > FULL - 4 && p.still > 0.7 && p.real && t > cooldown) {
      setMode('trap', t);
      trapC = [p.x, p.y];
      orbit0 = Math.atan2(J[1] - p.y, J[0] - p.x);
      stage.headline('run.');
    }
    return { x: p.x, y: p.y, rate: 5.2 };
  }
  if (mode === 'trap') {
    // moved away? it lets you go
    if (Math.hypot(p.x - trapC[0], p.y - trapC[1]) > 90) {
      setMode('chase', t);
      cooldown = t + 1.5;
      stage.headline('phew');
      return { x: p.x, y: p.y, rate: 5.2 };
    }
    const q = (t - modeT) / 2.4;
    if (q >= 1) {
      setMode('swallow', t);
      stage.cursor.hidden = true;
      stage.shake(14);
      stage.headline('oh no');
    }
    const r = lerp(380, 60, ease.inOut(Math.min(1, q)));
    const a = orbit0 + Math.min(1, q) * 1.6 * Math.PI * 2;
    return { x: trapC[0] + Math.cos(a) * r, y: trapC[1] + Math.sin(a) * r, rate: 7.5 };
  }
  if (mode === 'swallow') {
    const q = (t - modeT - 0.2) / 1.5;
    sw = q < 0 ? 1 : 1 + ease.inOut(Math.min(1, q)) * (n - 3);
    if (q >= 1) {
      setMode('spit', t);
      sw = -1;
      stage.headline('move your mouse');
    }
    // lunge onto it, then sit there digesting
    return t - modeT < 0.15 ? { x: trapC[0], y: trapC[1], rate: 20 } : null;
  }
  // spit: the cursor shoots out of the tail and flies back to the mouse
  const q = (t - modeT) / 0.35;
  const tail = [J[(n - 1) * 2], J[(n - 1) * 2 + 1]];
  if (q >= 1) {
    stage.cursor.override = null;
    stage.cursor.hidden = false;
    setMode('chase', t);
    cooldown = t + 4;
  } else {
    const e = ease.out(q);
    stage.cursor.hidden = false;
    stage.cursor.override = { x: lerp(tail[0], p.x, e), y: lerp(tail[1], p.y, e), angle: q * Math.PI * 2, scale: 1.1 };
  }
  return { x: p.x, y: p.y, rate: 5.2 };
}

function step(dt, t) {
  N = approach(N, targetN, 7, dt);

  // head: ease towards the target with a side to side wiggle so it slithers
  const tg = target(t);
  const hx = J[0];
  const hy = J[1];
  if (tg) {
    const [dirx, diry] = unit(J[0] - J[2], J[1] - J[3]);
    const dist = Math.hypot(tg.x - hx, tg.y - hy);
    phase += Math.min(dist, 400) * dt * 0.02;
    const wig = Math.sin(phase) * Math.min(14, dist * 0.05);
    J[0] = approach(hx, tg.x - diry * wig, tg.rate, dt);
    J[1] = approach(hy, tg.y + dirx * wig, tg.rate, dt);
  }

  // spine: follow the leader with a bend limit
  for (let i = 1; i < MAXJ; i++) {
    let [dx, dy] = unit(J[i * 2] - J[(i - 1) * 2], J[i * 2 + 1] - J[(i - 1) * 2 + 1]);
    if (i >= 2) {
      const [px, py] = unit(J[(i - 1) * 2] - J[(i - 2) * 2], J[(i - 1) * 2 + 1] - J[(i - 2) * 2 + 1]);
      const ang = Math.atan2(px * dy - py * dx, px * dx + py * dy);
      if (Math.abs(ang) > MAX_BEND) {
        const a = Math.atan2(py, px) + Math.sign(ang) * MAX_BEND;
        dx = Math.cos(a);
        dy = Math.sin(a);
      }
    }
    J[i * 2] = J[(i - 1) * 2] + dx * SEG;
    J[i * 2 + 1] = J[(i - 1) * 2 + 1] + dy * SEG;
  }

  // legs: a foot stays planted until its hip has moved too far, then steps ahead.
  // a leg won't step while the one opposite is mid-step
  for (let li = 0; li < LEGS; li++) {
    const g = legGeom(li);
    if (stepping[li]) {
      const q = (t - stepT[li]) / STEP_TIME;
      if (q >= 1) {
        stepping[li] = 0;
        feet[li * 2] = to[li * 2];
        feet[li * 2 + 1] = to[li * 2 + 1];
        lift[li] = 0;
      } else {
        const e = ease.inOut(q);
        feet[li * 2] = lerp(from[li * 2], to[li * 2], e);
        feet[li * 2 + 1] = lerp(from[li * 2 + 1], to[li * 2 + 1], e);
        lift[li] = Math.sin(Math.PI * q);
      }
    } else if (!stepping[li ^ 1] && Math.hypot(feet[li * 2] - g.restX, feet[li * 2 + 1] - g.restY) > STEP_AT) {
      stepping[li] = 1;
      stepT[li] = t;
      from[li * 2] = feet[li * 2];
      from[li * 2 + 1] = feet[li * 2 + 1];
      to[li * 2] = g.restX + g.fx * 34 * K;
      to[li * 2 + 1] = g.restY + g.fy * 34 * K;
    }
  }
}

const P = (i) => [J[i * 2], J[i * 2 + 1]];
const dir = (a, b) => unit(a[0] - b[0], a[1] - b[1]);

function knee(hip, foot, side) {
  const dx = foot[0] - hip[0];
  const dy = foot[1] - hip[1];
  const d = Math.min(Math.hypot(dx, dy), UPPER + LOWER - 1);
  const base = Math.atan2(dy, dx);
  const a = Math.acos(clamp((UPPER * UPPER + d * d - LOWER * LOWER) / (2 * UPPER * d), -1, 1));
  const ang = base - side * a;
  return [hip[0] + Math.cos(ang) * UPPER, hip[1] + Math.sin(ang) * UPPER];
}

function draw(ctx, t) {
  const c = ctx.body;
  c.strokeStyle = BONE;
  c.fillStyle = BONE;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const n = Math.max(10, Math.round(N));
  const spine = Array.from({ length: n }, (_, i) => P(i));
  const ribStart = 6;
  const ribEnd = Math.round(ribStart + (n - ribStart) * 0.42);
  const bulge = (i) => (sw < 0 ? 0 : 26 * K * Math.exp(-Math.pow((i - sw) / 3.5, 2)));

  // the swallowed cursor, under the ribs
  if (sw >= 0) {
    const i = Math.floor(sw);
    const f = sw - i;
    const a = spine[i];
    const b = spine[Math.min(n - 1, i + 1)];
    const d = dir(b, a);
    stage.drawArrow(c, lerp(a[0], b[0], f), lerp(a[1], b[1], f), {
      scale: 1.9 * stage.Z,
      angle: Math.atan2(d[1], d[0]) - Math.PI / 2,
      fill: '#fff',
      stroke: '#000',
    });
    c.strokeStyle = BONE;
    c.fillStyle = BONE;
  }

  // legs
  LEG_JOINTS.forEach((a, pair) => {
    if (a + 8 >= n) return;
    c.globalAlpha = clamp((n - a - 8) / 4);
    for (let s = 0; s < 2; s++) {
      const li = pair * 2 + s;
      const side = s === 0 ? -1 : 1;
      const hip = spine[a];
      const foot = [feet[li * 2], feet[li * 2 + 1]];
      const k = knee(hip, foot, side);
      c.lineWidth = 3.4;
      line(c, [hip, k, foot]);
      c.stroke();
      dot(c, k[0], k[1], 4.5);
      dot(c, foot[0], foot[1], 3 + 3 * lift[li]);
      const d = dir(foot, k);
      c.lineWidth = 2.4;
      c.beginPath();
      for (const o of [-0.7, -0.25, 0.2, 0.65]) {
        const ang = Math.atan2(d[1], d[0]) + o;
        c.moveTo(foot[0], foot[1]);
        c.lineTo(foot[0] + Math.cos(ang) * 18 * K, foot[1] + Math.sin(ang) * 18 * K);
      }
      c.stroke();
    }
  });
  c.globalAlpha = 1;

  // spine, thinner towards the tail
  const cut = Math.round(n * 0.6);
  c.lineWidth = 3.6;
  line(c, spine.slice(0, cut + 1));
  c.stroke();
  c.lineWidth = 2.4;
  line(c, spine.slice(cut));
  c.stroke();

  // ribs, then little ticks down the tail
  for (let i = 3; i < n - 1; i++) {
    const d = dir(spine[i - 1], spine[i + 1]);
    const nn = [-d[1], d[0]];
    let len;
    if (i >= ribStart && i <= ribEnd) len = K * (14 + 36 * Math.sin((Math.PI * (i - ribStart)) / Math.max(1, ribEnd - ribStart))) + bulge(i);
    else if (i > ribEnd) len = K * Math.max(2, 12 * (1 - (i - ribEnd) / (n - ribEnd))) + bulge(i);
    else len = 8 * K;
    const back = [-d[0] * len * 0.35, -d[1] * len * 0.35];
    c.lineWidth = i <= ribEnd ? 2.4 : 1.8;
    c.beginPath();
    for (const s of [-1, 1]) {
      const end = [spine[i][0] + nn[0] * len * s + back[0], spine[i][1] + nn[1] * len * s + back[1]];
      const ctl = [spine[i][0] + nn[0] * len * 0.7 * s, spine[i][1] + nn[1] * len * 0.7 * s];
      quad(c, spine[i], ctl, end);
    }
    c.stroke();
    if (i % 2 === 0) dot(c, spine[i][0], spine[i][1], i <= ribEnd ? 4.2 : 3);
  }

  // skull
  const h = spine[0];
  const d = dir(spine[0], spine[2]);
  const nn = [-d[1], d[0]];
  const pt = (f, s) => [h[0] + d[0] * f * K + nn[0] * s * K, h[1] + d[1] * f * K + nn[1] * s * K];
  if (t > blinkAt + 0.12) blinkAt = t + 2 + Math.random() * 4;
  const blink = t >= blinkAt && t < blinkAt + 0.12;
  const chomp = mode === 'swallow' && t - modeT < 0.25 ? 6 : 0;
  c.lineWidth = 3.4;
  line(c, [pt(40, 0), pt(10, 21 + chomp), pt(-12, 25), pt(-28, 12), pt(-30, 0), pt(-28, -12), pt(-12, -25), pt(10, -21 - chomp)], true);
  c.fillStyle = BG;
  c.fill();
  c.stroke();
  c.fillStyle = BONE;
  const ang = Math.atan2(d[1], d[0]);
  for (const s of [-1, 1]) {
    const e = pt(2, 12 * s);
    c.beginPath();
    c.ellipse(e[0], e[1], 6.5, blink ? 1.2 : 6.5, ang, 0, Math.PI * 2);
    c.fill();
    const no = pt(30, 5 * s);
    dot(c, no[0], no[1], 2);
  }
}

stage.headline('move your mouse');
stage.run({
  step,
  draw(ctx, t) {
    draw(ctx, t);
    const n = Math.round(N);
    const legs = LEG_JOINTS.filter((a) => a + 8 < n).length * 2;
    stage.stats(`segments ${n} · legs ${legs}`);
  },
});
