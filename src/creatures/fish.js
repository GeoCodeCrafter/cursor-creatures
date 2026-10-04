// 300 fish schooling around the cursor. click to scatter them. hold the mouse and
// they make a giant cursor. double click and they team up into one giant fish,
// with your cursor as its eye. which comes in handy when the shark turns up.

import { createStage } from '../kit/stage.js';
import { approach, clamp, followChain, hash, jointAt, chainDir, lerp, unit } from '../kit/math.js';

const stage = createStage({
  file: 'school.js',
  hint: 'click: scatter · hold: arrow · double click: big fish',
  layers: [
    { name: 'sea' },
    { name: 'far' },
    { name: 'near', glow: 'rgba(120,240,255,0.75)' },
    { name: 'shark' },
  ],
  vars: {
    bg: 'linear-gradient(180deg, #0b4a6e 0%, #06304f 30%, #03192e 70%, #010a15 100%)',
    dot: 'transparent',
    ink: 'rgba(200,240,255,0.6)',
    accent: '#7ff2ff',
  },
  ripple: 'rgba(190,250,255,0.8)',
});
stage.ghost.hidden = true;

const FISH = 300;
const CELL = 64;
const SHARK_J = 18;
const SHARK_SEG = 28;
const p = stage.pointer;

// ── formation shapes ────────────────────────────────────────────────────────
const inPoly = (q, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const perimeter = (poly, n, seed) => {
  const segs = poly.map((a, i) => [a, poly[(i + 1) % poly.length]]);
  const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lens.reduce((s, l) => s + l, 0);
  return Array.from({ length: n }, (_, i) => {
    let d = ((i + hash(i, seed) * 0.5) / n) * total;
    let k = 0;
    while (d > lens[k]) d -= lens[k++];
    const [a, b] = segs[k];
    const f = d / lens[k];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  });
};
const fill = (polys, n, box, seed, hole) => {
  const out = [];
  let k = 0;
  while (out.length < n && k < n * 200) {
    const q = [box[0] + hash(k, seed) * (box[2] - box[0]), box[1] + hash(k, seed + 0.5) * (box[3] - box[1])];
    k++;
    if (!polys.some((poly) => inPoly(q, poly))) continue;
    if (hole && Math.hypot(q[0] - hole.at[0], q[1] - hole.at[1]) < hole.r) continue;
    out.push(q);
  }
  return out;
};
const shuffle = (a, seed) => a.map((v, i) => ({ v, k: hash(i, seed) })).sort((x, y) => x.k - y.k).map((x) => x.v);

const AS = 15; // arrow scale: tip at the cursor
const ARROW = [[2, 2], [2, 30], [9, 23.5], [13.5, 34], [18, 32], [13.5, 21.8], [22.5, 21.8]].map(([x, y]) => [(x - 2) * AS, (y - 2) * AS]);
const ARROW_PTS = shuffle([...perimeter(ARROW, 126, 11), ...fill([ARROW], FISH - 126, [0, 0, 21 * AS, 32 * AS], 12)], 13);

const ELLIPSE = Array.from({ length: 48 }, (_, i) => [Math.cos((i / 48) * Math.PI * 2) * 300, Math.sin((i / 48) * Math.PI * 2) * 150]);
const TAIL = [[-270, 0], [-460, -165], [-405, 0], [-460, 165]];
const FIN = [[-70, -130], [40, -235], [90, -135]];
const EYE = [220, 0];
const GIANT_PTS = shuffle(
  [
    ...perimeter(ELLIPSE, 90, 21),
    ...perimeter(TAIL, 30, 22),
    ...perimeter(FIN, 15, 23),
    ...fill([ELLIPSE, TAIL, FIN], FISH - 135, [-470, -240, 310, 160], 24, { at: [EYE[0] + 12, EYE[1] + 18], r: 58 }),
  ],
  25,
);

// ── state ───────────────────────────────────────────────────────────────────
const P = new Float32Array(FISH * 2);
const V = new Float32Array(FISH * 2);
const Hd = new Float32Array(FISH * 2);
for (let i = 0; i < FISH; i++) {
  const a = hash(i, 1) * Math.PI * 2;
  const r = 80 + hash(i, 2) * 260;
  P[i * 2] = p.x + Math.cos(a) * r;
  P[i * 2 + 1] = p.y + Math.sin(a) * r;
  V[i * 2] = -Math.sin(a) * 200;
  V[i * 2 + 1] = Math.cos(a) * 200;
  Hd[i * 2] = 1;
}
let wa = 0; // arrow formation weight
let wg = 0; // giant fish weight
let giantUntil = -1;
let scatterAt = -10;
let downAt = -10;
let eaten = 0;

const shark = {
  J: new Float32Array(SHARK_J * 2),
  mode: 'away', // away | chase | flee | leave
  modeT: 0,
  next: 9,
  side: 1,
  phase: 0,
  bite: 0,
};
const parkShark = () => {
  for (let i = 0; i < SHARK_J; i++) {
    shark.J[i * 2] = -3000;
    shark.J[i * 2 + 1] = -3000;
  }
};
parkShark();

stage.on('down', () => {
  downAt = stage.t;
});
stage.on('up', () => {
  if (stage.t - downAt < 0.3 && wa < 0.3) {
    scatterAt = stage.t;
    stage.shake(8);
  }
});
stage.on('dblclick', () => {
  giantUntil = giantUntil > stage.t ? -1 : stage.t + 6;
  stage.bump();
});

function stepShark(dt, t) {
  const sk = shark.J;
  if (shark.mode === 'away') {
    if (t < shark.next) return;
    shark.side = Math.random() < 0.5 ? -1 : 1;
    const x0 = shark.side < 0 ? -300 : stage.W + 300;
    const y0 = stage.H * (0.25 + Math.random() * 0.5);
    // line the body up off-screen behind the head
    for (let i = 0; i < SHARK_J; i++) {
      sk[i * 2] = x0 + (shark.side < 0 ? -1 : 1) * i * SHARK_SEG;
      sk[i * 2 + 1] = y0;
    }
    shark.mode = 'chase';
    shark.modeT = t;
  }
  let target;
  let rate = 2.6;
  if (shark.mode === 'chase') {
    target = [p.x, p.y];
    if (wg > 0.6 && Math.hypot(sk[0] - p.x, sk[1] - p.y) < 900) {
      shark.mode = 'flee';
      shark.modeT = t;
      stage.shake(12);
    } else if (t - shark.modeT > 7) {
      shark.mode = 'leave';
      shark.modeT = t;
    }
  }
  if (shark.mode === 'flee' || shark.mode === 'leave') {
    const away = unit(sk[0] - p.x, sk[1] - p.y);
    target = [sk[0] + away[0] * 800, sk[1] + away[1] * 800];
    rate = shark.mode === 'flee' ? 6 : 3;
    const off = sk[0] < -700 || sk[0] > stage.W + 700 || sk[1] < -700 || sk[1] > stage.H + 700;
    if (off) {
      shark.mode = 'away';
      shark.next = t + 14 + Math.random() * 8;
      parkShark();
      return;
    }
  }
  const [dx, dy] = unit(sk[0] - sk[4], sk[1] - sk[5]);
  shark.phase += dt * 7;
  const sw = Math.sin(shark.phase) * 18;
  sk[0] = approach(sk[0], target[0] - dy * sw, rate, dt);
  sk[1] = approach(sk[1], target[1] + dx * sw, rate, dt);
  followChain(sk, SHARK_J, SHARK_SEG, 0.16);
  const close = shark.mode === 'chase' && Math.hypot(sk[0] - p.x, sk[1] - p.y) < 260;
  shark.bite = approach(shark.bite, close ? 0.5 + 0.5 * Math.sin(t * 9) : 0, 12, dt);
}

function step(dt, t) {
  const holding = p.down && t - downAt > 0.3;
  wa = approach(wa, holding ? 1 : 0, 5, dt);
  wg = approach(wg, t < giantUntil ? 1 : 0, 4, dt);
  const wShape = Math.max(wa, wg);
  const wFlock = 1 - wShape;
  const sc = clamp(1 - (t - scatterAt) / 1.1) * (t >= scatterAt ? 1 : 0);
  const scatterNow = t - scatterAt < dt * 1.5;

  stepShark(dt, t);
  const sk = shark.J;
  const sharkIn = shark.mode !== 'away';

  // neighbour grid
  const grid = new Map();
  for (let i = 0; i < FISH; i++) {
    const k = Math.floor(P[i * 2] / CELL) * 100003 + Math.floor(P[i * 2 + 1] / CELL);
    const cell = grid.get(k);
    if (cell) cell.push(i);
    else grid.set(k, [i]);
  }
  const gc = [p.x - EYE[0], p.y - EYE[1]];

  for (let i = 0; i < FISH; i++) {
    const px = P[i * 2];
    const py = P[i * 2 + 1];
    let vx = V[i * 2];
    let vy = V[i * 2 + 1];
    let ax = 0;
    let ay = 0;

    // flocking
    let sepx = 0, sepy = 0, avx = 0, avy = 0, cx = 0, cy = 0, n = 0;
    const gx = Math.floor(px / CELL);
    const gy = Math.floor(py / CELL);
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const cell = grid.get((gx + ox) * 100003 + gy + oy);
        if (!cell) continue;
        for (const j of cell) {
          if (j === i) continue;
          const dx = px - P[j * 2];
          const dy = py - P[j * 2 + 1];
          const d2 = dx * dx + dy * dy;
          if (d2 > 4900) continue;
          if (d2 < 576 && d2 > 0.01) {
            sepx += (dx / d2) * 9000;
            sepy += (dy / d2) * 9000;
          }
          avx += V[j * 2];
          avy += V[j * 2 + 1];
          cx += P[j * 2];
          cy += P[j * 2 + 1];
          n++;
        }
      }
    ax += sepx * (1 - 0.75 * wShape);
    ay += sepy * (1 - 0.75 * wShape);
    if (n > 0) {
      ax += wFlock * ((avx / n - vx) * 1.2 + (cx / n - px) * 0.3);
      ay += wFlock * ((avy / n - vy) * 1.2 + (cy / n - py) * 0.3);
    }

    // the bait ball: each fish chases its own slot on a churning disc round the cursor
    const tx = p.x - px;
    const ty = p.y - py;
    const d = Math.hypot(tx, ty) || 1;
    const ring = 45 + (i % 10) * 19 + Math.sin(t * 1.3 + i) * 14;
    const spin = i * 2.39996 + t * (2.2 - ring / 260);
    let fx = p.x + Math.cos(spin) * ring - px;
    let fy = p.y + Math.sin(spin) * ring - py;
    const fl = Math.hypot(fx, fy) || 1;
    const k = (Math.min(fl * 6, 3000) / fl) * (1 - 0.85 * sc);
    fx *= k;
    fy *= k;
    ax += wFlock * (fx - vx * 1.5 * (1 - sc));
    ay += wFlock * (fy - vy * 1.5 * (1 - sc));

    // formations
    if (wShape > 0.001) {
      let target;
      if (wa >= wg) target = [p.x + ARROW_PTS[i][0], p.y + ARROW_PTS[i][1]];
      else {
        const [lx, ly] = GIANT_PTS[i];
        const wave = Math.sin(t * 6 - lx / 140) * 34 * Math.max(0, (-lx - 60) / 400);
        target = [gc[0] + lx, gc[1] + ly + wave];
      }
      ax += wShape * ((target[0] - px) * 28 - vx * 10);
      ay += wShape * ((target[1] - py) * 28 - vy * 10);
    }

    // flee the shark
    if (sharkIn) {
      for (let j = 0; j < 8; j++) {
        const dx = px - sk[j * 2];
        const dy = py - sk[j * 2 + 1];
        const dd = Math.hypot(dx, dy) || 1;
        const R = 330 - j * 20;
        if (dd < R) {
          const f = ((R - dd) / R) * 5200 * (1 - wg);
          ax += (dx / dd) * f;
          ay += (dy / dd) * f;
        }
      }
      // too slow? lunch
      if (shark.bite > 0.6 && wg < 0.5) {
        const hx = sk[0] + (sk[0] - sk[2]) * 1.2;
        const hy = sk[1] + (sk[1] - sk[3]) * 1.2;
        if (Math.hypot(px - hx, py - hy) < 34) {
          eaten++;
          stage.bump();
          P[i * 2] = hash(i + eaten, 9) < 0.5 ? -100 : stage.W + 100;
          P[i * 2 + 1] = hash(i + eaten, 10) * stage.H;
          continue;
        }
      }
    }

    if (scatterNow) {
      const f = Math.max(0, 1 - d / 700) * 1150;
      vx += (-tx / d) * f;
      vy += (-ty / d) * f;
    }

    vx += ax * dt;
    vy += ay * dt;
    const sp = Math.hypot(vx, vy) || 1;
    const maxS = wShape > 0.5 ? 1100 : 900 + 400 * sc;
    const minS = wShape > 0.5 ? 0 : 150;
    const lim = sp > maxS ? maxS / sp : sp < minS ? minS / sp : 1;
    vx *= lim;
    vy *= lim;
    V[i * 2] = vx;
    V[i * 2 + 1] = vy;
    P[i * 2] = px + vx * dt;
    P[i * 2 + 1] = py + vy * dt;

    // heading follows velocity, or lines up with the formation
    const [hx0, hy0] = unit(vx, vy);
    const fdx = wg > wa ? 1 : -0.707;
    const fdy = wg > wa ? 0 : -0.707;
    const [hx, hy] = unit(approach(Hd[i * 2], hx0 * (1 - wShape) + fdx * wShape, 10, dt), approach(Hd[i * 2 + 1], hy0 * (1 - wShape) + fdy * wShape, 10, dt));
    Hd[i * 2] = hx;
    Hd[i * 2 + 1] = hy;
  }
}

// ── drawing ─────────────────────────────────────────────────────────────────
const COLORS = ['#8ff4ff', '#5fdcff', '#b8fff0', '#79e6ff'];
const GOLD = [255, 214, 107];
const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));

function drawSea(c, t) {
  // light rays + marine snow
  const rays = [
    [0.15, 120, -14, 0],
    [0.39, 200, -10, 1.7],
    [0.65, 90, -6, 3.1],
    [0.83, 160, -2, 4.4],
  ];
  c.save();
  for (const [x, w, sk, ph] of rays) {
    const X = x * stage.W;
    const g = c.createLinearGradient(0, 0, 0, stage.H * 0.85);
    g.addColorStop(0, `rgba(170,235,255,${0.12 * (0.55 + 0.45 * Math.sin(t * 0.9 + ph))})`);
    g.addColorStop(1, 'rgba(170,235,255,0)');
    c.fillStyle = g;
    const off = Math.tan((sk * Math.PI) / 180) * stage.H;
    c.beginPath();
    c.moveTo(X, 0);
    c.lineTo(X + w, 0);
    c.lineTo(X + w - off, stage.H);
    c.lineTo(X - off, stage.H);
    c.fill();
  }
  c.restore();
  c.fillStyle = 'rgba(200,240,255,0.35)';
  for (let i = 0; i < 70; i++) {
    const y = ((hash(i, 1) * (stage.H + 200) + (t + 20) * (14 + hash(i, 2) * 22)) % (stage.H + 200)) - 90;
    const x = hash(i, 3) * stage.W + Math.sin(t * 0.6 + i) * 14;
    const s = 2 + hash(i, 4) * 4;
    c.fillRect(x, y, s, s);
  }
}

function drawSchool(far, near, t) {
  for (let i = 0; i < FISH; i++) {
    const c = i % 4 === 0 ? far : near;
    const s = i % 4 === 0 ? 0.95 : 1.3;
    const w = Math.sin(t * 16 + i * 1.7) * 3.2;
    let col = COLORS[i % 4];
    if (wg > 0.02) {
      const a = rgb(col);
      const f = clamp(wg * (0.35 + 0.65 * hash(i, 5)));
      col = `rgb(${a.map((v, k) => Math.round(lerp(v, GOLD[k], f))).join(',')})`;
    }
    c.save();
    c.translate(P[i * 2], P[i * 2 + 1]);
    c.rotate(Math.atan2(Hd[i * 2 + 1], Hd[i * 2]));
    c.scale(s, s);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(15, 0);
    c.quadraticCurveTo(3, -7.5, -8, -2);
    c.lineTo(-16, -6.5 + w);
    c.lineTo(-13.5, w);
    c.lineTo(-16, 6.5 + w);
    c.lineTo(-8, 2);
    c.quadraticCurveTo(3, 7.5, 15, 0);
    c.fill();
    c.restore();
  }
  far.globalAlpha = 1;
}

const sharkW = (i) => (i <= 2 ? 30 + i * 7 : i <= 6 ? 44 + (i - 2) * 4 : Math.max(6, 60 - (i - 6) * 5));

function drawShark(c, t) {
  if (shark.mode === 'away') return;
  const J = shark.J;
  const Pt = Array.from({ length: SHARK_J }, (_, i) => jointAt(J, i));
  const D = Array.from({ length: SHARK_J }, (_, i) => chainDir(J, i, SHARK_J));
  const side = (i, s, k = 1) => [Pt[i][0] - D[i][1] * sharkW(i) * s * k, Pt[i][1] + D[i][0] * sharkW(i) * s * k];
  const poly = (pts, fillStyle, stroke) => {
    c.beginPath();
    pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
    c.closePath();
    c.fillStyle = fillStyle;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 2;
      c.stroke();
    }
  };
  const L = Array.from({ length: SHARK_J - 2 }, (_, k) => side(k + 2, 1));
  const R = Array.from({ length: SHARK_J - 2 }, (_, k) => side(k + 2, -1)).reverse();
  const body = [...L, ...R];
  c.lineJoin = 'round';
  c.lineCap = 'round';

  // shadow on the sea floor
  c.save();
  c.translate(26, 40);
  c.globalAlpha = 0.25;
  poly(body, '#000');
  c.restore();

  const fin = (i, s, len, sweep, wide) => {
    const root = side(i, s, 0.9);
    const back = side(i + wide, s, 0.9);
    const n = [-D[i][1] * s, D[i][0] * s];
    return [root, [root[0] + n[0] * len - D[i][0] * sweep, root[1] + n[1] * len - D[i][1] * sweep], back];
  };
  const ti = SHARK_J - 1;
  const td = D[ti];
  const tn = [-td[1], td[0]];
  const tl = Pt[ti];
  const flick = Math.sin(t * 7) * 10;
  poly([Pt[ti - 1], [tl[0] - td[0] * 60 + tn[0] * (62 + flick), tl[1] - td[1] * 60 + tn[1] * (62 + flick)], [tl[0] - td[0] * 14, tl[1] - td[1] * 14], [tl[0] - td[0] * 52 - tn[0] * (46 - flick), tl[1] - td[1] * 52 - tn[1] * (46 - flick)]], '#4a5a68');
  for (const s of [1, -1]) {
    poly(fin(5, s, 92, 70, 2), '#4f606f');
    poly(fin(11, s, 34, 26, 1), '#4f606f');
  }
  poly(body, '#5d6f7e', '#8fa3b3');
  c.strokeStyle = '#3c4a56';
  c.lineWidth = 16;
  c.beginPath();
  Pt.slice(2, SHARK_J - 1).forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
  c.stroke();
  poly([side(6, 1, 0.25), [Pt[9][0] - D[9][0] * 20, Pt[9][1] - D[9][1] * 20], side(6, -1, 0.25)], '#2e3a44');

  // head: two jaws that open to bite
  const h = Pt[0];
  const hd = D[0];
  const hn = [-hd[1], hd[0]];
  const pt = (f, s) => [h[0] + hd[0] * f + hn[0] * s, h[1] + hd[1] * f + hn[1] * s];
  const m = shark.bite;
  const pivot = pt(-50, 0);
  const rot = (q, a) => {
    const x = q[0] - pivot[0];
    const y = q[1] - pivot[1];
    return [pivot[0] + x * Math.cos(a) - y * Math.sin(a), pivot[1] + x * Math.sin(a) + y * Math.cos(a)];
  };
  if (m > 0.02) poly([rot(pt(26, 0), -0.55 * m), rot(pt(26, 0), 0.55 * m), pivot], '#5a0d14');
  for (const s of [-1, 1]) {
    const a = s * 0.55 * m;
    poly([pt(26, 0), pt(20, 14 * s), pt(4, 28 * s), pt(-20, 38 * s), pt(-52, 44 * s), pt(-52, 0)].map((q) => rot(q, a)), '#62768a', '#8fa3b3');
    if (m > 0.05) {
      for (let k = 0; k < 6; k++) {
        const f = 22 - k * 11;
        poly([rot(pt(f, 0), a), rot(pt(f - 4, -s * 10), a), rot(pt(f - 8, 0), a)], '#f4f1e6');
      }
    }
    const e = rot(pt(-18, 30 * s), a);
    c.fillStyle = '#0a0d10';
    c.beginPath();
    c.arc(e[0], e[1], 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(e[0] + 1.5, e[1] - 1.5, 1.8, 0, Math.PI * 2);
    c.fill();
  }
  // scared
  if (shark.mode === 'flee') {
    const d0 = pt(-30, 70);
    c.fillStyle = `rgba(191,239,255,${clamp((t - shark.modeT) / 0.12)})`;
    c.beginPath();
    c.moveTo(d0[0], d0[1] - 22);
    c.quadraticCurveTo(d0[0] + 12, d0[1], d0[0], d0[1] + 8);
    c.quadraticCurveTo(d0[0] - 12, d0[1], d0[0], d0[1] - 22);
    c.fill();
  }
}

function drawShock(c, t) {
  const s = t - scatterAt;
  if (s < 0 || s > 1.2) return;
  const k = 1 - s / 1.2;
  c.strokeStyle = `rgba(191,248,255,${0.8 * k})`;
  c.lineWidth = 10 * k;
  c.beginPath();
  c.arc(p.x, p.y, 40 + 620 * (1 - Math.exp(-3.2 * s)), 0, Math.PI * 2);
  c.stroke();
}

stage.run({
  step,
  draw(ctx, t) {
    drawSea(ctx.sea, t);
    drawShock(ctx.sea, t);
    ctx.far.globalAlpha = 0.5 + 0.5 * Math.max(wa, wg);
    drawSchool(ctx.far, ctx.near, t);
    drawShark(ctx.shark, t);
    let state = 'SCHOOLING';
    if (t - scatterAt < 1) state = 'SCATTER';
    if (wa > 0.5) state = 'ARROW';
    if (shark.mode === 'chase') state = 'PREDATOR';
    if (wg > 0.5) state = shark.mode === 'flee' ? 'WHO RUNS NOW' : 'BIG FISH';
    stage.stats(`fish ${FISH} · eaten ${eaten} · ${state}`);
  },
});
