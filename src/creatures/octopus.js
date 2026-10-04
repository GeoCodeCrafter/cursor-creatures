// octopus. crawls after the cursor on its arms, steals the headline's letters as it
// passes, and throws them at you when you click. leave the mouse alone for a bit and
// it camouflages. move again and it grabs your cursor and escapes in a cloud of ink.

import { createStage, dot } from '../kit/stage.js';
import { approach, clamp, ease, hash, lerp, unit } from '../kit/math.js';

const BONE = '#fff0fb';
const BG = '#06070b';
const GLOW = 'rgba(255,90,220,0.6)';

const stage = createStage({
  file: 'octopus.js',
  hint: 'click to make it throw · stand still and it hides',
  layers: [
    { name: 'letters' },
    { name: 'body', glow: GLOW },
    { name: 'ink' },
  ],
  vars: { accent: 'rgba(255,150,235,0.95)' },
  ripple: 'rgba(255,190,240,0.8)',
});
stage.ghost.hidden = true;

const ARMS = 8;
const ARM_ANG = [-2.5, -1.75, -1.05, -0.38, 0.38, 1.05, 1.75, 2.5];
const K = 1.35;
const REACH = 210 * K;
const STEP_AT = 120 * K;
const STEP_T = 0.2;

const p = stage.pointer;
const o = {
  x: stage.W * 0.8,
  y: stage.H + 200,
  vx: 0,
  vy: 0,
  a: -Math.PI / 2,
  tip: new Float32Array(ARMS * 2),
  from: new Float32Array(ARMS * 2),
  to: new Float32Array(ARMS * 2),
  stepT: new Float32Array(ARMS),
  mode: new Uint8Array(ARMS), // 0 planted, 1 stepping, 2 reaching for a letter, 3 holding it, 4 wrapping
  held: new Int8Array(ARMS).fill(-1),
  lift: new Float32Array(ARMS),
};
for (let k = 0; k < ARMS; k++) {
  o.tip[k * 2] = o.x + Math.cos(o.a + ARM_ANG[k]) * REACH;
  o.tip[k * 2 + 1] = o.y + Math.sin(o.a + ARM_ANG[k]) * REACH;
}

// hunt -> camo -> wrap -> ink -> (back in from the edge) hunt
let mode = 'hunt';
let modeT = 0;
let vis = 1;
let inkAt = null;
let inkC = [0, 0];
const setMode = (m, t) => {
  mode = m;
  modeT = t;
};

// ── the headline it steals from ─────────────────────────────────────────────
const TEXT = 'move your mouse';
const SIZE = 104;
const ADV = SIZE * 0.6;
const letters = [...TEXT].map((ch, i) => ({ ch, i, state: ch === ' ' ? 'space' : 'home', arm: -1, grabbedAt: 0, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, backAt: 0 }));
const home = (i) => [stage.W / 2 - (TEXT.length * ADV) / 2 + (i + 0.5) * ADV, stage.H * 0.42];

let thrown = 0;
stage.on('click', () => {
  if (mode !== 'hunt') return;
  let any = false;
  letters.forEach((l) => {
    if (l.state !== 'held') return;
    any = true;
    const k = l.arm;
    l.state = 'thrown';
    l.x = o.tip[k * 2];
    l.y = o.tip[k * 2 + 1];
    // aim roughly at the cursor
    const dx = p.x + (Math.random() - 0.5) * 220 - l.x;
    const dy = p.y + (Math.random() - 0.5) * 160 - l.y;
    l.vx = dx / 0.35;
    l.vy = dy / 0.35 - 300;
    l.vr = (Math.random() - 0.5) * 16;
    l.backAt = stage.t + 3;
    o.mode[k] = 0;
    o.held[k] = -1;
    thrown++;
  });
  if (any) {
    stage.shake(10);
    stage.bump();
  }
});

function step(dt, t) {
  const cur = [p.x, p.y];

  // ── what it's up to
  if (mode === 'hunt' && p.still > 2.5 && p.real) {
    setMode('camo', t);
    // let go of anything it's holding
    letters.forEach((l) => {
      if (l.state === 'held' || l.state === 'reaching') l.state = 'home';
    });
    o.mode.fill(0);
    o.held.fill(-1);
  }
  if (mode === 'camo' && p.still === 0 && p.speed > 40) setMode('wrap', t);
  if (mode === 'wrap' && t - modeT > 1.3) {
    setMode('ink', t);
    inkAt = t;
    inkC = [o.x, o.y];
    stage.shake(26);
  }
  if (mode === 'ink' && t - modeT > 2.4) {
    // sneak back in from the bottom edge
    o.x = p.x + (Math.random() - 0.5) * 400;
    o.y = stage.H + 260;
    o.vx = 0;
    o.vy = 0;
    o.a = -Math.PI / 2;
    for (let k = 0; k < ARMS; k++) {
      o.tip[k * 2] = o.x + Math.cos(o.a + ARM_ANG[k]) * REACH;
      o.tip[k * 2 + 1] = o.y + Math.sin(o.a + ARM_ANG[k]) * REACH;
      o.mode[k] = 0;
    }
    stage.cursor.hidden = false;
    stage.cursor.override = null;
    setMode('hunt', t);
  }
  vis = approach(vis, mode === 'camo' ? 0.05 : 1, mode === 'camo' ? 2.5 : 12, dt);

  // ── body
  if (mode !== 'ink') {
    const d = unit(cur[0] - o.x, cur[1] - o.y);
    const keep = mode === 'wrap' ? 170 : 240;
    const target = [cur[0] - d[0] * keep, cur[1] - d[1] * keep];
    const maxV = mode === 'camo' ? 200 : mode === 'wrap' ? 1400 : 760;
    let dvx = (target[0] - o.x) * 4;
    let dvy = (target[1] - o.y) * 4;
    const l = Math.hypot(dvx, dvy);
    if (l > maxV) {
      dvx *= maxV / l;
      dvy *= maxV / l;
    }
    o.vx = approach(o.vx, dvx, 6, dt);
    o.vy = approach(o.vy, dvy, 6, dt);
    const face = Math.atan2(cur[1] - o.y, cur[0] - o.x);
    const da = Math.atan2(Math.sin(face - o.a), Math.cos(face - o.a));
    o.a += clamp(da, -4 * dt, 4 * dt);
  } else {
    // jet away mantle first, arms trailing, with your cursor
    o.vx = approach(o.vx, -Math.cos(o.a) * 2400, 5, dt);
    o.vy = approach(o.vy, -Math.sin(o.a) * 2400, 5, dt);
  }
  o.x += o.vx * dt;
  o.y += o.vy * dt;

  // ── arms
  for (let k = 0; k < ARMS; k++) {
    const rest = [o.x + Math.cos(o.a + ARM_ANG[k]) * REACH, o.y + Math.sin(o.a + ARM_ANG[k]) * REACH];
    const m = o.mode[k];
    if (mode === 'ink') {
      const c = [o.x + Math.cos(o.a) * 60, o.y + Math.sin(o.a) * 60];
      o.tip[k * 2] = approach(o.tip[k * 2], c[0] - Math.cos(o.a + ARM_ANG[k] * 0.25) * 260, 9, dt);
      o.tip[k * 2 + 1] = approach(o.tip[k * 2 + 1], c[1] - Math.sin(o.a + ARM_ANG[k] * 0.25) * 260, 9, dt);
      continue;
    }
    if (mode === 'wrap') {
      // every arm coils round the cursor
      o.mode[k] = 4;
      const ang = (k / ARMS) * Math.PI * 2 + t * 4;
      const r = 62 + 12 * Math.sin(t * 9 + k);
      o.tip[k * 2] = approach(o.tip[k * 2], cur[0] + Math.cos(ang) * r, 18, dt);
      o.tip[k * 2 + 1] = approach(o.tip[k * 2 + 1], cur[1] + Math.sin(ang) * r, 18, dt);
      o.lift[k] = 1;
      continue;
    }
    if (m === 4) o.mode[k] = 0;
    if (m === 2 || m === 3) {
      const l = letters[o.held[k]];
      if (m === 2) {
        const q = Math.min(1, (t - o.stepT[k]) / 0.16);
        const [lx, ly] = home(l.i);
        o.tip[k * 2] = lerp(o.from[k * 2], lx, ease.out(q));
        o.tip[k * 2 + 1] = lerp(o.from[k * 2 + 1], ly - SIZE * 0.3, ease.out(q));
        if (q >= 1) {
          o.mode[k] = 3;
          l.state = 'held';
          l.arm = k;
          l.grabbedAt = t;
          stage.bump();
        }
      } else {
        // hold it up and wave it about
        const ha = o.a + ARM_ANG[k] * 0.9;
        const wob = Math.sin(t * 5 + k * 1.3) * 26;
        o.tip[k * 2] = approach(o.tip[k * 2], o.x + Math.cos(ha) * 150 * K + wob, 10, dt);
        o.tip[k * 2 + 1] = approach(o.tip[k * 2 + 1], o.y + Math.sin(ha) * 150 * K - 40 + Math.cos(t * 4 + k) * 20, 10, dt);
      }
      o.lift[k] = 1;
      continue;
    }
    // free arm: grab a letter if one's in reach
    if (m === 0 && mode === 'hunt') {
      let best = -1;
      let bestD = 290;
      letters.forEach((l, j) => {
        if (l.state !== 'home') return;
        const [lx, ly] = home(l.i);
        const d = Math.hypot(lx - o.x, ly - o.y);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      if (best >= 0) {
        letters[best].state = 'reaching';
        o.mode[k] = 2;
        o.held[k] = best;
        o.stepT[k] = t;
        o.from[k * 2] = o.tip[k * 2];
        o.from[k * 2 + 1] = o.tip[k * 2 + 1];
        continue;
      }
    }
    // walking: plant, step when stretched
    if (m === 1) {
      const q = (t - o.stepT[k]) / STEP_T;
      if (q >= 1) {
        o.mode[k] = 0;
        o.lift[k] = 0;
      } else {
        const e = ease.inOut(q);
        o.tip[k * 2] = lerp(o.from[k * 2], o.to[k * 2], e);
        o.tip[k * 2 + 1] = lerp(o.from[k * 2 + 1], o.to[k * 2 + 1], e);
        o.lift[k] = Math.sin(Math.PI * q);
      }
      continue;
    }
    const off = Math.hypot(o.tip[k * 2] - rest[0], o.tip[k * 2 + 1] - rest[1]);
    const busy = o.mode[(k + 1) % ARMS] === 1 || o.mode[(k + ARMS - 1) % ARMS] === 1;
    if (off > STEP_AT && (!busy || off > STEP_AT * 1.8)) {
      o.mode[k] = 1;
      o.stepT[k] = t;
      o.from[k * 2] = o.tip[k * 2];
      o.from[k * 2 + 1] = o.tip[k * 2 + 1];
      o.to[k * 2] = rest[0] + o.vx * 0.18;
      o.to[k * 2 + 1] = rest[1] + o.vy * 0.18;
    }
  }

  // ── thrown letters fly, fall, then grow back
  for (const l of letters) {
    if (l.state === 'thrown') {
      l.vy += 4200 * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.rot += l.vr * dt;
      if (t > l.backAt) l.state = 'home';
    }
  }

  // ── the cursor: grabbed, then carried off
  if (mode === 'wrap') {
    stage.cursor.override = { x: p.x + Math.sin(t * 70) * 3, y: p.y, scale: 1.1 };
  } else if (mode === 'ink') {
    const c = [o.x + Math.cos(o.a) * 60, o.y + Math.sin(o.a) * 60];
    stage.cursor.override = { x: c[0], y: c[1], scale: 1.9 * stage.Z, angle: t * 7 };
  }
}

const bez = (p0, p1, p2, p3, u) => {
  const v = 1 - u;
  return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]];
};

function drawOctopus(c, t) {
  const { x, y, a } = o;
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  c.strokeStyle = BONE;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.globalAlpha = vis;

  // arms: a tapering ribbon with suckers down one side
  const suckers = [];
  for (let k = 0; k < ARMS; k++) {
    const ba = a + ARM_ANG[k] * 0.55;
    const base = [x + Math.cos(ba) * 34 * K, y + Math.sin(ba) * 34 * K];
    const tip = [o.tip[k * 2], o.tip[k * 2 + 1]];
    const dist = Math.hypot(tip[0] - base[0], tip[1] - base[1]) || 1;
    const oa = a + ARM_ANG[k];
    const p1 = [base[0] + Math.cos(oa) * dist * 0.45, base[1] + Math.sin(oa) * dist * 0.45];
    const dx = (tip[0] - base[0]) / dist;
    const dy = (tip[1] - base[1]) / dist;
    const wave = Math.sin(t * 3.2 + k * 1.7) * 40 + o.lift[k] * 30;
    const p2 = [tip[0] - dx * dist * 0.3 - dy * wave, tip[1] - dy * dist * 0.3 + dx * wave];
    const pts = Array.from({ length: 22 }, (_, i) => bez(base, p1, p2, tip, i / 21));
    const L = [];
    const R = [];
    pts.forEach((q, i) => {
      const nx = pts[Math.min(21, i + 1)];
      const pv = pts[Math.max(0, i - 1)];
      const tx = nx[0] - pv[0];
      const ty = nx[1] - pv[1];
      const l = Math.hypot(tx, ty) || 1;
      const w = (15 * (1 - i / 21) + 2) * K;
      L.push([q[0] - (ty / l) * w, q[1] + (tx / l) * w]);
      R.push([q[0] + (ty / l) * w, q[1] - (tx / l) * w]);
      if (i % 2 === 1 && i < 20) suckers.push([q[0] - (ty / l) * w * 0.35, q[1] + (tx / l) * w * 0.35, (5.5 * (1 - i / 21) + 1.5) * K]);
    });
    c.beginPath();
    [...L, ...R.reverse()].forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
    c.closePath();
    c.fillStyle = BG;
    c.fill();
    c.lineWidth = 2.6;
    c.stroke();
  }
  c.lineWidth = 1.6;
  c.beginPath();
  for (const [sx, sy, r] of suckers) {
    c.moveTo(sx + r, sy);
    c.arc(sx, sy, r, 0, Math.PI * 2);
  }
  c.stroke();

  // mantle
  const mc = [x - fx * 78 * K, y - fy * 78 * K];
  const pulse = 1 + 0.05 * Math.sin(t * 3);
  c.save();
  c.translate(mc[0], mc[1]);
  c.rotate(a);
  c.scale(pulse * K, K);
  const mantle = new Path2D('M60 0 C60 -62 10 -78 -50 -64 C-112 -48 -120 48 -50 64 C10 78 60 62 60 0 Z');
  c.fillStyle = BG;
  c.fill(mantle);
  c.lineWidth = 3.4;
  c.stroke(mantle);
  c.lineWidth = 2;
  c.globalAlpha = vis * 0.7;
  c.stroke(new Path2D('M30 -30 C-10 -40 -60 -30 -80 -10 M30 30 C-10 40 -60 30 -80 10'));
  c.globalAlpha = vis * 0.5;
  c.fillStyle = BONE;
  for (let i = 0; i < 10; i++) dot(c, -70 + hash(i, 1) * 110, -40 + hash(i, 2) * 80, 2 + hash(i, 3) * 3);
  c.restore();

  // eyes. these stay visible when it camouflages
  c.globalAlpha = Math.max(vis, 0.9);
  const nx = -fy;
  const ny = fx;
  for (const sd of [-1, 1]) {
    const e = [x - fx * 8 * K + nx * 44 * K * sd, y - fy * 8 * K + ny * 44 * K * sd];
    const blink = t % 4.3 < 0.12;
    c.save();
    c.translate(e[0], e[1]);
    c.rotate(a);
    c.scale(K, K);
    c.fillStyle = BONE;
    c.beginPath();
    c.ellipse(0, 0, 15, blink ? 2 : 13, 0, 0, Math.PI * 2);
    c.fill();
    if (!blink) {
      c.fillStyle = BG;
      c.beginPath();
      c.roundRect ? c.roundRect(-9, -3, 18, 6, 3) : c.rect(-9, -3, 18, 6);
      c.fill();
    }
    c.restore();
  }
  c.globalAlpha = 1;
}

function drawLetters(c, t) {
  c.font = `700 ${SIZE}px "JetBrains Mono", ui-monospace, monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const l of letters) {
    if (l.state === 'space') continue;
    let [x, y] = home(l.i);
    y -= SIZE * 0.3;
    let rot = 0;
    let alpha = 0.32;
    let glow = false;
    if (l.state === 'held') {
      x = o.tip[l.arm * 2];
      y = o.tip[l.arm * 2 + 1];
      rot = Math.sin(t * 6 + l.i) * 0.45;
      alpha = 0.95 * Math.max(vis, 0.2);
      glow = true;
    } else if (l.state === 'thrown') {
      x = l.x;
      y = l.y;
      rot = l.rot;
      alpha = 0.95 * clamp(1 - (t - (l.backAt - 3) - 0.7) / 0.4);
      glow = true;
    } else if (l.state === 'home' && l.backAt && t < l.backAt + 0.6) {
      alpha = 0.32 * clamp((t - l.backAt) / 0.6); // growing back
    }
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.globalAlpha = alpha;
    c.fillStyle = glow ? BONE : '#fff';
    if (glow) {
      c.shadowColor = GLOW;
      c.shadowBlur = 14;
    }
    c.fillText(l.ch, 0, 0);
    c.restore();
  }
}

function drawInk(c, t) {
  if (inkAt === null) return;
  const q = t - inkAt;
  if (q > 3.2) return;
  const fade = clamp(1 - (q - 1.8) / 1.4);
  for (let i = 0; i < 40; i++) {
    const ang = hash(i, 1) * Math.PI * 2;
    const v = 300 + hash(i, 2) * 1500;
    const d = (v / 3) * (1 - Math.exp(-3 * q));
    const R = 80 + (320 + hash(i, 3) * 340) * clamp(q / 0.8);
    const x = inkC[0] + Math.cos(ang) * d;
    const y = inkC[1] + Math.sin(ang) * d;
    const g = c.createRadialGradient(x, y, 0, x, y, R);
    const col = hash(i, 4) > 0.3 ? '10,0,16' : '42,4,48';
    g.addColorStop(0, `rgba(${col},${0.95 * fade})`);
    g.addColorStop(0.6, `rgba(${col},${0.8 * fade})`);
    g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g;
    dot(c, x, y, R);
  }
}

stage.run({
  step,
  draw(ctx, t) {
    drawLetters(ctx.letters, t);
    drawOctopus(ctx.body, t);
    drawInk(ctx.ink, t);
    const held = letters.filter((l) => l.state === 'held').length;
    const status = mode === 'ink' ? 'gone (with your cursor)' : mode === 'wrap' ? 'got it' : mode === 'camo' ? 'invisible' : `letters stolen ${held} · thrown ${thrown}`;
    stage.stats(`arms ${ARMS} · ${status}`);
    if (mode === 'ink' && t - modeT > 0.2) stage.cursor.hidden = t - modeT > 0.9;
  },
});
