// a skeleton spitting cobra, reared up and facing you. it sways with your cursor and spits
// at it, and the venom lands on the glass of your screen: it splats, drips, and you can't
// see through it. click for the wipers. hold still and it stops aiming at the cursor and
// goes for your eyes.

import { dot, line } from '../kit/stage.js';
import { clamp, ease } from '../kit/math.js';
import { add, ARROW, arrowScale, mix, rot, smooth, sub } from '../kit/body.js';

const BG = '#06070b';
const BONE = (l = 80) => `hsl(46, 85%, ${l}%)`;
const VENOM = (a, l = 52) => `hsla(78, 100%, ${l}%, ${a})`;
const RED = '#ff3b4e';
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const COND = "'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif";
const FLY = 0.16;
const FLY_BIG = 0.5;

export const meta = {
  file: 'cobra.js',
  hint: 'click to wipe · hold still and it goes for your eyes',
  layers: [{ name: 'cobra', glow: 'rgba(200,255,120,0.3)', blur: 12 }, { name: 'spit' }, { name: 'cur' }, { name: 'venom' }, { name: 'hud' }],
  vars: { accent: 'rgba(214,255,74,0.95)' },
  ripple: 'rgba(214,255,74,0.8)',
};

function makeSplat(c, r, at, seed, big = false) {
  let s0 = seed;
  const rr = () => {
    s0 = (s0 * 1664525 + 1013904223) >>> 0;
    return s0 / 4294967296;
  };
  const spikes = Array.from({ length: big ? 16 : 7 }, () => ({ a: rr() * Math.PI * 2, len: 1.35 + rr() * (big ? 0.5 : 0.8), w: 0.07 + rr() * 0.06 }));
  const wob = [rr() * 6, rr() * 6, rr() * 6];
  const blob = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    let k = 0.88 + 0.08 * Math.sin(a * 3 + wob[0]) + 0.06 * Math.sin(a * 5 + wob[1]) + 0.04 * Math.sin(a * 9 + wob[2]);
    for (const s of spikes) {
      const d = Math.abs(Math.atan2(Math.sin(a - s.a), Math.cos(a - s.a)));
      if (d < s.w) k = Math.max(k, 1 + (s.len - 1) * Math.pow(1 - d / s.w, 1.6));
    }
    blob.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
  }
  const drops = spikes.map((s) => ({ p: [Math.cos(s.a) * r * (s.len + 0.18), Math.sin(s.a) * r * (s.len + 0.18)], r: r * (0.06 + rr() * 0.05) }));
  for (let k = 0; k < (big ? 40 : 10); k++) {
    const a = rr() * Math.PI * 2;
    const d = r * (1.3 + rr() * (big ? 0.8 : 1.4));
    drops.push({ p: [Math.cos(a) * d, Math.sin(a) * d], r: r * (0.02 + rr() * 0.05) * (big ? 0.6 : 1) });
  }
  const drips = Array.from({ length: big ? 9 : 3 }, (_, k) => ({
    dx: (big ? (k / 8 - 0.5) * 1.7 : (k - 1) * 0.45 + (rr() - 0.5) * 0.2) * r,
    w: (big ? 0.05 : 0.14) * r * (0.7 + rr() * 0.6),
    len: r * (big ? 0.5 + rr() * 0.6 : 1.2 + rr() * 2.2),
    tau: 1.2 + rr() * 1.8,
  }));
  return { c, r, at, blob, drops, drips, big };
}

export function create(stage) {
  const p = stage.pointer;
  stage.ghost.style.top = '9%';
  stage.cursor.hidden = true;
  const S = () => clamp(Math.min(stage.W / 1080, stage.H / 1000) * 1.15, 0.8, 1.2);
  const HEAD0 = () => [stage.W / 2, stage.H * 0.5];
  const BASE = () => [stage.W / 2, stage.H * 0.84];
  const eyes = () => [
    [stage.W / 2 - Math.min(200, stage.W * 0.16), stage.H * 0.3],
    [stage.W / 2 + Math.min(200, stage.W * 0.16), stage.H * 0.3],
  ];

  const head = { x: stage.W * 0.55, y: stage.H * 0.5, tilt: 0 };
  // sway (spitting at the cursor) · stare (going for your eyes) · covered
  let mode = 'sway';
  let modeT = 0;
  const spits = []; // { fire, at, to, big, kind }
  let splats = [];
  let nextAt = 1.2;
  let stuck = null; // { at, p }
  let wipeAt = -10;
  let calmUntil = 3;
  let hits = 0;
  let saidAt = -10;
  const say = (s) => {
    stage.headline(s);
    saidAt = stage.t;
  };
  stage.headline('move your mouse');
  const set = (m, t) => {
    mode = m;
    modeT = t;
  };
  const spit = (t, to, kind, big = false) => spits.push({ fire: t, at: t + (big ? FLY_BIG : FLY), to, kind, big, landed: false, from: null });
  const lookAt = () => (mode === 'sway' ? [p.x, p.y] : mix(eyes()[0], eyes()[1], 0.5));

  stage.on('click', () => {
    if (wipeAt > 0 && stage.t - wipeAt < 1.1) return;
    if (!splats.length) return;
    wipeAt = stage.t;
  });

  function step(dt, t) {
    const c = [p.x, p.y];
    const k = arrowScale(stage);
    const mt = t - modeT;
    const staring = mode !== 'sway';
    const tx = staring ? HEAD0()[0] : clamp(c[0], stage.W * 0.3, stage.W * 0.7);
    const ty = staring ? HEAD0()[1] : HEAD0()[1] + (c[1] - stage.H * 0.58) * 0.2;
    const kk = 1 - Math.exp(-(staring ? 2.5 : 2.2) * dt);
    head.x += (tx - head.x) * kk;
    head.y += (ty - head.y) * kk;
    const lean = staring ? 0 : clamp((c[0] - head.x) / 14, -14, 14);
    head.tilt += (lean - head.tilt) * (1 - Math.exp(-4 * dt));

    if (mode === 'sway') {
      // spits at the cursor, every couple of seconds
      if (t > nextAt && p.real) {
        spit(t, add(c, [9 * k, 15 * k]), 'cursor');
        nextAt = t + 1.9 + Math.random() * 0.8;
      }
      if (p.real && p.still > 1.3 && t > calmUntil && splats.length < 8) {
        set('stare', t);
        say('');
      }
    } else if (mode === 'stare') {
      const [l, r] = eyes();
      if (mt > 0.9 && !spits.some((s) => s.kind === 'eyeL')) spit(t, l, 'eyeL');
      if (mt > 1.35 && !spits.some((s) => s.kind === 'eyeR')) spit(t, r, 'eyeR');
      if (mt > 2.95 && !spits.some((s) => s.big)) spit(t, [stage.W / 2, stage.H * 0.48], 'glob', true);
      if (mt > 3.6) {
        set('covered', t);
        say('');
      }
    } else if (mode === 'covered') {
      if (mt > 4 && wipeAt < modeT) wipeAt = t;
    }
    // spit landing on the glass
    for (const s of spits) {
      if (s.landed || t < s.at) continue;
      s.landed = true;
      const r = s.big ? Math.max(stage.W, stage.H) * 0.62 : s.kind === 'cursor' ? 82 : 92;
      splats.push(makeSplat(s.to, r, t, Math.floor(t * 991) + 7, s.big));
      stage.bump();
      stage.shake(s.big ? 18 : 5);
      if (s.kind === 'cursor') {
        const d = Math.hypot(c[0] + 9 * k - s.to[0], c[1] + 15 * k - s.to[1]);
        if (d < 60) {
          stuck = { at: t, p: c };
          hits++;
          say('stuck.');
        } else say('missed.');
      }
    }
    while (spits.length && t - spits[0].at > 0.5) spits.shift();
    // the wipers clear the glass
    if (wipeAt > 0 && t - wipeAt > 1.0) {
      splats = [];
      wipeAt = -10;
      if (mode !== 'sway') {
        set('sway', t);
        calmUntil = t + 4;
        nextAt = t + 1.5;
        say('again?');
      }
    }
    if (stuck && t - stuck.at > 0.75) stuck = null;
    if (saidAt > 0 && t - saidAt > 1.8 && mode === 'sway') {
      stage.headline('move your mouse');
      saidAt = -10;
    }
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  const hoodAt = (t) => {
    const mt = t - modeT;
    if (mode === 'stare') return mt < 0.6 ? 0.75 + 0.2 * smooth(0, 0.6, mt) : mt < 2 ? 0.95 - 0.15 * smooth(1.4, 2, mt) : 0.8 + 0.35 * smooth(2.1, 2.9, mt);
    if (mode === 'covered') return 1.15 - 0.15 * smooth(0, 0.4, mt);
    const last = spits.find((s) => !s.landed);
    return 0.65 + (last ? 0.2 * smooth(last.fire - 0.3, last.fire, t) : 0) + 0.05 * Math.sin(t * 1.3);
  };
  const nearAt = (t) => (mode === 'stare' ? 1 + 0.18 * smooth(2.1, 2.9, t - modeT) : mode === 'covered' ? 1.18 - 0.18 * smooth(0, 1.2, t - modeT) : 1);
  const mouthAt = (t) => {
    let m = 0;
    for (const s of spits) {
      if (s.big) m = Math.max(m, smooth(s.fire - 0.8, s.fire - 0.1, t) * (1 - smooth(s.at + 0.1, s.at + 0.6, t)) * 1.35);
      else m = Math.max(m, smooth(s.fire - 0.2, s.fire - 0.03, t) * (1 - smooth(s.fire + 0.05, s.fire + 0.25, t)));
    }
    // opening wide before the big one
    if (mode === 'stare' && t - modeT > 2.1) m = Math.max(m, 1.35 * smooth(2.1, 2.85, t - modeT));
    return m;
  };
  const headPose = (t) => {
    const calm = mode !== 'sway' ? 0.35 : 1;
    const sway = Math.sin(t * 2.6) * 26 * calm;
    const rear = mode === 'stare' ? -60 * smooth(2.1, 2.9, t - modeT) : mode === 'covered' ? -60 * (1 - smooth(0, 1.2, t - modeT)) : 0;
    return { p: [head.x + sway, head.y + rear + Math.cos(t * 5.2) * 6 * calm], tilt: head.tilt + Math.sin(t * 2.6 + 0.6) * 4 * calm, s: S() * nearAt(t) };
  };

  function drawCobra(g, t) {
    const h = headPose(t);
    const s = h.s;
    const P = h.p;
    const tilt = (h.tilt * Math.PI) / 180;
    const L = (x, y) => add(P, rot([x * s, y * s], tilt));
    const hood = hoodAt(t);
    const m = mouthAt(t);
    const base = BASE();
    const sc = S() / 2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const stroke = (pts, col, w, close = false, fill = null) => {
      line(g, pts, close);
      if (fill) {
        g.fillStyle = fill;
        g.fill();
      }
      g.strokeStyle = col;
      g.lineWidth = w;
      g.stroke();
    };
    // the coils
    [
      [150, 250, 50],
      [92, 270, 54],
      [36, 230, 48],
    ].forEach(([dy, rx, ry], i) => {
      const c = [base[0], base[1] + dy * sc * 2];
      g.beginPath();
      g.ellipse(c[0], c[1], rx * sc * 2, ry * sc * 2, 0, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = BONE(74 - i * 3);
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.ellipse(c[0], c[1], (rx - 26) * sc * 2, (ry - 16) * sc * 2, 0, 0, Math.PI * 2);
      g.strokeStyle = BONE(60);
      g.lineWidth = 1.4;
      g.stroke();
      g.fillStyle = BONE(78);
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        if (Math.sin(a) < -0.1) continue;
        dot(g, c[0] + Math.cos(a) * (rx - 13) * sc * 2, c[1] + Math.sin(a) * (ry - 8) * sc * 2, 3.2);
      }
    });
    // the body, rising out of the coils to the hood
    const NB = L(0, 190);
    const b1 = [base[0], base[1] - 120 * sc * 2];
    const b2 = [NB[0] + (base[0] - NB[0]) * 0.5, NB[1] + 110 * sc * 2];
    const bez = (u) => {
      const v = 1 - u;
      return [0, 1].map((j) => v * v * v * base[j] + 3 * v * v * u * b1[j] + 3 * v * u * u * b2[j] + u * u * u * NB[j]);
    };
    const spine = [];
    for (let k = 0; k <= 14; k++) spine.push(bez(k / 14));
    for (let k = 1; k <= 8; k++) spine.push(L(0, 190 - (k / 8) * 150));
    for (let i = 0; i < 15; i++) {
      const a = spine[i];
      const b = spine[i + 1];
      const d = sub(b, a);
      const l = Math.hypot(d[0], d[1]) || 1;
      const n = [-d[1] / l, d[0] / l];
      const w = (30 - i * 0.6) * (s / 2);
      g.beginPath();
      g.moveTo(a[0] - n[0] * w, a[1] - n[1] * w);
      g.quadraticCurveTo(a[0], a[1] + 9, a[0] + n[0] * w, a[1] + n[1] * w);
      g.strokeStyle = BONE(70);
      g.lineWidth = 2;
      g.stroke();
    }
    stroke(spine, BONE(76), 3.2);
    for (const q of spine) {
      g.beginPath();
      g.roundRect(q[0] - 9, q[1] - 4, 18, 8, 4);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = BONE(82);
      g.lineWidth = 2;
      g.stroke();
    }
    // the hood: ribs fanning out from the neck, and the skin stretched between them
    const tips = [];
    const ribs = [];
    for (let i = 0; i < 10; i++) {
      const u = i / 9;
      const y = 30 + u * 150;
      const wid = Math.pow(Math.sin(Math.PI * (0.12 + 0.82 * u)), 0.7) * 150 * hood;
      const root = L(0, y);
      const tip = { l: L(-wid, y + 10 + u * 16), r: L(wid, y + 10 + u * 16) };
      tips.push(tip);
      for (const sg of [-1, 1]) ribs.push([root, L(sg * wid * 0.55, y - 24), sg < 0 ? tip.l : tip.r]);
    }
    stroke([L(0, -40), L(60 * hood, -20), ...tips.map((q) => q.r), L(26, 210), L(-26, 210), ...[...tips].reverse().map((q) => q.l), L(-60 * hood, -20)], BONE(78), 3, true, 'hsla(46, 80%, 60%, 0.07)');
    for (const [a, c, b] of ribs) {
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.quadraticCurveTo(c[0], c[1], b[0], b[1]);
      g.strokeStyle = BONE(76);
      g.lineWidth = 2.4;
      g.stroke();
    }
    g.beginPath();
    g.moveTo(...L(-70 * hood, 150));
    g.quadraticCurveTo(...L(0, 175), ...L(70 * hood, 150));
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 16 * s;
    g.stroke();
    // the head: broad and flat, seen nose-on
    const outline = [];
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      outline.push(L(70 * Math.sign(c) * Math.pow(Math.abs(c), 0.75) * (1 - 0.3 * Math.max(0, sn)), 50 * Math.sign(sn) * Math.pow(Math.abs(sn), 0.9)));
    }
    if (m > 0.02) {
      const mc = L(0, 40 + 26 * m);
      g.beginPath();
      g.ellipse(mc[0], mc[1], 52 * s, (8 + 34 * m) * s, tilt, 0, Math.PI * 2);
      g.fillStyle = '#1a0610';
      g.fill();
      g.strokeStyle = 'hsl(340, 80%, 70%)';
      g.lineWidth = 2.4;
      g.stroke();
      for (const sg of [-1, 1]) stroke([L(sg * 24, 36 + 4 * m), L(sg * 18, 56 + 16 * m), L(sg * 13, 36 + 4 * m)], '#fff', 1, true, '#fff');
    }
    stroke(outline, BONE(86), 3.4, true, BG);
    const look = lookAt();
    for (const sg of [-1, 1]) {
      g.beginPath();
      g.moveTo(...L(0, -50));
      g.quadraticCurveTo(...L(sg * 30, -40), ...L(sg * 26, -12));
      g.quadraticCurveTo(...L(sg * 12, 2), ...L(0, 4));
      g.strokeStyle = BONE(68);
      g.lineWidth = 1.8;
      g.stroke();
      g.beginPath();
      g.moveTo(...L(sg * 26, -12));
      g.quadraticCurveTo(...L(sg * 40, -30), ...L(sg * 56, -36));
      g.strokeStyle = BONE(64);
      g.lineWidth = 1.6;
      g.stroke();
      const n = L(sg * 14, 22);
      g.beginPath();
      g.ellipse(n[0], n[1], 3.4 * s, 2.4 * s, 0, 0, Math.PI * 2);
      g.fillStyle = BONE(82);
      g.fill();
      // amber eyes, slit pupils that track what it's looking at, under heavy scales
      const e = L(sg * 48, -10);
      const lk = sub(look, e);
      const ll = Math.hypot(lk[0], lk[1]) || 1;
      const pp = add(e, [(lk[0] / ll) * 3 * s, (lk[1] / ll) * 2 * s]);
      g.beginPath();
      g.ellipse(e[0], e[1], 12 * s, 11 * s, 0, 0, Math.PI * 2);
      g.fillStyle = 'hsl(40, 100%, 55%)';
      g.fill();
      g.strokeStyle = BONE(90);
      g.lineWidth = 2.4;
      g.stroke();
      g.beginPath();
      g.ellipse(pp[0], pp[1], 2.6 * s, 9 * s, 0, 0, Math.PI * 2);
      g.fillStyle = '#140800';
      g.fill();
      g.globalAlpha = 0.7;
      g.fillStyle = '#fff';
      dot(g, e[0] - 4 * s, e[1] + 3 * s, 2 * s);
      g.globalAlpha = 1;
      line(g, [L(sg * 30, -30), L(sg * 66, -28), L(sg * 64, -14), L(sg * 32, -4)], true);
      g.fillStyle = BG;
      g.fill();
      stroke([L(sg * 32, -4), L(sg * 64, -14)], BONE(90), 3);
    }
    g.beginPath();
    g.moveTo(...L(-58, 20));
    g.quadraticCurveTo(...L(0, 40), ...L(58, 20));
    g.strokeStyle = BONE(84);
    g.lineWidth = 2.4;
    g.stroke();
    const ph = (t + 0.3) % 1.35;
    const tg = m < 0.1 && ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI) : 0;
    if (tg > 0.02) {
      const len = 52 * tg;
      const wig = Math.sin(t * 60) * 5;
      const b = L(wig, 44 + len);
      stroke([L(0, 44), b, L(wig - 9, 44 + len + 12)], 'hsl(345, 85%, 62%)', 3.4);
      stroke([b, L(wig + 9, 44 + len + 12)], 'hsl(345, 85%, 62%)', 3.4);
    }
    return { fangs: [L(-18, 60), L(18, 60)], mouth: L(0, 66) };
  }

  function drawSpit(g, t, fangs, mouth) {
    for (const s of spits) {
      if (t < s.fire || t >= s.at) continue;
      if (!s.from) s.from = { fangs, mouth };
      const u = (t - s.fire) / (s.at - s.fire);
      if (s.big) {
        const q = mix(s.from.mouth, s.to, Math.pow(u, 1.4));
        const r = 26 + Math.max(stage.W, stage.H) * 0.75 * Math.pow(u, 2.6);
        const w = 1 + 0.1 * Math.sin(t * 40);
        g.beginPath();
        g.ellipse(q[0], q[1], r * w, r / w, 0, 0, Math.PI * 2);
        g.fillStyle = VENOM(0.55);
        g.fill();
        g.strokeStyle = VENOM(0.95, 74);
        g.lineWidth = 4;
        g.stroke();
        g.beginPath();
        g.ellipse(q[0] - r * 0.35, q[1] - r * 0.4, r * 0.25, r * 0.12, -0.52, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fill();
        continue;
      }
      g.fillStyle = VENOM(0.8, 60);
      s.from.fangs.forEach((f, j) => {
        const aim = add(s.to, [(j ? 1 : -1) * 14, 0]);
        for (let k = 0; k < 9; k++) {
          const v = clamp(u - k * 0.06);
          if (v <= 0) continue;
          const q = mix(f, aim, v);
          dot(g, q[0], q[1], 2 + 20 * v * v * (1 - k * 0.07));
        }
      });
    }
  }

  function splatPath(g, k, t) {
    const age = t - k.at;
    const grow = age < 0.07 ? 0.55 + 0.45 * (age / 0.07) : 1 + 0.03 * Math.exp(-(age - 0.07) * 12) * Math.sin((age - 0.07) * 40);
    const fly = clamp(age / 0.06);
    g.beginPath();
    k.blob.forEach((q, i) => (i ? g.lineTo(k.c[0] + q[0] * grow, k.c[1] + q[1] * grow) : g.moveTo(k.c[0] + q[0] * grow, k.c[1] + q[1] * grow)));
    g.closePath();
    for (const d of k.drops) {
      const q = add(k.c, d.p, fly);
      g.moveTo(q[0] + d.r, q[1]);
      g.arc(q[0], q[1], d.r, 0, Math.PI * 2);
    }
    for (const d of k.drips) {
      const L = d.len * (1 - Math.exp(-Math.max(0, age - 0.15) / d.tau));
      if (L < 2) continue;
      const x = k.c[0] + d.dx;
      const y0 = k.c[1] + Math.sqrt(Math.max(0, 1 - Math.pow(d.dx / k.r, 2))) * k.r * 0.8;
      const w = d.w;
      g.moveTo(x - w / 2, y0);
      g.lineTo(x - w * 0.32, y0 + L);
      g.arc(x, y0 + L, w * 0.62, Math.PI, 0, true);
      g.lineTo(x + w / 2, y0);
      g.closePath();
    }
  }

  // the wipers: two arms from the bottom of the screen
  const pivots = () => [
    { p: [stage.W * 0.22, stage.H + 20], len: stage.H * 1.35 },
    { p: [stage.W * 0.74, stage.H + 20], len: stage.H * 1.25 },
  ];
  const wiperAngle = (t) => {
    const u = clamp((t - wipeAt) / 1.0);
    return u < 0.6 ? 180 + 170 * ease.inOut(u / 0.6) : 350 - 170 * ease.inOut((u - 0.6) / 0.4);
  };
  const sweptAngle = (t) => (t - wipeAt < 0.6 ? wiperAngle(t) : 350);

  function drawVenom(g, t) {
    for (const k of splats) {
      splatPath(g, k, t);
      g.fillStyle = k.big ? 'rgba(14,22,6,0.88)' : 'rgba(14,22,6,0.55)';
      g.fill();
      g.fillStyle = VENOM(k.big ? 0.8 : 0.36, k.big ? 34 : 50);
      g.fill();
      g.strokeStyle = VENOM(0.85, 72);
      g.lineWidth = 2.5;
      g.stroke();
      const hc = add(k.c, [-k.r * 0.38, -k.r * 0.4]);
      g.beginPath();
      g.ellipse(hc[0], hc[1], k.r * 0.24, k.r * 0.1, -0.56, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fill();
    }
    if (wipeAt > 0) {
      // what the wipers have cleared so far
      const a1 = sweptAngle(t);
      g.globalCompositeOperation = 'destination-out';
      for (const w of pivots()) {
        g.beginPath();
        g.moveTo(w.p[0], w.p[1]);
        for (let k = 0; k <= 24; k++) {
          const a = ((178 + ((a1 + 1 - 178) * k) / 24) * Math.PI) / 180;
          g.lineTo(w.p[0] + Math.cos(a) * (w.len + 40), w.p[1] + Math.sin(a) * (w.len + 40));
        }
        g.closePath();
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  function drawHud(g, t) {
    // visibility: how much of the screen you can still see
    let covered = 0;
    for (const k of splats) covered += k.big ? 1 : (Math.PI * k.r * k.r * 1.4) / (stage.W * stage.H);
    const v = wipeAt > 0 ? null : Math.max(0, Math.round(100 - Math.min(1, covered) * 100));
    const last = splats.length ? splats[splats.length - 1].at : -10;
    const bump = Math.max(0, 1 - (t - last) / 0.3);
    const x0 = Math.max(40, stage.W * 0.06);
    const y0 = Math.max(140, stage.H * 0.16);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = `600 ${Math.min(30, stage.W / 34)}px ${MONO}`;
    g.fillText('VISIBILITY', x0, y0);
    g.save();
    g.translate(x0, y0 + 100);
    g.scale(1 + 0.12 * bump, 1 + 0.12 * bump);
    const shown = v ?? '…';
    g.fillStyle = v === null || v > 60 ? '#fff' : v > 20 ? '#d6ff4a' : '#ff4d5e';
    g.font = `800 ${Math.min(110, stage.W / 9)}px ${COND}`;
    g.fillText(`${shown}%`, 0, 0);
    g.restore();

    // its targeting: crosshairs on your eyes
    if (mode === 'stare' && t - modeT > 0.25 && t - modeT < 3.3) {
      const lock = clamp((t - modeT - 0.25) / 0.45);
      const r = 70 + 120 * (1 - smooth(0, 1, lock));
      const blink = Math.floor(t * 6) % 2 === 0 || lock < 1;
      g.save();
      g.shadowColor = 'rgba(255,59,78,0.7)';
      g.shadowBlur = 12;
      g.strokeStyle = RED;
      g.fillStyle = RED;
      g.lineWidth = 4;
      g.textAlign = 'center';
      eyes().forEach((e, i) => {
        g.globalAlpha = 0.9;
        g.beginPath();
        g.arc(e[0], e[1], r, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
        for (const a of [0, 1, 2, 3]) {
          const d = [Math.cos((a * Math.PI) / 2), Math.sin((a * Math.PI) / 2)];
          line(g, [add(e, d, r - 26), add(e, d, r + 22)]);
          g.stroke();
        }
        dot(g, e[0], e[1], 5);
        if (spits.some((s) => s.kind === (i ? 'eyeR' : 'eyeL') && s.landed) || splats.some((k) => Math.hypot(k.c[0] - e[0], k.c[1] - e[1]) < 1)) {
          g.font = `800 ${Math.min(46, stage.W / 22)}px ${MONO}`;
          g.fillText('HIT', e[0], e[1] + r + 60);
        }
      });
      if (blink) {
        g.globalAlpha = clamp(lock * 2);
        g.font = `800 ${Math.min(42, stage.W / 24)}px ${MONO}`;
        g.fillText('TARGET: YOUR EYES', stage.W / 2, eyes()[0][1] - 130);
        g.globalAlpha = 1;
      }
      g.restore();
    }
    if (mode === 'covered' && wipeAt < 0) {
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.font = `800 ${Math.min(56, stage.W / 18)}px ${MONO}`;
      g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
      g.fillText('click to wipe', stage.W / 2, stage.H * 0.5);
      g.globalAlpha = 1;
    }
    // the wipers
    if (wipeAt > 0) {
      const a = (wiperAngle(t) * Math.PI) / 180;
      const d = [Math.cos(a), Math.sin(a)];
      for (const w of pivots()) {
        const tip = add(w.p, d, w.len);
        const b0 = add(w.p, d, w.len * 0.22);
        g.lineCap = 'round';
        g.strokeStyle = '#0b0b0d';
        g.lineWidth = 16;
        line(g, [w.p, tip]);
        g.stroke();
        g.strokeStyle = '#3a3c44';
        g.lineWidth = 5;
        g.stroke();
        g.strokeStyle = '#16171b';
        g.lineWidth = 26;
        line(g, [add(b0, [-d[1] * 10, d[0] * 10]), add(tip, [-d[1] * 10, d[0] * 10])]);
        g.stroke();
        g.beginPath();
        g.arc(w.p[0], w.p[1], 26, 0, Math.PI * 2);
        g.fillStyle = '#16171b';
        g.fill();
        g.strokeStyle = '#3a3c44';
        g.lineWidth = 4;
        g.stroke();
      }
    }
  }

  function drawCursor(g, t) {
    const k = arrowScale(stage);
    let at = [p.x, p.y];
    if (stuck) {
      // stuck in the goo: it slides down with the drip, then pulls free
      const u = (t - stuck.at) / 0.75;
      at = [stuck.p[0] + Math.sin(t * 50) * 2, stuck.p[1] + 40 * u];
    }
    g.save();
    g.translate(at[0], at[1]);
    g.scale(k, k);
    g.lineJoin = 'round';
    g.lineWidth = 2.2;
    g.fillStyle = '#000';
    g.strokeStyle = '#fff';
    g.fill(ARROW);
    g.stroke(ARROW);
    g.restore();
  }

  function draw(ctx, t) {
    const { fangs, mouth } = drawCobra(ctx.cobra, t);
    drawSpit(ctx.spit, t, fangs, mouth);
    drawCursor(ctx.cur, t);
    drawVenom(ctx.venom, t);
    drawHud(ctx.hud, t);
    stage.stats(`spits ${splats.length} · stuck ${hits}`);
  }

  return { step, draw };
}
