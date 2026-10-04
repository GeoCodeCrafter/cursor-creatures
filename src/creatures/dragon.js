// fire dragon. chases the cursor and guards it when you stop.
// click (or hold) and it breathes fire at the cursor, burning whatever is in the way.
// every click it grows. hold the fire long enough and it torches the cursor itself.

import { createStage, line, dot } from '../kit/stage.js';
import { approach, chainDir, clamp, ease, fall, followChain, hash, ik2, jointAt, lerp, unit } from '../kit/math.js';

const BG = '#080506';

const stage = createStage({
  file: 'dragon.js',
  hint: 'click or hold to breathe fire',
  layers: [
    { name: 'page' },
    { name: 'body', glow: 'rgba(255,120,30,0.55)', blur: 10 },
    { name: 'fire', blend: 'screen' },
  ],
  vars: {
    bg: BG,
    dot: 'rgba(255,210,180,0.06)',
    ink: 'rgba(255,230,210,0.5)',
    accent: 'rgba(255,190,120,0.9)',
  },
  ripple: 'rgba(255,200,150,0.7)',
});
stage.ghost.hidden = true; // this page draws its own headline so it can burn

const MAXJ = 100;
const SEG = 14;
const MAX_BEND = 0.26;
const LEG_JOINTS = [12, 38];
const WH = { joints: 14, seg: 11 };

const p = stage.pointer;
const J = new Float32Array(MAXJ * 2);
for (let i = 0; i < MAXJ; i++) {
  J[i * 2] = -100 - i * SEG * 0.9;
  J[i * 2 + 1] = stage.H * 0.7 + Math.sin(i * 0.25) * 30;
}
const wh = [0, 1].map(() => {
  const w = new Float32Array(WH.joints * 2);
  for (let i = 0; i < WH.joints; i++) {
    w[i * 2] = J[0] - i * WH.seg;
    w[i * 2 + 1] = J[1];
  }
  return w;
});
const feet = new Float32Array(LEG_JOINTS.length * 4);
for (let k = 0; k < feet.length / 2; k++) {
  feet[k * 2] = J[LEG_JOINTS[k >> 1] * 2];
  feet[k * 2 + 1] = J[LEG_JOINTS[k >> 1] * 2 + 1] + 60;
}

let N = 62;
let targetN = 62;
let phase = 0;
let orbitA = null;
let mouth = 0;
let headDir = [1, 0];
let fires = 0;

// fire: breathing while firing.until > t (holding the mouse keeps extending it)
const firing = { from: -10, until: -10 };
const puffs = [];
let charred = null; // { t0, x, y }

stage.on('down', () => {
  if (charred) return;
  firing.from = stage.t;
  firing.until = stage.t + 0.9;
  fires++;
  targetN = Math.min(96, targetN + 12);
  stage.bump();
});
stage.on('up', () => {
  firing.until = Math.max(firing.until, Math.min(stage.t + 0.25, firing.from + 0.9));
});

// ── the headline it burns ───────────────────────────────────────────────────
const LINES = ['move your mouse', "don't click", 'please stop', 'fine. burn it all'];
let lineIdx = 0;
let letters = [];
let lineShownAt = 0;
const FS = 140;
function setLine(text, t) {
  const c = stage.ctx.page;
  c.font = `italic 300 ${FS}px Fraunces, Georgia, serif`;
  const total = c.measureText(text).width;
  let x = stage.W / 2 - total / 2;
  letters = [...text].map((ch) => {
    const w = c.measureText(ch).width;
    const l = { ch, x: x + w / 2, w, burnAt: null, spin: Math.random() < 0.5 ? -1 : 1 };
    x += w - 3;
    return l;
  });
  lineShownAt = t;
}
const headlineY = () => stage.H * 0.4 + FS * 0.75;

function step(dt, t) {
  N = approach(N, targetN, 6, dt);
  const breathing = t < firing.until || p.down;
  if (p.down) firing.until = Math.max(firing.until, t + 0.05);

  // where it's going: chase, or circle the cursor when you stop
  let tx = p.x;
  let ty = p.y;
  if (p.still > 1.2 && p.real && !breathing) {
    if (orbitA === null) orbitA = Math.atan2(J[1] - p.y, J[0] - p.x);
    orbitA += 1.6 * dt;
    tx = p.x + Math.cos(orbitA) * 300;
    ty = p.y + Math.sin(orbitA) * 300;
  } else orbitA = null;
  if (breathing) {
    // hang back a bit so the fire has room
    const d = unit(J[0] - p.x, J[1] - p.y);
    tx = p.x + d[0] * 420;
    ty = p.y + d[1] * 420;
  }
  const [dx, dy] = unit(J[0] - J[4], J[1] - J[5]);
  const dist = Math.hypot(tx - J[0], ty - J[1]);
  phase += Math.min(dist, 500) * dt * 0.012;
  const wig = Math.sin(phase) * Math.min(24, dist * 0.06);
  J[0] = approach(J[0], tx - dy * wig, breathing ? 9 : 5.5, dt);
  J[1] = approach(J[1], ty + dx * wig, breathing ? 9 : 5.5, dt);
  followChain(J, MAXJ, SEG, MAX_BEND);

  // legs paddle along, trailing a little
  LEG_JOINTS.forEach((a, pair) => {
    const [fx, fy] = unit(J[(a - 1) * 2] - J[(a + 1) * 2], J[(a - 1) * 2 + 1] - J[(a + 1) * 2 + 1]);
    [-1, 1].forEach((side, k) => {
      const li = pair * 2 + k;
      const paddle = Math.sin(phase * 2 + pair * 1.7 + (k ? Math.PI : 0)) * 18;
      const rx = J[a * 2] - fx * 30 - fy * side * 62 + fx * paddle;
      const ry = J[a * 2 + 1] - fy * 30 + fx * side * 62 + fy * paddle;
      feet[li * 2] = approach(feet[li * 2], rx, 9, dt);
      feet[li * 2 + 1] = approach(feet[li * 2 + 1], ry, 9, dt);
    });
  });

  // whiskers stream off the snout
  wh.forEach((w, side) => {
    const sd = side === 0 ? -1 : 1;
    const flutter = Math.sin(t * 9 + side) * 3;
    w[0] = J[0] + dx * 26 - dy * sd * (12 + flutter);
    w[1] = J[1] + dy * 26 + dx * sd * (12 + flutter);
    followChain(w, WH.joints, WH.seg);
  });

  // head turns to whatever it's breathing at
  mouth = approach(mouth, breathing ? 1 : 0, 14, dt);
  const toAim = unit(p.x - J[0], p.y - J[1]);
  const want = breathing ? toAim : [dx, dy];
  headDir = unit(approach(headDir[0], want[0], 14, dt), approach(headDir[1], want[1], 14, dt));

  // fire
  if (breathing) {
    const held = t - firing.from;
    const big = held > 1.2;
    const rate = big ? 170 : 110;
    const mx = J[0] + headDir[0] * 44;
    const my = J[1] + headDir[1] * 44;
    const n = Math.floor(rate * t) - Math.floor(rate * (t - dt));
    for (let k = 0; k < n; k++) {
      const ang = Math.atan2(toAim[1], toAim[0]) + (Math.random() - 0.5) * (big ? 0.55 : 0.42);
      puffs.push({ x: mx, y: my, a: ang, v: big ? 1400 + Math.random() * 500 : 1150 + Math.random() * 400, t0: t, life: big ? 0.7 + Math.random() * 0.3 : 0.5 + Math.random() * 0.25, big });
    }
    // held it long enough: the cursor goes up in flames
    if (held > 2.2 && !charred) {
      charred = { t0: t, x: p.x, y: p.y };
      stage.cursor.hidden = true;
      stage.shake(30);
      firing.until = t;
    }
  }
  for (let i = puffs.length - 1; i >= 0; i--) if (t - puffs[i].t0 > puffs[i].life) puffs.splice(i, 1);

  // letters catch fire when a flame touches them
  const ly = headlineY() - FS * 0.35;
  for (const pf of puffs) {
    const pos = puffPos(pf, t);
    if (Math.abs(pos[1] - ly) > FS * 0.5) continue;
    for (const l of letters) {
      if (l.burnAt === null && Math.abs(pos[0] - l.x) < l.w * 0.6 + 10) l.burnAt = t + Math.random() * 0.1;
    }
  }
  // burning spreads along the word
  letters.forEach((l, i) => {
    if (l.burnAt === null || t - l.burnAt < 0.12) return;
    for (const j of [i - 1, i + 1]) if (letters[j] && letters[j].burnAt === null) letters[j].burnAt = t + 0.05 + Math.random() * 0.1;
  });
  if (letters.length && letters.every((l) => l.burnAt !== null && t - l.burnAt > 1.4) && t - lineShownAt > 1) {
    lineIdx = Math.min(LINES.length - 1, lineIdx + 1);
    setLine(LINES[lineIdx], t);
  }

  if (charred && t - charred.t0 > 3) {
    charred = null;
    stage.cursor.hidden = false;
  }
}

function puffPos(pf, t) {
  const s = t - pf.t0;
  const d = (pf.v / 2.4) * (1 - Math.exp(-2.4 * s));
  return [pf.x + Math.cos(pf.a) * d, pf.y + Math.sin(pf.a) * d - 170 * s * s];
}

// ── drawing ─────────────────────────────────────────────────────────────────
const STOPS = [
  [0, [255, 211, 107]],
  [0.18, [255, 138, 31]],
  [0.45, [255, 59, 59]],
  [0.75, [194, 24, 122]],
  [1, [106, 31, 209]],
];
function bodyColor(u, dark = 0) {
  let i = 0;
  while (i < STOPS.length - 2 && u > STOPS[i + 1][0]) i++;
  const [a, ca] = STOPS[i];
  const [b, cb] = STOPS[i + 1];
  const f = clamp((u - a) / (b - a));
  const c = ca.map((v, k) => Math.round(lerp(v, cb[k], f) * (1 - dark)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawDragon(c, t) {
  const n = Math.max(12, Math.round(N));
  const P = Array.from({ length: n }, (_, i) => jointAt(J, i));
  const D = Array.from({ length: n }, (_, i) => chainDir(J, i, n));
  const width = (i) => {
    const u = i / n;
    if (i < 3) return 17;
    const body = 7 + 24 * Math.pow(Math.sin(Math.PI * clamp((i - 2) / (n * 0.82))), 0.7);
    return u > 0.8 ? Math.max(2, body * (1 - (u - 0.8) / 0.2) + 2) : body;
  };
  const side = (i, s) => [P[i][0] - D[i][1] * width(i) * s, P[i][1] + D[i][0] * width(i) * s];
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // legs (behind the body)
  LEG_JOINTS.forEach((a, pair) => {
    if (a + 6 >= n) return;
    [-1, 1].forEach((sd, k) => {
      const li = pair * 2 + k;
      const hip = P[a];
      const foot = [feet[li * 2], feet[li * 2 + 1]];
      const knee = ik2(hip, foot, 40, 38, sd);
      c.strokeStyle = bodyColor(a / n);
      c.lineWidth = 10;
      line(c, [hip, knee, foot]);
      c.stroke();
      const base = Math.atan2(foot[1] - knee[1], foot[0] - knee[0]);
      c.strokeStyle = '#ffe29a';
      c.lineWidth = 3.5;
      c.beginPath();
      for (const o of [-0.5, 0, 0.5]) {
        c.moveTo(foot[0], foot[1]);
        c.lineTo(foot[0] + Math.cos(base + o) * 16, foot[1] + Math.sin(base + o) * 16);
      }
      c.stroke();
    });
  });

  // body, head to tail
  c.lineWidth = 1;
  for (let i = 1; i < n - 1; i++) {
    const col = bodyColor(i / n);
    c.fillStyle = col;
    c.strokeStyle = col;
    line(c, [side(i, 1), side(i + 1, 1), side(i + 1, -1), side(i, -1)], true);
    c.fill();
    c.stroke();
  }
  // scales + spines down the back
  for (let i = 3; i < n - 3; i += 2) {
    const l = side(i, 0.92);
    const r = side(i, -0.92);
    const ctl = [P[i][0] - D[i][0] * width(i) * 0.7, P[i][1] - D[i][1] * width(i) * 0.7];
    c.strokeStyle = bodyColor(i / n, 0.55);
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(l[0], l[1]);
    c.quadraticCurveTo(ctl[0], ctl[1], r[0], r[1]);
    c.stroke();
    if (i % 4 === 1) {
      const tip = [P[i][0] - D[i][0] * 18, P[i][1] - D[i][1] * 18];
      const nn = [-D[i][1] * 6, D[i][0] * 6];
      c.fillStyle = 'rgba(255,231,168,0.9)';
      line(c, [[P[i][0] + nn[0], P[i][1] + nn[1]], tip, [P[i][0] - nn[0], P[i][1] - nn[1]]], true);
      c.fill();
    }
  }
  // tail flame
  const tl = P[n - 1];
  const td = D[n - 1];
  const tn = [-td[1], td[0]];
  const flick = Math.sin(t * 12) * 6;
  c.fillStyle = '#b44bff';
  c.beginPath();
  c.moveTo(tl[0], tl[1]);
  c.quadraticCurveTo(tl[0] - td[0] * 20 + tn[0] * 26, tl[1] - td[1] * 20 + tn[1] * 26, tl[0] - td[0] * 46 + tn[0] * flick, tl[1] - td[1] * 46 + tn[1] * flick);
  c.quadraticCurveTo(tl[0] - td[0] * 20 - tn[0] * 26, tl[1] - td[1] * 20 - tn[1] * 26, tl[0], tl[1]);
  c.fill();

  // whiskers
  c.strokeStyle = '#ffd36b';
  wh.forEach((w) => {
    const pts = Array.from({ length: WH.joints }, (_, i) => [w[i * 2], w[i * 2 + 1]]);
    c.lineWidth = 4;
    line(c, pts.slice(0, 8));
    c.stroke();
    c.lineWidth = 2;
    c.globalAlpha = 0.8;
    line(c, pts.slice(7));
    c.stroke();
    c.globalAlpha = 1;
  });

  // head
  const hd = headDir;
  const h = P[0];
  const hn = [-hd[1], hd[0]];
  const pt = (f, s) => [h[0] + hd[0] * f + hn[0] * s, h[1] + hd[1] * f + hn[1] * s];
  const m = mouth;
  const pivot = pt(-6, 0);
  const rot = (q, a) => {
    const x = q[0] - pivot[0];
    const y = q[1] - pivot[1];
    return [pivot[0] + x * Math.cos(a) - y * Math.sin(a), pivot[1] + x * Math.sin(a) + y * Math.cos(a)];
  };
  if (m > 0.05) {
    const g = pt(34, 0);
    c.fillStyle = `rgba(255,243,176,${0.9 * m})`;
    dot(c, g[0], g[1], 14 + 16 * m);
  }
  for (const s of [-1, 1]) {
    const jaw = [pt(48, 2 * s), pt(40, 11 * s), pt(18, 20 * s), pt(0, 24 * s), pt(-14, 20 * s), pt(-22, 10 * s), pt(-24, 0)].map((q) => rot(q, s * m * 0.38));
    c.fillStyle = bodyColor(0);
    c.strokeStyle = '#ffe7a8';
    c.lineWidth = 2.5;
    line(c, jaw, true);
    c.fill();
    c.stroke();
  }
  const ang = Math.atan2(hd[1], hd[0]);
  for (const s of [-1, 1]) {
    const a = pt(-12, 15 * s);
    const c1 = pt(-30, 30 * s);
    const tip = pt(-56, 36 * s);
    c.strokeStyle = '#ffe7a8';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1]);
    c.stroke();
    const e = rot(pt(8, 12 * s), s * m * 0.38);
    c.fillStyle = '#fff6a0';
    c.beginPath();
    c.ellipse(e[0], e[1], 8, 5, ang, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1a0700';
    c.beginPath();
    c.ellipse(e[0], e[1], 1.6, 4.5, ang, 0, Math.PI * 2);
    c.fill();
  }
}

// one soft blob per flame colour, drawn once and stamped for every puff
const FIRE = ['#fff7c2', '#ffd84a', '#ff8a1a', '#ff3d00', '#7a1a08'].map((col) => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return cv;
});
function drawFire(c, t) {
  for (const pf of puffs) {
    const s = t - pf.t0;
    const lf = s / pf.life;
    const [x, y] = puffPos(pf, t);
    const size = (pf.big ? 26 : 18) + (pf.big ? 190 : 130) * s;
    const r = size * 0.75;
    c.globalAlpha = lf > 0.8 ? (1 - lf) * 3 : 0.9;
    c.drawImage(FIRE[Math.min(FIRE.length - 1, Math.floor(lf * FIRE.length))], x - r, y - r, r * 2, r * 2);
    if (lf < 0.35) {
      c.fillStyle = '#fffbe6';
      dot(c, x, y, size * 0.16);
    }
  }
  c.globalAlpha = 1;
}

function drawPage(c, t) {
  // the page heats up the more you burn it
  const heat = clamp(fires * 0.08) + (t < firing.until ? 0.15 : 0);
  if (heat > 0) {
    const g = c.createRadialGradient(stage.W / 2, stage.H * 1.05, 0, stage.W / 2, stage.H * 1.05, stage.H * 0.8);
    g.addColorStop(0, `rgba(255,80,20,${0.55 * heat})`);
    g.addColorStop(1, 'rgba(255,80,20,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, stage.W, stage.H);
  }
  // headline
  const show = clamp((t - lineShownAt) / 0.35);
  const y = headlineY();
  c.font = `italic 300 ${FS}px Fraunces, Georgia, serif`;
  c.textAlign = 'center';
  for (const [i, l] of letters.entries()) {
    const s = l.burnAt === null ? -1 : t - l.burnAt;
    c.save();
    let x = l.x;
    let yy = y;
    if (s < 0) {
      c.fillStyle = 'rgba(255,238,225,0.55)';
      c.globalAlpha = ease.out(show);
    } else if (s < 0.25) {
      c.fillStyle = '#ffd27a';
      c.shadowColor = '#ff5a00';
      c.shadowBlur = 30;
    } else {
      const q = s - 0.25;
      yy += fall(q, 1500, { bounce: 0, gravity: 3600 });
      c.translate(x, yy - FS * 0.35);
      c.rotate((l.spin * q * 170 * Math.PI) / 180);
      c.translate(-x, -(yy - FS * 0.35));
      c.fillStyle = '#3b1a0c';
      c.globalAlpha = clamp(1 - q / 0.9);
      if (q < 0.3) {
        c.shadowColor = '#ff5a00';
        c.shadowBlur = 12;
      }
    }
    c.fillText(l.ch, x, yy);
    c.restore();
    // embers off the burning letters
    if (s > 0.1 && s < 1.7) {
      for (let k = 0; k < 3; k++) {
        const e = s - 0.1 - k * 0.12;
        if (e < 0 || e > 1.6) continue;
        c.fillStyle = '#ffb347';
        c.globalAlpha = 1 - e / 1.6;
        dot(c, l.x + (hash(i * 3 + k, 1) - 0.5) * 60 + Math.sin(e * 6 + k) * 12, y - FS * 0.3 - e * (180 + hash(i * 3 + k, 2) * 220), 3);
        c.globalAlpha = 1;
      }
    }
  }
}

function drawCharred(c, t) {
  if (!charred) return;
  const s = t - charred.t0;
  const glow = 0.5 + 0.5 * Math.sin(t * 22);
  const y = charred.y + fall(Math.max(0, s - 1.2), 1600, { bounce: 0, gravity: 3000 });
  // smoke
  for (let i = 0; i < 10; i++) {
    const q = s - i * 0.09;
    if (q < 0 || q > 1.4) continue;
    c.fillStyle = `rgba(107,107,107,${0.35 * (1 - q / 1.4)})`;
    dot(c, charred.x + 20 + Math.sin(q * 4 + i) * 16, charred.y - q * 260, 14 + q * 40);
  }
  c.save();
  c.translate(charred.x, y);
  c.rotate((Math.max(0, s - 1.2) * 200 * Math.PI) / 180);
  c.scale(2.3, 2.3);
  c.translate(-2, -2);
  c.shadowColor = '#ff5a00';
  c.shadowBlur = 6 + 8 * glow;
  const arrow = new Path2D('M2 2 L2 30 L9 23.5 L13.5 34 L18 32 L13.5 21.8 L22.5 21.8 Z');
  c.fillStyle = '#140a06';
  c.strokeStyle = s < 0.4 ? '#ffb347' : '#ff5a1a';
  c.lineWidth = 2.4;
  c.lineJoin = 'round';
  c.fill(arrow);
  c.stroke(arrow);
  c.strokeStyle = '#ff7a1a';
  c.lineWidth = 1.2;
  c.globalAlpha = 0.6 + 0.4 * glow;
  c.stroke(new Path2D('M4 8 L8 14 L6 19 M10 22 L13 27'));
  c.restore();
}

setLine(LINES[0], 0);
stage.run({
  step,
  draw(ctx, t) {
    drawPage(ctx.page, t);
    drawDragon(ctx.body, t);
    drawFire(ctx.fire, t);
    drawCharred(ctx.fire, t);
    stage.stats(charred ? 'it torched your cursor' : `segments ${Math.round(N)} · fires ${fires}`);
  },
});
// the canvas can't use the serif until it's loaded, so measure again once it is
if (document.fonts) document.fonts.load(`italic 300 ${FS}px Fraunces`).then(() => setLine(LINES[lineIdx], stage.t));
