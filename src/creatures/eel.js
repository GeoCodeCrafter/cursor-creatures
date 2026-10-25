// a skeleton electric eel. it swims after your cursor and zaps it if it touches it.
// its electric organ charges up cell by cell. click to make it fire a bolt at the page:
// it burns letters out of the headline and fries the readout. hold still when it's
// fully charged and it wraps round your cursor and takes the lights out.

import { dot, line } from '../kit/stage.js';
import { approach, clamp, followChain, hash, unit } from '../kit/math.js';
import { add, nrm, sub } from '../kit/body.js';

const BONE = '#ecfdff';
const BG = '#06070b';
const VOLT = '#8ff6ff';

export const meta = {
  file: 'eel.js',
  hint: 'click to fire a bolt · hold still when it is full',
  layers: [{ name: 'scorch' }, { name: 'dark' }, { name: 'body', glow: 'rgba(70,225,255,0.6)' }, { name: 'fx', glow: 'rgba(120,235,255,0.9)', blur: 10 }],
  vars: { accent: 'rgba(150,240,255,0.95)' },
  ripple: 'rgba(160,240,255,0.8)',
};

const N = 44;
const SEG = 21;
const width = (i) => {
  const u = i / N;
  return 32 * Math.min(1, u * 8) * (1 - Math.pow(u, 1.35)) + 4;
};

/** a jagged bolt from a to b (midpoint displacement) with a few forks: a list of polylines */
function lightning(a, b, seed, rough = 0.34, forks = 3) {
  let s = seed;
  const r = () => hash(s++, seed);
  let pts = [a, b];
  for (let level = 0; level < 5; level++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const off = (r() - 0.5) * len * rough;
      next.push([(p[0] + q[0]) / 2 - ((q[1] - p[1]) / len) * off, (p[1] + q[1]) / 2 + ((q[0] - p[0]) / len) * off], q);
    }
    pts = next;
  }
  const out = [pts];
  const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let f = 0; f < forks; f++) {
    const p = pts[Math.floor(pts.length * (0.2 + r() * 0.65))];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.65);
    const l = span * (0.14 + r() * 0.22);
    out.push(...lightning(p, [p[0] + Math.cos(ang) * l, p[1] + Math.sin(ang) * l], seed * 7 + f + 1, rough * 1.1, 0));
  }
  return out;
}

export function create(stage) {
  const p = stage.pointer;
  const J = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    J[i * 2] = -40 - i * SEG * 0.9;
    J[i * 2 + 1] = stage.H * 0.7 + Math.sin(i * 0.3) * 40;
  }
  let phase = 0;
  let volts = 20;
  let zaps = 0;
  let zapAt = -10;
  let mode = 'swim'; // swim · wrap · dark · reboot
  let modeT = 0;
  let wrapA = 0;
  let wrapC = [0, 0];
  let fried = false;
  let charred = -10;
  const bolts = []; // { at, from, to, dur, w }
  const scorches = []; // { at, p, seed }
  let saidAt = -10;
  const say = (s) => {
    stage.headline(s);
    saidAt = stage.t;
  };
  stage.headline('move your mouse');

  // knock letters out of the headline where a bolt lands on it
  function burnHeadline(at) {
    const el = stage.ghost;
    const r = el.getBoundingClientRect();
    const x = at[0] * stage.Z;
    const y = at[1] * stage.Z;
    const text = el.textContent;
    if (!text || y < r.top - 20 || y > r.bottom + 20) return false;
    const g = document.createElement('canvas').getContext('2d');
    g.font = getComputedStyle(el).font;
    const total = g.measureText(text).width;
    const left = r.left + (r.width - total) / 2;
    if (x < left - 20 || x > left + total + 20) return false;
    let acc = left;
    let hit = 0;
    for (let i = 0; i < text.length; i++) {
      const w = g.measureText(text[i]).width;
      if (x < acc + w) {
        hit = i;
        break;
      }
      acc += w;
      hit = i;
    }
    const chars = [...text];
    for (const k of [hit - 1, hit, hit + 1]) if (chars[k] && chars[k] !== ' ') chars[k] = ' ';
    el.textContent = chars.join('');
    return true;
  }
  const overReadout = (at) => {
    const r = document.querySelector('.readout')?.getBoundingClientRect();
    if (!r) return false;
    const x = at[0] * stage.Z;
    const y = at[1] * stage.Z;
    return x > r.left - 40 && x < r.right + 40 && y > r.top - 40 && y < r.bottom + 40;
  };

  stage.on('click', (x, y) => {
    const t = stage.t;
    if (mode !== 'swim') return;
    if (volts < 25) {
      say('not enough charge.');
      return;
    }
    const from = [J[0], J[1]];
    bolts.push({ at: t, from, to: [x, y], dur: 0.45, w: 0.6 + volts / 100 });
    scorches.push({ at: t, p: [x, y], seed: Math.floor(t * 100) });
    volts = Math.max(0, volts - 35);
    stage.shake(10 + volts / 10);
    stage.bump();
    if (burnHeadline([x, y])) say(stage.ghost.textContent);
    else if (overReadout([x, y])) {
      fried = true;
      say('fried.');
    } else if (Math.hypot(x - p.x, y - p.y) < 50) {
      zap(t);
    }
  });
  function zap(t) {
    zapAt = t;
    zaps++;
    stage.shake(14);
    say('ouch.');
    stage.bump();
  }

  function step(dt, t) {
    const c = [p.x, p.y];
    const head = [J[0], J[1]];
    let target = c;
    let off = 210;
    let rate = 4.5;
    let wig = 1;
    if (mode === 'swim') {
      // charge up over time
      volts = Math.min(100, volts + dt * 14);
      if (volts > 40 && saidAt < 0) say('charging…');
      // it bumps into the cursor every so often: zap
      if (t - zapAt > 2.2 && Math.hypot(head[0] - c[0], head[1] - c[1]) < 230) {
        off = 40;
        rate = 9;
        wig = 0.3;
      }
      if (t - zapAt > 2.2 && Math.hypot(head[0] - c[0], head[1] - c[1]) < 60) {
        zap(t);
        bolts.push({ at: t, from: head, to: c, dur: 0.3, w: 0.5 });
      }
      if (t - zapAt < 0.6) {
        target = head;
        off = 0;
        rate = 1;
      }
      // fully charged and you're holding still: it wraps round you
      if (volts >= 99 && p.still > 0.9 && p.real) {
        mode = 'wrap';
        modeT = t;
        wrapC = c;
        wrapA = Math.atan2(head[1] - c[1], head[0] - c[0]);
        say('oh no.');
      }
    }
    if (mode === 'wrap' || mode === 'dark') {
      const into = t - modeT;
      const tight = mode === 'wrap';
      wrapA += (tight ? Math.max(2.4, 9 - into * 6) : 0.6) * dt;
      const r = tight ? Math.max(105, 200 - into * 320) : 105;
      target = [wrapC[0] + Math.cos(wrapA) * r, wrapC[1] + Math.sin(wrapA) * r];
      off = 0;
      rate = tight ? 16 : 3;
      wig = 0;
      if (mode === 'wrap' && into > 0.9) {
        mode = 'dark';
        modeT = t;
        volts = 0;
        stage.shake(30);
        for (let k = 0; k < 6; k++) scorches.push({ at: t, p: [wrapC[0] + Math.cos(k) * 160, wrapC[1] + Math.sin(k * 1.7) * 140], seed: 99 + k + Math.floor(t) });
        charred = t;
        say('');
      }
    }
    if (mode === 'dark' && t - modeT > 2.2) {
      mode = 'swim';
      modeT = t;
      say('0 volts.');
    }
    if (mode === 'swim' && saidAt > 0 && t - saidAt > 3 && stage.ghost.textContent !== 'charging…') {
      stage.headline(volts > 40 ? 'charging…' : 'move your mouse');
      saidAt = -10;
    }

    // steer the head with a swimming wave on top
    const [dx, dy] = unit(J[0] - J[4], J[1] - J[5]);
    const speed = Math.hypot(target[0] - J[0], target[1] - J[1]);
    phase += (2.2 + Math.min(speed, 500) * 0.014) * dt;
    const w = Math.sin(phase * 2.2) * Math.min(52, 14 + speed * 0.12) * wig;
    const ex = target[0] - dy * w - J[0];
    const ey = target[1] + dx * w - J[1];
    const dist = Math.hypot(ex, ey);
    let turn = Math.atan2(ey, ex) - Math.atan2(dy, dx);
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const dir = Math.atan2(dy, dx) + clamp(turn, -1, 1);
    let v = Math.max(0, dist - off) * (1 - Math.exp(-rate * dt)) * Math.max(0, Math.cos(turn));
    if (Math.abs(turn) > 0.5 && dist > off + 30) v = Math.max(v, 170 * dt);
    J[0] += Math.cos(dir) * v;
    J[1] += Math.sin(dir) * v;
    followChain(J, N, SEG, 0.3);

    for (let i = bolts.length - 1; i >= 0; i--) if (t - bolts[i].at > bolts[i].dur) bolts.splice(i, 1);
    while (scorches.length > 14) scorches.shift();
    stage.cursor.hidden = mode === 'dark' && t - modeT < 1.6;
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawEel(g, t) {
    g.strokeStyle = BONE;
    g.fillStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const P = Array.from({ length: N }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
    const dirAt = (i) => nrm(sub(P[Math.max(0, i - 1)], P[Math.min(N - 1, i + 1)]));
    const charge = volts / 100;
    const drained = mode === 'swim' && t - modeT < 3 && volts < 30 ? 0.55 : 1;
    g.globalAlpha = drained;
    // the fin
    for (const s of [-1, 1]) {
      const edge = [];
      g.lineWidth = 1.2;
      g.globalAlpha = 0.6 * drained;
      g.beginPath();
      for (let i = 9; i < N - 1; i++) {
        const d = dirAt(i);
        const n = [-d[1] * s, d[0] * s];
        const len = width(i) * (0.95 + 0.3 * Math.sin(t * 13 - i * 0.75));
        const a = add(P[i], n, width(i) * 0.35);
        const b = add(add(P[i], n, len + width(i) * 0.35), d, -6);
        edge.push(b);
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
      }
      g.stroke();
      g.globalAlpha = 0.75 * drained;
      g.lineWidth = 1.6;
      line(g, edge);
      g.stroke();
    }
    g.globalAlpha = drained;
    g.lineWidth = 3.4;
    line(g, P);
    g.stroke();
    g.lineWidth = 2.2;
    for (let i = 3; i <= 13; i++) {
      const d = dirAt(i);
      const n = [-d[1], d[0]];
      const len = width(i) * 0.75;
      for (const s of [-1, 1]) {
        const end = add(add(P[i], n, len * s), d, -len * 0.5);
        const ctl = add(P[i], n, len * 0.8 * s);
        g.beginPath();
        g.moveTo(P[i][0], P[i][1]);
        g.quadraticCurveTo(ctl[0], ctl[1], end[0], end[1]);
        g.stroke();
      }
    }
    // the electric organ: cells lit from the head back as it charges
    const first = 7;
    const last = N - 5;
    for (let i = first; i <= last; i++) {
      const d = dirAt(i);
      const n = [-d[1], d[0]];
      const lit = (i - first) / (last - first) < charge;
      const fl = lit && charge > 0.6 ? 0.65 + 0.35 * hash(i, Math.floor(t * 20)) : 1;
      for (const s of [-1, 1]) {
        const c = add(P[i], n, width(i) * 0.42 * s);
        g.save();
        g.translate(c[0], c[1]);
        g.rotate(Math.atan2(d[1], d[0]));
        g.beginPath();
        g.roundRect(-7, -4, 14, 8, 3);
        g.fillStyle = lit ? VOLT : BG;
        g.globalAlpha = (lit ? fl : 1) * drained;
        g.fill();
        g.strokeStyle = lit ? '#ffffff' : BONE;
        g.globalAlpha = (lit ? 0.9 : 0.45) * drained;
        g.lineWidth = lit ? 1 : 1.2;
        g.stroke();
        g.restore();
      }
      g.globalAlpha = drained;
      g.fillStyle = BONE;
      g.strokeStyle = BONE;
      if (i % 2 === 0) dot(g, P[i][0], P[i][1], 3.4);
    }
    dot(g, P[N - 1][0], P[N - 1][1], 3.5);
    // the skull
    const h = P[0];
    const d = nrm(sub(P[0], P[3]));
    const n = [-d[1], d[0]];
    const KS = 1.3;
    const pt = (f, s) => add(add(h, d, f * KS), n, s * KS);
    g.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      const root = pt(-30, 16 * s);
      for (let k = 0; k < 4; k++) {
        const a = Math.atan2(n[1] * s, n[0] * s) - s * (0.5 + k * 0.32) + Math.sin(t * 16 + k) * 0.12 * s;
        line(g, [root, add(root, [Math.cos(a), Math.sin(a)], (22 - k * 3) * KS)]);
        g.stroke();
      }
    }
    line(g, [pt(42, 0), pt(38, 11), pt(26, 19), pt(6, 22), pt(-16, 21), pt(-30, 14), pt(-36, 0), pt(-30, -14), pt(-16, -21), pt(6, -22), pt(26, -19), pt(38, -11)], true);
    g.fillStyle = BG;
    g.fill();
    g.lineWidth = 3.4;
    g.stroke();
    for (const s of [-1, 1]) {
      const m0 = pt(41, 4 * s);
      const m1 = pt(12, 17 * s);
      g.lineWidth = 2;
      line(g, [m0, m1]);
      g.stroke();
      g.lineWidth = 1.5;
      for (let k = 1; k < 5; k++) {
        const a = add(m0, sub(m1, m0), k / 5);
        line(g, [a, add(a, n, -s * 4 * KS)]);
        g.stroke();
      }
      const e = pt(20, 10 * s);
      g.fillStyle = charge > 0.5 ? VOLT : BONE;
      dot(g, e[0], e[1], 4.8 * KS);
    }
    // sparks crawling along it, more the more it's charged
    g.strokeStyle = VOLT;
    g.lineWidth = 2.4;
    const sparks = Math.floor(charge * 11);
    for (let k = 0; k < sparks; k++) {
      const r = (j) => hash(k * 7 + j, Math.floor(t * 20));
      const i = 4 + Math.floor(r(0) * (N - 8));
      const dd = dirAt(i);
      const s = r(1) < 0.5 ? -1 : 1;
      const nn = [-dd[1] * s, dd[0] * s];
      const a = add(P[i], nn, width(i) * 0.6);
      const l = 16 + r(2) * 26;
      line(g, [a, add(add(a, nn, l * 0.5), dd, (r(3) - 0.5) * 18), add(add(a, nn, l), dd, (r(4) - 0.5) * 22)]);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawBolts(g, t) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const b of bolts) {
      const k = Math.floor((t - b.at) / 0.035);
      const o = (k % 3 === 2 ? 0.4 : 1) * (1 - Math.pow((t - b.at) / b.dur, 2));
      const paths = lightning(b.from, b.to, k + 1 + Math.floor(b.at * 10));
      g.globalAlpha = o;
      paths.forEach((pts, i) => {
        g.strokeStyle = VOLT;
        g.lineWidth = (i ? 3 : 7) * b.w;
        line(g, pts);
        g.stroke();
        g.strokeStyle = '#ffffff';
        g.lineWidth = (i ? 1.2 : 2.6) * b.w;
        line(g, pts);
        g.stroke();
      });
    }
    g.globalAlpha = 1;
    // wrapped round you: arcs jumping across the coils
    if (mode === 'wrap') {
      for (let k = 0; k < 4; k++) {
        const a = wrapA + k * 1.6;
        const from = [wrapC[0] + Math.cos(a) * 110, wrapC[1] + Math.sin(a) * 110];
        const paths = lightning(from, wrapC, Math.floor(t * 30) + k, 0.5, 1);
        g.strokeStyle = VOLT;
        g.lineWidth = 3;
        for (const pts of paths) {
          line(g, pts);
          g.stroke();
        }
      }
    }
    // the cursor, x-rayed by a zap; charred after the blackout
    const z = t - zapAt;
    if (z >= 0 && z < 0.35) {
      stage.drawArrow(g, p.x + (hash(Math.floor(t * 60)) - 0.5) * 10, p.y + (hash(Math.floor(t * 60), 3) - 0.5) * 10, { scale: 1.3, fill: VOLT, stroke: '#ffffff' });
    }
  }

  function drawScorch(g, t) {
    g.lineCap = 'round';
    for (const s of scorches) {
      const ember = Math.exp(-(t - s.at) / 0.45);
      const grad = g.createRadialGradient(s.p[0], s.p[1], 0, s.p[0], s.p[1], 90);
      grad.addColorStop(0, `rgba(255,140,60,${0.4 * ember})`);
      grad.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(s.p[0], s.p[1], 90, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(255,160,90,${0.22 + 0.6 * ember})`;
      g.lineWidth = 2.2;
      for (let k = 0; k < 9; k++) {
        const r = (j) => hash(k * 11 + j, s.seed);
        const a = (k / 9) * Math.PI * 2 + r(0) * 0.5;
        let q = s.p;
        const pts = [q];
        for (let m = 0; m < 4; m++) {
          const aa = a + (r(m + 1) - 0.5) * 0.9;
          q = add(q, [Math.cos(aa), Math.sin(aa)], 16 + r(m + 5) * 22);
          pts.push(q);
        }
        line(g, pts);
        g.stroke();
      }
    }
  }

  function drawDark(g, t) {
    if (mode !== 'dark') return;
    const u = t - modeT;
    // white, then dark; the lights stutter back on at the end
    if (u < 0.12) {
      g.fillStyle = `rgba(255,255,255,${1 - u / 0.12})`;
    } else {
      const flicker = u > 1.6 ? (Math.floor(u * 14) % 3 === 0 ? 0.2 : 0.9) * (1 - (u - 1.6) / 0.6) : 0.96;
      g.fillStyle = `rgba(0,0,0,${clamp(flicker)})`;
    }
    g.fillRect(-100, -100, stage.W + 200, stage.H + 200);
  }

  function draw(ctx, t) {
    drawScorch(ctx.scorch, t);
    drawDark(ctx.dark, t);
    drawEel(ctx.body, t);
    drawBolts(ctx.fx, t);
    if (t - charred < 6 && mode !== 'dark') stage.cursor.override = { x: p.x, y: p.y, scale: 1.1, fill: '#1a1410', stroke: 'rgba(255,170,90,0.9)' };
    else stage.cursor.override = null;
    const v = Math.round(volts);
    const garble = (s) => [...s].map((ch, i) => (ch === ' ' || hash(i, Math.floor(t * 8)) > 0.5 ? ch : '#%&*@!'[Math.floor(hash(i, t) * 6)])).join('');
    const text = `volts ${v} · zaps ${zaps}`;
    stage.stats(fried ? garble(text) : text);
  }

  return { step, draw };
}
