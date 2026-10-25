// a skeleton crocodile. the page is water: it lurks with only its eyes up and glides
// after your cursor. slow down near it and it surfaces and snaps. the first bite takes
// your cursor's tail. the second one grabs it and does the death roll, and the whole
// screen rolls with it. click to splash: it goes under, and comes up from below.

import { dot, line } from '../kit/stage.js';
import { approach, clamp, ease, followChain, ik2 } from '../kit/math.js';
import { add, ARROW, arrowScale, facingAt, gaitInit, gaitLift, gaitStep, mix, nrm, perp, smooth, steer, sub } from '../kit/body.js';

const BONE = '#f2ffd6';
const BG = '#06070b';
const EYE = '#e9ff5a';

export const meta = {
  file: 'croc.js',
  hint: 'keep moving · click to splash',
  layers: [{ name: 'water' }, { name: 'body', glow: 'rgba(185,235,70,0.55)' }, { name: 'eyes', glow: 'rgba(185,235,70,0.55)', blur: 8 }, { name: 'top' }],
  vars: { accent: 'rgba(215,250,120,0.92)' },
  ripple: 'rgba(220,255,160,0.8)',
};

const K = 1.3;
const N = 34; // 0 snout tip · 0–5 skull · 6–8 neck · 9–17 body (shoulders 10, hips 17) · 18–33 tail
const SHOULDER = 10;
const HIP = 17;
const segLen = (i) => (i < 5 ? 20 : i < 8 ? 11 : i < 18 ? 17 : 15 - (i - 18) * 0.12) * K;
const LEGS = [
  { at: SHOULDER, side: -1, angle: 1.0, hip: 16 * K, reach: 32 * K, group: 0 },
  { at: SHOULDER, side: 1, angle: 1.0, hip: 16 * K, reach: 32 * K, group: 1 },
  { at: HIP, side: -1, angle: 2.0, hip: 17 * K, reach: 36 * K, group: 1 },
  { at: HIP, side: 1, angle: 2.0, hip: 17 * K, reach: 36 * K, group: 0 },
];
const SKULL = [
  [0, 8],
  [5, 12],
  [22, 13],
  [44, 16],
  [64, 21],
  [80, 31],
  [94, 30],
  [100, 17],
];
const width = (i) => (i < 9 ? 0 : i <= HIP ? 30 * Math.sin((Math.PI * (i - 7.5)) / 11) + 8 : Math.max(4, 18 - (i - HIP) * 0.9)) * K;
const BITTEN = new Path2D('M0 0 L0 16 L2.5 13.5 L4.5 16.5 L6.5 13 L8.5 15.5 L10.5 12 L12.5 14 L14.5 11.5 Z');
const TAIL = new Path2D('M0 16 L2.5 13.5 L4.5 16.5 L6.5 13 L8.5 15.5 L10.5 12 L12.5 14 L14.5 11.5 L20.5 19.8 L11.5 19.8 L16 30 L11.5 32 L7 21.5 L0 28 Z');
const ROLL = 2.2;
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function create(stage) {
  const p = stage.pointer;
  const J = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    J[i * 2] = stage.W * 0.5 + Math.sin(i * 0.2) * 30;
    J[i * 2 + 1] = stage.H + 80 + i * segLen(i);
  }
  const gait = gaitInit(J, N, LEGS);

  // lurk (eyes up) · snap (surfaced, jaws open, lunging) · under (after a splash, coming up from below) · roll · gone
  let mode = 'lurk';
  let modeT = 0;
  let surf = 0.35;
  let snapAt = -10;
  let snapP = [0, 0];
  let coolUntil = 2.5;
  let ambush = false;
  let hasTail = true;
  let tailOff = null; // { at, p }
  let grab = [0, 0];
  let phase = 0;
  let saidAt = -10;
  const rings = []; // { at, p, kind: 'eye' | 'splash' | 'foam', big }
  let lastRing = 0;
  const set = (m, t) => {
    mode = m;
    modeT = t;
  };
  const say = (s) => {
    stage.headline(s);
    saidAt = stage.t;
  };
  stage.headline('move your mouse');
  stage.cursor.hidden = true;

  const splash = (t, q, big = 1) => rings.push({ at: t, p: q, kind: 'splash', big });
  const snout = () => {
    const d = nrm([J[0] - J[10], J[1] - J[11]]);
    return add([J[0], J[1]], d, 6 * K);
  };
  const startSnap = (t, delay, fromBelow = false) => {
    set('snap', t);
    ambush = fromBelow;
    snapAt = t + delay;
    snapP = [p.x, p.y];
  };

  stage.on('click', (x, y) => {
    const t = stage.t;
    if (mode === 'roll' || mode === 'gone' || mode === 'under') return;
    splash(t, [x, y], 1);
    set('under', t);
    say('where is it?');
  });

  function step(dt, t) {
    const c = [p.x, p.y];
    const d = Math.hypot(c[0] - J[0], c[1] - J[1]);
    phase += dt * 3.2;
    const sway = Math.sin(phase) * 26;
    const mt = t - modeT;

    if (mode === 'lurk') {
      surf = approach(surf, 0.35, 2.5, dt);
      steer(J, c, { rate: 2.4, dt, off: 200 * K, wig: sway });
      const slow = p.speed < 450 || p.still > 0.3;
      if (t > coolUntil && d < 320 * K && slow && p.real) startSnap(t, 0.45);
    } else if (mode === 'under') {
      surf = approach(surf, 0, 6, dt);
      steer(J, c, { rate: 2.6, dt, off: 240 * K, wig: sway * 0.5 });
      if (mt > 1.6) startSnap(t, 0.32, true);
    } else if (mode === 'snap') {
      surf = approach(surf, 1, 12, dt);
      // tracks the cursor until the last moment, then commits
      if (t < snapAt - 0.12) snapP = c;
      if (t >= snapAt - 0.28) steer(J, snapP, { rate: 16, dt, maxTurn: 0.5 });
      else steer(J, c, { rate: 1.2, dt, off: 220 * K });
      if (t >= snapAt) {
        const hit = Math.hypot(snout()[0] - c[0], snout()[1] - c[1]) < 95;
        splash(t, snout(), 0.7);
        stage.shake(10);
        stage.bump();
        coolUntil = t + 1.5;
        if (!hit) {
          say('missed.');
          set('lurk', t);
        } else if (hasTail && !ambush) {
          hasTail = false;
          tailOff = { at: t, p: c };
          coolUntil = t + 3;
          say('chomp.');
          set('lurk', t);
        } else {
          grab = snout();
          splash(t, grab, 2);
          stage.shake(26);
          say('death roll.');
          set('roll', t);
        }
      }
    } else if (mode === 'roll') {
      surf = 1;
      J[0] += (grab[0] - J[0]) * 0.3;
      J[1] += (grab[1] - J[1]) * 0.3;
      if (t - lastRing > 0.07) {
        lastRing = t;
        const i = Math.floor(Math.random() * 20);
        rings.push({ at: t, p: [J[i * 2] + (Math.random() - 0.5) * 60, J[i * 2 + 1] + (Math.random() - 0.5) * 60], kind: 'foam', big: 1 });
      }
      if (mt > ROLL + 0.2) {
        set('gone', t);
        say('gone.');
      }
    } else if (mode === 'gone') {
      surf = approach(surf, 0, 2.2, dt);
      if (mt > 2.2) {
        hasTail = true;
        coolUntil = t + 2.5;
        set('lurk', t);
        say('new cursor.');
      }
    }
    followChain(J, N, segLen, 0.16);
    gaitStep(gait, J, N, LEGS, t, { stepAt: 26 * K, stepTime: 0.15, reachScale: surf < 0.5 ? 0.6 : 1, dt });

    // the eyes leave rings as they glide
    if (surf > 0.1 && surf < 0.6 && t - lastRing > 0.5) {
      lastRing = t;
      rings.push({ at: t, p: mix([J[8], J[9]], [J[20], J[21]], 0.2), kind: 'eye', big: 1 });
    }
    while (rings.length && t - rings[0].at > 1.4) rings.shift();

    // the tail grows back eventually
    if (!hasTail && mode === 'lurk' && tailOff && t - tailOff.at > 12) {
      hasTail = true;
      say('it grew back.');
    }
    if (saidAt > 0 && t - saidAt > 2.6 && mode === 'lurk') {
      stage.headline('keep moving.');
      saidAt = -10;
    }

    // the whole screen rolls with it
    const phi = rollAt(t);
    document.body.style.transform = mode === 'roll' && !calm && phi > 0 ? `rotate(${phi}rad)` : '';
  }
  const rollAt = (t) => (mode === 'roll' ? Math.PI * 4 * ease.inOut(clamp((t - modeT - 0.1) / ROLL)) : 0);
  const jawAt = (t) => (mode === 'snap' && t >= snapAt - 0.3 && t < snapAt ? smooth(snapAt - 0.3, snapAt - 0.12, t) : 0);

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawWater(g, t) {
    g.lineCap = 'round';
    // slow swell lines, so it reads as water
    g.strokeStyle = 'rgba(200,240,120,0.05)';
    g.lineWidth = 2;
    for (let k = 0; k < 14; k++) {
      const y0 = ((k + 0.5) / 14) * stage.H;
      g.beginPath();
      for (let x = -40; x <= stage.W + 40; x += 40) {
        const y = y0 + Math.sin(x * 0.006 + t * 0.7 + k * 1.7) * 14 + Math.sin(x * 0.017 - t * 0.5 + k) * 5;
        if (x === -40) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    for (const r of rings) {
      const s = t - r.at;
      if (r.kind === 'eye') {
        const u = s / 1.4;
        g.strokeStyle = `rgba(200,240,120,${0.35 * (1 - u)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(r.p[0], r.p[1], 30 + 120 * u, 22 + 90 * u, 0, 0, Math.PI * 2);
        g.stroke();
      } else if (r.kind === 'foam') {
        const u = s / 0.6;
        if (u > 1) continue;
        g.strokeStyle = `rgba(230,255,190,${0.5 * (1 - u)})`;
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(r.p[0], r.p[1], 14 + 70 * u, 0, Math.PI * 2);
        g.stroke();
      } else {
        if (s > 1.3) continue;
        for (let k = 0; k < 3; k++) {
          const v = clamp((s - k * 0.12) / 1.0);
          if (v <= 0 || v >= 1) continue;
          g.strokeStyle = `rgba(220,255,160,${0.45 * (1 - v)})`;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(r.p[0], r.p[1], (40 + 220 * v) * r.big, 0, Math.PI * 2);
          g.stroke();
        }
        if (s < 0.8) {
          let seed = Math.floor(r.at * 1000);
          const rnd = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          g.fillStyle = 'rgba(230,255,190,0.85)';
          for (let k = 0; k < 16 * r.big; k++) {
            const a = rnd() * Math.PI * 2;
            const sp = (300 + rnd() * 600) * r.big;
            const q = add(r.p, [Math.cos(a), Math.sin(a)], sp * s * (1 - s * 0.35));
            dot(g, q[0], q[1], (3 + rnd() * 5) * (1 - s));
          }
        }
      }
    }
    // bubbles while it's under
    if (mode === 'under' || (mode === 'gone' && surf < 0.3)) {
      g.fillStyle = 'rgba(220,255,170,0.5)';
      for (let k = 0; k < 6; k++) {
        const s = (t * 1.3 + k / 6) % 1;
        const at = [J[(4 + k * 3) * 2], J[(4 + k * 3) * 2 + 1]];
        g.globalAlpha = 1 - s;
        g.beginPath();
        g.arc(at[0] + Math.sin(k * 3 + t * 4) * 8, at[1] - s * 30, 2 + 4 * s, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(220,255,170,0.7)';
        g.lineWidth = 1.5;
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }

  function drawCroc(g, eyes, t) {
    const P = Array.from({ length: N }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
    const F = (i) => facingAt(J, i, N);
    const body = smooth(0.3, 0.95, surf);
    g.canvas.style.opacity = (0.16 + 0.84 * body) * smooth(0.02, 0.25, surf);
    eyes.canvas.style.opacity = surf > 0.05 ? smooth(0, 0.3, surf) : 0;
    const phi = rollAt(t);
    const cf = Math.cos(phi);
    const flip = (i, v) => {
      const f = F(i);
      const n = perp(f);
      const dd = sub(v, P[i]);
      const along = dd[0] * f[0] + dd[1] * f[1];
      const side = dd[0] * n[0] + dd[1] * n[1];
      return add(add(P[i], f, along), n, side * cf);
    };
    for (const c of [g, eyes]) {
      c.strokeStyle = BONE;
      c.lineCap = 'round';
      c.lineJoin = 'round';
    }
    const stroke = (pts, w, close = false) => {
      line(g, pts, close);
      g.lineWidth = w;
      g.stroke();
    };

    LEGS.forEach((leg, li) => {
      const f = F(leg.at);
      const hip = flip(leg.at, add(P[leg.at], perp(f), leg.hip * leg.side));
      const raw = flip(leg.at, [gait.feet[li * 2], gait.feet[li * 2 + 1]]);
      const foot = Math.hypot(raw[0] - hip[0], raw[1] - hip[1]) > 42 * K ? add(hip, nrm(sub(raw, hip)), 42 * K) : raw;
      const knee = ik2(hip, foot, 22 * K, 22 * K, leg.side * (leg.at === SHOULDER ? -1 : 1) * (cf < 0 ? -1 : 1));
      stroke([hip, knee, foot], 4);
      g.fillStyle = BONE;
      dot(g, knee[0], knee[1], 4.5);
      const fd = nrm(sub(foot, knee));
      const lift = 1 + 0.3 * gaitLift(gait, t, li);
      for (let k = -2; k <= 2; k++) {
        const a = k * 0.35;
        stroke([foot, add(foot, [fd[0] * Math.cos(a) - fd[1] * Math.sin(a), fd[0] * Math.sin(a) + fd[1] * Math.cos(a)], 11 * K * lift)], 2.2);
      }
    });
    stroke(P.slice(5), 3.6);
    for (let i = 10; i <= HIP - 1; i++) {
      const f = F(i);
      const n = perp(f);
      const w = width(i);
      for (const s of [-1, 1]) {
        const end = flip(i, add(add(P[i], n, w * s), f, -w * 0.4));
        const ctl = flip(i, add(P[i], n, w * 0.8 * s));
        g.beginPath();
        g.moveTo(P[i][0], P[i][1]);
        g.quadraticCurveTo(ctl[0], ctl[1], end[0], end[1]);
        g.lineWidth = 2.4;
        g.stroke();
      }
    }
    const plate = (c, f, w, h, r, fill) => {
      g.save();
      g.translate(c[0], c[1]);
      g.rotate(Math.atan2(f[1], f[0]));
      g.beginPath();
      g.roundRect(-w / 2, -h / 2, w, h, r);
      if (fill) {
        g.fillStyle = BG;
        g.fill();
      }
      g.stroke();
      g.restore();
    };
    if (cf > 0) {
      g.globalAlpha = cf;
      g.lineWidth = 1.8;
      for (let i = 9; i < N - 1; i++) {
        const f = F(i);
        const n = perp(f);
        const rows = i <= HIP ? [-11, -4, 4, 11] : i < 24 ? [-6, 6] : [0];
        const sz = (i <= HIP ? 4.5 : 4) * K;
        for (const o of rows) plate(flip(i, add(P[i], n, o * K * (i <= HIP ? 1 : 1 - (i - HIP) * 0.03))), f, sz * 2, sz * 1.6, sz * 0.5, true);
      }
    } else {
      g.globalAlpha = -cf;
      g.lineWidth = 1.4;
      for (let i = 9; i <= HIP + 4; i++) {
        const f = F(i);
        const n = perp(f);
        for (let o = -2; o <= 2; o++) plate(flip(i, add(P[i], n, o * 7 * K)), f, 12 * K, 6.6 * K, 1.5, false);
      }
    }
    g.globalAlpha = 1;

    // the skull: long, low, toothy. opening up, the head lifts out of the water: bigger
    const d = nrm(sub(P[0], P[5]));
    const n = perp(d);
    const jaw = jawAt(t);
    const lift = 1 + 0.28 * jaw;
    const h = add(P[0], d, 14 * K * jaw);
    const pt = (fb, s) => flip(0, add(add(h, d, -fb * K * lift), n, s * K * lift));
    const outline = (fs) => [...fs.map(([fb, s]) => pt(fb, s)), ...[...fs].reverse().map(([fb, s]) => pt(fb, -s))];
    if (jaw > 0.02) {
      g.globalAlpha = jaw;
      line(g, outline(SKULL.map(([fb, s]) => [fb, s + 9 * jaw])), true);
      g.fillStyle = '#4a0d07';
      g.fill();
      g.strokeStyle = '#ff8a6a';
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = BONE;
      g.globalAlpha = 1;
    }
    line(g, outline(SKULL), true);
    g.fillStyle = BG;
    g.fill();
    g.lineWidth = 3.2;
    g.stroke();
    for (let k = 0; k < 11; k++)
      for (const s of [-1, 1]) stroke([pt(6 + k * 6.5, s * (12 + k * 0.75)), pt(7 + k * 6.5, s * (16 + k * 0.75 + 9 * jaw))], 1.8 + jaw);
    g.globalAlpha = 0.7;
    stroke([pt(4, 0), pt(74, 0)], 1.4);
    g.globalAlpha = 1;
    // the instant the jaws slam shut: a flash of teeth
    const u = (t - snapAt) / 0.18;
    if (u >= 0 && u <= 1) {
      g.strokeStyle = '#fff';
      g.globalAlpha = 1 - u;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const p0 = add(pt(-4, 0), [Math.cos(a), Math.sin(a)], 30 + 90 * u);
        stroke([p0, add(p0, [Math.cos(a), Math.sin(a)], 26 * (1 - u))], 4);
      }
      g.globalAlpha = 1;
      g.strokeStyle = BONE;
    }

    // nostrils and eyes: the bit that stays above the water
    const e0 = pt(4, 0);
    eyes.beginPath();
    eyes.arc(e0[0], e0[1], 5 * K, 0, Math.PI * 2);
    eyes.fillStyle = BG;
    eyes.fill();
    eyes.lineWidth = 2.2;
    eyes.stroke();
    eyes.fillStyle = BONE;
    for (const s of [-1.8, 1.8]) {
      const q = pt(4, s);
      dot(eyes, q[0], q[1], 1.3 * K);
    }
    if (cf > 0.2) {
      const blink = (t % 5.3) < 0.14;
      for (const s of [-1, 1]) {
        const e = pt(80, s * 16);
        eyes.beginPath();
        eyes.arc(e[0], e[1], 8 * K, 0, Math.PI * 2);
        eyes.fillStyle = BG;
        eyes.fill();
        eyes.lineWidth = 2.6;
        eyes.stroke();
        if (blink) {
          eyes.strokeStyle = EYE;
          eyes.lineWidth = 3;
          line(eyes, [add(e, n, -6 * K), add(e, n, 6 * K)]);
          eyes.stroke();
          eyes.strokeStyle = BONE;
          continue;
        }
        const a = Math.atan2(d[1], d[0]);
        eyes.beginPath();
        eyes.ellipse(e[0], e[1], 6 * K, 5 * K, a, 0, Math.PI * 2);
        eyes.fillStyle = EYE;
        eyes.fill();
        eyes.beginPath();
        eyes.ellipse(e[0], e[1], 4.5 * K, 1.2 * K, a, 0, Math.PI * 2);
        eyes.fillStyle = '#1b1d02';
        eyes.fill();
      }
    }
  }

  // the cursor: whole, then minus its tail, then in the jaws (turning over with them)
  function drawCursor(g, t) {
    const k = arrowScale(stage);
    const arrow = (x, y, angle, sx, sy, shape, alpha = 1) => {
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y);
      g.rotate(angle);
      g.scale(k * sx, k * sy);
      g.lineJoin = 'round';
      g.lineWidth = 2.2;
      g.fillStyle = '#000';
      g.strokeStyle = '#fff';
      g.fill(shape);
      g.stroke(shape);
      g.restore();
    };
    const shape = hasTail ? ARROW : BITTEN;
    if (mode === 'roll' || mode === 'gone') {
      const d = nrm([J[0] - J[10], J[1] - J[11]]);
      const tip = add([J[0], J[1]], d, 6 * K);
      const sink = mode === 'gone' ? clamp((t - modeT) / 0.9) : 0;
      if (sink < 1) {
        g.save();
        g.translate(tip[0], tip[1]);
        g.rotate(Math.atan2(d[1], d[0]) + Math.PI / 2);
        arrow(-8 * k, -10 * k * Math.cos(rollAt(t)), 0, 1, Math.cos(rollAt(t)), shape, 1 - sink);
        g.restore();
      }
    } else arrow(p.x, p.y, 0, 1, 1, shape);
    // the bitten-off tail, sinking
    if (tailOff && t - tailOff.at < 1.4) {
      const u = (t - tailOff.at) / 1.4;
      arrow(tailOff.p[0], tailOff.p[1] + u * 40, u * 0.9, 1 - 0.45 * u, 1 - 0.45 * u, TAIL, 1 - u);
    }
  }

  function draw(ctx, t) {
    drawWater(ctx.water, t);
    drawCroc(ctx.body, ctx.eyes, t);
    drawCursor(ctx.top, t);
    const status = mode === 'roll' ? 'death roll' : mode === 'gone' ? 'gone' : mode === 'under' ? 'under' : mode === 'snap' ? 'snapping' : hasTail ? 'lurking' : 'got a bit';
    stage.stats(`bite 3,700 psi · ${status}`);
  }

  return { step, draw };
}
