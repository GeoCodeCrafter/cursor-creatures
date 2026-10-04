// a big spider on a paper website. it drops in on a thread and chases the cursor.
// click and it spins a web there. fly the cursor into a web and it sticks. pull hard
// enough and you break free. too slow and the spider wraps it up and carries it off.

import { createStage, dot, line } from '../kit/stage.js';
import { angleDiff, approach, clamp, ease, hash, lerp, outerKnee, unit } from '../kit/math.js';

const INK = '#1c1512';
const PAPER = '#f2eee6';

const stage = createStage({
  file: 'spider.js',
  hint: 'click to make it spin a web · then fly through it',
  theme: 'paper',
  layers: [{ name: 'page' }, { name: 'web' }, { name: 'shadow' }, { name: 'body' }],
  ripple: 'rgba(0,0,0,0.3)',
});
stage.ghost.hidden = true;
if (document.fonts) ['400 112px Fraunces', 'italic 400 112px Fraunces'].forEach((f) => document.fonts.load(f));
document.querySelector('.layer-shadow').style.filter = 'blur(7px)';
document.querySelector('.layer-shadow').style.opacity = '0.28';

const LEGS = 8;
const HIP_ANG = [0.42, 0.95, 1.55, 2.2];
const REST_ANG = [0.52, 1.2, 1.95, 2.6];
const REACH = [240, 215, 210, 240];
const CURL_ANG = [0.28, 0.85, 2.15, 2.85];
const CURL_REACH = [130, 105, 105, 130];
const HIP_R = 30;
const FEMUR = 150;
const TIBIA = 150;
const STEP_AT = 62;
const STEP_TIME = 0.085;
const SPINNERET = 175;

const sideOf = (li) => (li < 4 ? -1 : 1);
const pairOf = (li) => li % 4;
const groupOf = (li) => (pairOf(li) + (li < 4 ? 0 : 1)) % 2;
const offs = (a, r, ang) => [Math.cos(a + ang) * r, Math.sin(a + ang) * r];
const hipAt = (x, y, a, li) => {
  const [dx, dy] = offs(a, HIP_R, sideOf(li) * HIP_ANG[pairOf(li)]);
  return [x + dx, y + dy];
};
const restAt = (x, y, a, li, curl = 0) => {
  const k = pairOf(li);
  const [dx, dy] = offs(a, lerp(REACH[k], CURL_REACH[k], curl), sideOf(li) * lerp(REST_ANG[k], CURL_ANG[k], curl));
  return [x + dx, y + dy];
};

const p = stage.pointer;
const s = {
  x: stage.W / 2,
  y: -300,
  vx: 0,
  vy: 0,
  a: Math.PI / 2,
  feet: new Float32Array(LEGS * 2),
  from: new Float32Array(LEGS * 2),
  to: new Float32Array(LEGS * 2),
  stepT: new Float32Array(LEGS),
  stepping: new Uint8Array(LEGS),
  lift: new Float32Array(LEGS),
};
const resetFeet = (curl) => {
  for (let li = 0; li < LEGS; li++) {
    const [fx, fy] = restAt(s.x, s.y, s.a, li, curl);
    s.feet[li * 2] = fx;
    s.feet[li * 2 + 1] = fy;
    s.stepping[li] = 0;
  }
};
resetFeet(1);

// drop | hunt | build | rush | wrap | carry | gone
let mode = 'drop';
let modeT = 0;
let dropX = stage.W / 2;
let dropTo = stage.H * 0.45;
const setMode = (m, t) => {
  mode = m;
  modeT = t;
};

// ── webs ────────────────────────────────────────────────────────────────────
const RADIALS = 12;
const webs = [];
let building = null;
let silk = 0;

function makeWeb(hub, t) {
  const R = Math.min(380, stage.W * 0.4, stage.H * 0.4);
  const ang = Array.from({ length: RADIALS }, (_, i) => -Math.PI / 2 + (i / RADIALS) * Math.PI * 2 + (hash(i + t, 1) - 0.5) * 0.18);
  const len = ang.map((_, i) => R * (0.85 + hash(i + t, 2) * 0.3));
  const turns = 6;
  const pts = [];
  for (let k = 0; k <= turns * RADIALS; k++) {
    const i = k % RADIALS;
    const u = k / (turns * RADIALS);
    const r = 40 + u * (len[i] * 0.9 - 40);
    pts.push([hub[0] + Math.cos(ang[i]) * r, hub[1] + Math.sin(ang[i]) * r]);
  }
  const segLen = pts.slice(1).map((q, k) => Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1]));
  return { hub, R, ang, len, pts, segLen, total: segLen.reduce((a, b) => a + b, 0), t0: t, radialsDone: t + 0.1 + RADIALS * 0.06, spiralDone: 0, fadeAt: null, broken: false };
}
const radialGrow = (w, t, i) => clamp((t - (w.t0 + i * 0.06)) / 0.14);
const spiralU = (w, t) => (t < w.radialsDone ? 0 : clamp((t - w.radialsDone) / 1.6));
function spiralPts(w, u) {
  let d = u * w.total;
  const out = [w.pts[0]];
  let k = 0;
  while (k < w.segLen.length && d > w.segLen[k]) {
    d -= w.segLen[k];
    k++;
    out.push(w.pts[k]);
  }
  if (k < w.segLen.length && u > 0) {
    const a = w.pts[k];
    const b = w.pts[k + 1];
    const f = d / w.segLen[k];
    out.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
  }
  return out;
}

// ── the stuck cursor ────────────────────────────────────────────────────────
let stuck = null; // { web, at: [x,y], t0, held: [x,y] }
let cocoon = null; // { x, y, px, py, wrap }

stage.on('click', (x, y) => {
  if (mode !== 'hunt' || stuck) return;
  // start a new web where you clicked; old ones fade once there are three
  const live = webs.filter((w) => w.fadeAt === null);
  if (live.length >= 3) live[0].fadeAt = stage.t;
  building = makeWeb([x, y], stage.t);
  building.spiralDone = building.radialsDone + 1.6;
  webs.push(building);
  setMode('build', stage.t);
});

function steer(target, face, maxSpeed, dt) {
  let dvx = (target[0] - s.x) * 5;
  let dvy = (target[1] - s.y) * 5;
  const dl = Math.hypot(dvx, dvy);
  if (dl > maxSpeed) {
    dvx *= maxSpeed / dl;
    dvy *= maxSpeed / dl;
  }
  s.vx = approach(s.vx, dvx, 10, dt);
  s.vy = approach(s.vy, dvy, 10, dt);
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  if (face !== null) s.a += clamp(angleDiff(face, s.a), -10 * dt, 10 * dt);
}

function step(dt, t) {
  const cur = [p.x, p.y];
  const hanging = mode === 'drop' || mode === 'gone';

  // ── the cursor vs the webs
  if (!stuck && (mode === 'hunt' || mode === 'build')) {
    for (const w of webs) {
      if (w.fadeAt !== null || w.broken || t < w.spiralDone) continue;
      if (Math.hypot(p.x - w.hub[0], p.y - w.hub[1]) < w.R * 0.75) {
        stuck = { web: w, at: [p.x, p.y], t0: t };
        stage.shake(6);
        if (mode === 'build') building = null;
        setMode('rush', t);
        break;
      }
    }
  }
  if (stuck && mode === 'rush') {
    const pull = Math.hypot(p.x - stuck.at[0], p.y - stuck.at[1]);
    if (pull > 280) {
      // ripped free
      stuck.web.broken = true;
      stuck.web.fadeAt = t;
      stuck = null;
      setMode('hunt', t);
      stage.shake(10);
    }
  }
  if (stuck) {
    const dx = p.x - stuck.at[0];
    const dy = p.y - stuck.at[1];
    stuck.held = [stuck.at[0] + dx * 0.22, stuck.at[1] + dy * 0.22];
  }

  if (hanging) {
    // dangling head down on the dragline
    if (mode === 'drop') {
      const q = clamp((t - modeT) / 1.6);
      s.y = lerp(-260, dropTo, ease.out(q));
      if (q >= 1) {
        setMode('hunt', t);
        resetFeet(0.5);
      }
    } else if (t - modeT > 1.2) {
      // back for more
      dropX = clamp(p.x, 200, stage.W - 200);
      dropTo = clamp(p.y - 260, 260, stage.H * 0.6);
      s.x = dropX;
      s.y = -260;
      s.a = Math.PI / 2;
      stage.cursor.hidden = false;
      cocoon = null;
      setMode('drop', t);
    }
    s.x = dropX + Math.sin(t * 2.2) * 8;
    s.a = Math.PI / 2 + Math.sin(t * 2.2 + 0.6) * 0.06;
    s.vx = 0;
    s.vy = 0;
  } else if (mode === 'hunt') {
    const d = unit(cur[0] - s.x, cur[1] - s.y);
    steer([cur[0] - d[0] * 125, cur[1] - d[1] * 125], Math.atan2(cur[1] - s.y, cur[0] - s.x), 820, dt);
  } else if (mode === 'build') {
    const w = building;
    let face;
    if (t < w.radialsDone) face = w.ang[clamp(Math.floor((t - w.t0) / 0.06), 0, RADIALS - 1)];
    else {
      const tip = spiralPts(w, spiralU(w, t)).at(-1);
      face = Math.atan2(tip[1] - w.hub[1], tip[0] - w.hub[0]);
    }
    steer(w.hub, face, 1100, dt);
    if (t > w.spiralDone) {
      building = null;
      setMode('hunt', t);
    }
  } else if (mode === 'rush') {
    const target = stuck.held;
    const d = unit(s.x - target[0], s.y - target[1]);
    steer([target[0] + d[0] * 150, target[1] + d[1] * 150], Math.atan2(target[1] - s.y, target[0] - s.x), 1300, dt);
    if (Math.hypot(s.x - target[0], s.y - target[1]) < 175) {
      setMode('wrap', t);
      stuck.orbit0 = Math.atan2(s.y - target[1], s.x - target[0]);
      stage.cursor.hidden = true;
    }
  } else if (mode === 'wrap') {
    const q = clamp((t - modeT) / 1.3);
    const c = stuck.held;
    const phi = stuck.orbit0 + ease.inOut(q) * 2.2 * Math.PI * 2;
    steer([c[0] + Math.cos(phi) * 150, c[1] + Math.sin(phi) * 150], Math.atan2(c[1] - s.y, c[0] - s.x), 1600, dt);
    if (q >= 1) {
      cocoon = { x: c[0], y: c[1], px: c[0], py: c[1], wrap: 1 };
      stuck.web.fadeAt = t + 0.6;
      stuck = null;
      setMode('carry', t);
    }
  } else if (mode === 'carry') {
    // climb straight off the top of the page with it
    steer([s.x, -900], -Math.PI / 2, 1400, dt);
    if (s.y < -500) {
      setMode('gone', t);
      s.y = -2000;
    }
  }

  // ── cocoon swings on a rope under the climbing spider
  if (cocoon && mode === 'carry') {
    const ax = s.x - Math.cos(s.a) * SPINNERET;
    const ay = s.y - Math.sin(s.a) * SPINNERET;
    const vx = (cocoon.x - cocoon.px) * 0.995;
    const vy = (cocoon.y - cocoon.py) * 0.995;
    cocoon.px = cocoon.x;
    cocoon.py = cocoon.y;
    cocoon.x += vx;
    cocoon.y += vy + 2600 * dt * dt;
    const L = lerp(40, 150, clamp((t - modeT) / 0.5));
    const dx = cocoon.x - ax;
    const dy = cocoon.y - ay;
    const d = Math.hypot(dx, dy) || 1;
    if (d > L) {
      cocoon.x = ax + (dx / d) * L;
      cocoon.y = ay + (dy / d) * L;
    }
  }

  // ── legs: two groups of four take turns, like the real thing
  const curl = hanging ? 1 : 0;
  const busy = [0, 0];
  for (let li = 0; li < LEGS; li++) if (s.stepping[li]) busy[groupOf(li)] = 1;
  for (let li = 0; li < LEGS; li++) {
    const rest = restAt(s.x, s.y, s.a, li, curl);
    if (hanging) {
      s.feet[li * 2] = rest[0];
      s.feet[li * 2 + 1] = rest[1];
      s.lift[li] = 0;
      continue;
    }
    if (s.stepping[li]) {
      const q = (t - s.stepT[li]) / STEP_TIME;
      if (q >= 1) {
        s.stepping[li] = 0;
        s.feet[li * 2] = s.to[li * 2];
        s.feet[li * 2 + 1] = s.to[li * 2 + 1];
        s.lift[li] = 0;
      } else {
        const e = ease.inOut(q);
        s.feet[li * 2] = lerp(s.from[li * 2], s.to[li * 2], e);
        s.feet[li * 2 + 1] = lerp(s.from[li * 2 + 1], s.to[li * 2 + 1], e);
        s.lift[li] = Math.sin(Math.PI * q);
      }
      continue;
    }
    const off = Math.hypot(s.feet[li * 2] - rest[0], s.feet[li * 2 + 1] - rest[1]);
    if ((off > STEP_AT && !busy[1 - groupOf(li)]) || off > STEP_AT * 2.2) {
      s.stepping[li] = 1;
      busy[groupOf(li)] = 1;
      s.stepT[li] = t;
      s.from[li * 2] = s.feet[li * 2];
      s.from[li * 2 + 1] = s.feet[li * 2 + 1];
      s.to[li * 2] = rest[0] + s.vx * 0.12;
      s.to[li * 2 + 1] = rest[1] + s.vy * 0.12;
    }
  }

  // metres of silk, for the readout (1 m per 1000 px, it's a big spider)
  silk = webs.reduce((sum, w) => {
    let px = 0;
    for (let i = 0; i < RADIALS; i++) px += radialGrow(w, t, i) * w.len[i];
    return sum + px + spiralU(w, t) * w.total;
  }, 0) / 1000;
  for (let i = webs.length - 1; i >= 0; i--) if (webs[i].fadeAt !== null && t - webs[i].fadeAt > 1.2) webs.splice(i, 1);
}

// ── drawing ─────────────────────────────────────────────────────────────────
function thread(c, pts, w = 1) {
  line(c, pts);
  c.strokeStyle = 'rgba(40,32,26,0.45)';
  c.lineWidth = 3.4 * w;
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.95)';
  c.lineWidth = 1.4 * w;
  c.stroke();
}

function drawPage(c) {
  const x0 = Math.max(60, stage.W * 0.08);
  const y0 = stage.H * 0.26;
  c.fillStyle = INK;
  c.font = '400 112px Fraunces, Georgia, serif';
  c.textBaseline = 'alphabetic';
  c.fillText('Welcome to', x0, y0);
  c.font = 'italic 400 112px Fraunces, Georgia, serif';
  c.fillText('my website.', x0, y0 + 114);
  c.fillStyle = '#dfd8cc';
  [0.9, 0.86, 0.62].forEach((w, i) => {
    const ww = Math.min(900, stage.W - 2 * x0) * w;
    c.beginPath();
    c.roundRect ? c.roundRect(x0, y0 + 170 + i * 54, ww, 26, 13) : c.rect(x0, y0 + 170 + i * 54, ww, 26);
    c.fill();
  });
  c.fillStyle = INK;
  c.beginPath();
  c.roundRect ? c.roundRect(x0, y0 + 350, 360, 110, 55) : c.rect(x0, y0 + 350, 360, 110);
  c.fill();
  c.fillStyle = PAPER;
  c.font = '600 40px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('Get started', x0 + 180, y0 + 405);
  c.textAlign = 'left';
}

// the web bends towards wherever the stuck cursor is tugging
function bend(q, w) {
  if (!stuck || stuck.web !== w) return q;
  const pull = [stuck.held[0] - stuck.at[0], stuck.held[1] - stuck.at[1]];
  const d2 = (q[0] - stuck.at[0]) ** 2 + (q[1] - stuck.at[1]) ** 2;
  const f = Math.exp(-d2 / (2 * 190 * 190));
  return [q[0] + pull[0] * f * 3, q[1] + pull[1] * f * 3];
}

function drawWebs(c, t) {
  for (const w of webs) {
    c.globalAlpha = w.fadeAt === null ? 1 : clamp(1 - (t - w.fadeAt) / 1.2);
    for (let i = 0; i < RADIALS; i++) {
      const g = radialGrow(w, t, i);
      if (g <= 0) continue;
      const end = [w.hub[0] + Math.cos(w.ang[i]) * w.len[i], w.hub[1] + Math.sin(w.ang[i]) * w.len[i]];
      const pts = Array.from({ length: 11 }, (_, k) => bend([lerp(w.hub[0], end[0], (k / 10) * g), lerp(w.hub[1], end[1], (k / 10) * g)], w));
      thread(c, pts, 1.15);
    }
    const u = spiralU(w, t);
    if (u > 0) {
      const sp = spiralPts(w, u).map((q) => bend(q, w));
      thread(c, sp);
      c.fillStyle = '#fff';
      c.strokeStyle = 'rgba(40,32,26,0.35)';
      c.lineWidth = 1;
      sp.forEach((q, k) => {
        if (k % 7 !== 3) return;
        c.beginPath();
        c.arc(q[0], q[1], 3.2, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      });
    }
  }
  c.globalAlpha = 1;

  // draglines: from the top while it hangs, to the spiral tip while spinning, the climb rope
  const spin = [s.x - Math.cos(s.a) * SPINNERET, s.y - Math.sin(s.a) * SPINNERET];
  const mouth = [s.x + Math.cos(s.a) * 44, s.y + Math.sin(s.a) * 44];
  if (mode === 'drop') thread(c, [[dropX, -40], spin]);
  if (mode === 'build' && building && t > building.radialsDone) thread(c, [mouth, spiralPts(building, spiralU(building, t)).at(-1)], 0.8);
  if (mode === 'carry') {
    thread(c, [[s.x, -600], mouth]);
    if (cocoon) thread(c, [spin, [cocoon.x, cocoon.y]], 1.2);
  }
}

const ARROW = new Path2D('M2 2 L2 30 L9 23.5 L13.5 34 L18 32 L13.5 21.8 L22.5 21.8 Z');
const STICKY = [[-110, -40], [-30, -115], [95, -70], [120, 55], [20, 125], [-95, 85]];

function drawCaught(c, t) {
  let pos;
  let wrap = 0;
  let spinDeg = 0;
  let scale = 1.1 / stage.Z;
  if (stuck) {
    pos = stuck.held;
    if (mode === 'wrap') {
      const q = clamp((t - modeT) / 1.3);
      wrap = q;
      spinDeg = 540 * q ** 1.2;
      scale = lerp(1.1 / stage.Z, 2.6, q);
    }
    // the sticky strands holding it in the web
    for (const [ox, oy] of STICKY) thread(c, [pos, [stuck.at[0] + ox, stuck.at[1] + oy]], 0.9);
  } else if (cocoon) {
    pos = [cocoon.x, cocoon.y];
    wrap = 1;
    spinDeg = 540;
    scale = 2.6;
    const ax = s.x - Math.cos(s.a) * SPINNERET;
    const ay = s.y - Math.sin(s.a) * SPINNERET;
    spinDeg -= (Math.atan2(pos[0] - ax, ay - pos[1]) * 180) / Math.PI;
  } else return;
  stage.cursor.hidden = true;
  const shake = mode === 'rush' ? Math.sin(t * 70) * 2 : 0;
  c.save();
  c.translate(pos[0] + shake, pos[1]);
  c.rotate((spinDeg * Math.PI) / 180);
  c.scale(scale, scale);
  c.translate(-2, -2);
  if (wrap > 0) {
    c.fillStyle = `rgba(247,244,238,${0.5 * wrap})`;
    c.strokeStyle = 'rgba(60,50,40,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(11, 18, 10 + 5 * wrap, 16 + 4 * wrap, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  c.globalAlpha = 1 - 0.35 * wrap;
  c.fillStyle = '#000';
  c.strokeStyle = '#fff';
  c.lineWidth = 2.2;
  c.lineJoin = 'round';
  c.fill(ARROW);
  c.stroke(ARROW);
  c.globalAlpha = 1;
  const strands = Math.floor(wrap * 16);
  for (let k = 0; k < strands; k++) {
    const cy = 18 + (hash(k, 1) - 0.5) * 30;
    c.save();
    c.translate(11, cy);
    c.rotate((hash(k, 2) - 0.5) * 1.2);
    c.beginPath();
    c.ellipse(0, 0, 13 + hash(k, 3) * 4, 2.6, 0, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(60,50,40,0.35)';
    c.lineWidth = 1.3;
    c.stroke();
    c.strokeStyle = '#fff';
    c.lineWidth = 0.7;
    c.stroke();
    c.restore();
  }
  c.restore();
}

function hairs(c, a, b, n, len) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const sd = i % 2 ? 1 : -1;
    const px = a[0] + dx * f;
    const py = a[1] + dy * f;
    c.moveTo(px, py);
    c.lineTo(px + nx * len * sd + (dx / l) * len * 0.6, py + ny * len * sd + (dy / l) * len * 0.6);
  }
  c.strokeStyle = INK;
  c.lineWidth = 2.2;
  c.stroke();
}

function legsOf() {
  return Array.from({ length: LEGS }, (_, li) => {
    const hip = hipAt(s.x, s.y, s.a, li);
    const foot = [s.feet[li * 2], s.feet[li * 2 + 1]];
    const knee = outerKnee(hip, foot, FEMUR, TIBIA, [s.x, s.y]);
    const tar = [knee[0] + (foot[0] - knee[0]) * 0.72, knee[1] + (foot[1] - knee[1]) * 0.72];
    return { hip, knee, tar, foot, lift: s.lift[li] };
  });
}

function drawShadow(c) {
  if (mode === 'gone') return;
  c.save();
  c.translate(14, 22);
  c.strokeStyle = '#000';
  c.fillStyle = '#000';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = 12;
  for (const l of legsOf()) {
    line(c, [l.hip, l.knee, l.foot]);
    c.stroke();
  }
  c.translate(s.x, s.y);
  c.rotate(s.a);
  c.beginPath();
  c.ellipse(-108, 0, 80, 60, 0, 0, Math.PI * 2);
  c.ellipse(0, 0, 48, 42, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawSpider(c) {
  if (mode === 'gone') return;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const l of legsOf()) {
    c.strokeStyle = INK;
    c.lineWidth = 15 + l.lift * 3;
    line(c, [l.hip, l.knee]);
    c.stroke();
    c.lineWidth = 11 + l.lift * 2;
    line(c, [l.knee, l.tar]);
    c.stroke();
    c.strokeStyle = '#2e231d';
    c.lineWidth = 6;
    line(c, [l.tar, l.foot]);
    c.stroke();
    hairs(c, l.hip, l.knee, 7, 9);
    hairs(c, l.knee, l.tar, 6, 8);
    for (const [q, r, w] of [[l.knee, 9, 3], [l.tar, 6, 2.5]]) {
      c.fillStyle = '#7a5a3f';
      c.strokeStyle = INK;
      c.lineWidth = w;
      c.beginPath();
      c.arc(q[0], q[1], r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  // body, in the spider's own frame (x = forward)
  c.save();
  c.translate(s.x, s.y);
  c.rotate(s.a);
  c.strokeStyle = INK;
  c.lineWidth = 2.4;
  c.beginPath();
  for (let k = 0; k < 44; k++) {
    const q = (k / 44) * Math.PI * 2;
    const ex = -108 + Math.cos(q) * 80;
    const ey = Math.sin(q) * 60;
    c.moveTo(ex, ey);
    c.lineTo(ex + Math.cos(q) * 12, ey + Math.sin(q) * 12);
  }
  c.stroke();
  const abd = c.createRadialGradient(-140, -21, 0, -108, 0, 90);
  abd.addColorStop(0, '#4a372b');
  abd.addColorStop(0.6, '#241a15');
  abd.addColorStop(1, INK);
  c.fillStyle = abd;
  c.beginPath();
  c.ellipse(-108, 0, 80, 60, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#a37a52';
  c.globalAlpha = 0.85;
  for (let k = 0; k < 4; k++) {
    c.lineWidth = 7 - k;
    line(c, [[-70 - k * 26, -30 + k * 5], [-86 - k * 26, 0], [-70 - k * 26, 30 - k * 5]]);
    c.stroke();
  }
  c.globalAlpha = 0.12;
  c.fillStyle = '#fff';
  c.beginPath();
  c.ellipse(-80, -24, 26, 9, 0, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
  c.fillStyle = INK;
  c.beginPath();
  c.ellipse(-40, 0, 14, 10, 0, 0, Math.PI * 2);
  c.fill();
  const ceph = c.createRadialGradient(15, -8, 0, 0, 0, 55);
  ceph.addColorStop(0, '#5a4336');
  ceph.addColorStop(0.5, '#2a1e18');
  ceph.addColorStop(1, INK);
  c.fillStyle = ceph;
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(0, 0, 48, 42, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.globalAlpha = 0.6;
  c.strokeStyle = '#6b5140';
  c.lineWidth = 3;
  line(c, [[-30, 0], [22, 0]]);
  c.stroke();
  c.globalAlpha = 1;
  for (const sd of [-1, 1]) {
    c.fillStyle = '#2a1e18';
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(46, sd * 11, 14, 9, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = '#0e0a08';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(56, sd * 13);
    c.quadraticCurveTo(66, sd * 10, 62, sd * 2);
    c.stroke();
    c.strokeStyle = INK;
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(34, sd * 30);
    c.quadraticCurveTo(58, sd * 42, 72, sd * 30);
    c.stroke();
  }
  for (const [ex, ey, r] of [[30, -9, 8], [30, 9, 8], [22, -22, 5], [22, 22, 5], [14, -15, 4], [14, 15, 4], [8, -28, 3.5], [8, 28, 3.5]]) {
    c.fillStyle = '#050303';
    dot(c, ex, ey, r);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    dot(c, ex + r * 0.3, ey - r * 0.35, r * 0.35);
  }
  c.restore();
}

const STATE = { drop: 'incoming', hunt: 'hunting', build: 'building', rush: 'caught.', wrap: 'wrapping', carry: 'taken', gone: 'taken' };
stage.run({
  step,
  draw(ctx, t) {
    drawPage(ctx.page);
    drawWebs(ctx.web, t);
    drawCaught(ctx.web, t);
    if (!stuck && !cocoon && mode !== 'wrap') stage.cursor.hidden = false;
    drawShadow(ctx.shadow);
    drawSpider(ctx.body);
    stage.stats(`legs 8 · silk ${silk.toFixed(1)} m · ${STATE[mode]}`);
  },
});
