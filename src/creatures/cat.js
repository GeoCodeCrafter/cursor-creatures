// a skeleton cat, and your cursor is the laser dot. it trots after it, gets the zoomies
// if you go fast, and when you stop it crouches, wiggles... and pounces. move and it
// misses. don't, and it pins the cursor under its paws and falls asleep on it.

import { dot, line } from '../kit/stage.js';
import { approach, clamp, ease, followChain, ik2, lerp, unit } from '../kit/math.js';
import { add, nrm, steer, sub } from '../kit/body.js';

const BONE = '#fff0f8';
const BG = '#06070b';
const EYE = '#c8ff9a';

export const meta = {
  file: 'cat.js',
  hint: 'stop and it pounces · click to wake it up',
  layers: [{ name: 'body', glow: 'rgba(255,110,190,0.6)' }, { name: 'fx' }, { name: 'paws', glow: 'rgba(255,110,190,0.6)' }],
  vars: { accent: 'rgba(255,170,220,0.92)' },
  ripple: 'rgba(255,200,235,0.8)',
};

const K = 1.3;
const N = 30;
const SHOULDER = 5;
const HIP = 15;
const segLen = (i) => (i <= HIP + 1 ? 17 * K : (15 - (i - HIP) * 0.25) * K);
const UPPER = 38 * K;
const LOWER = 40 * K;
const REACH = 70 * K;
const STEP_AT = 40 * K;

export function create(stage) {
  const p = stage.pointer;
  const J = new Float32Array(N * 2);
  let x0 = stage.W * 0.3;
  for (let i = 0; i < N; i++) {
    J[i * 2] = x0;
    J[i * 2 + 1] = stage.H * 0.62;
    x0 -= segLen(i);
  }
  const legGeom = (li, crouch) => {
    const front = li < 2;
    const side = li % 2 === 0 ? -1 : 1;
    const a = front ? SHOULDER : HIP;
    const [fx, fy] = unit(J[(a - 1) * 2] - J[(a + 1) * 2], J[(a - 1) * 2 + 1] - J[(a + 1) * 2 + 1]);
    const hx = J[a * 2] - fy * side * 12 * K;
    const hy = J[a * 2 + 1] + fx * side * 12 * K;
    const ang = side * (front ? 0.6 : 2.5);
    const rx = fx * Math.cos(ang) - fy * Math.sin(ang);
    const ry = fx * Math.sin(ang) + fy * Math.cos(ang);
    const reach = REACH * lerp(1, 0.55, crouch);
    return { hx, hy, fx, fy, side, front, restX: hx + rx * reach, restY: hy + ry * reach };
  };
  const feet = new Float32Array(8);
  const from = new Float32Array(8);
  const to = new Float32Array(8);
  const stepT = new Float32Array(4);
  const stepLen = new Float32Array(4);
  const stepping = new Uint8Array(4);
  for (let li = 0; li < 4; li++) {
    const g = legGeom(li, 0);
    feet[li * 2] = g.restX;
    feet[li * 2 + 1] = g.restY;
  }

  // chase · zoom · stalk · pounce · skid · pin · loaf
  let mode = 'chase';
  let modeT = 0;
  let target = [0, 0];
  let stalkD = 0;
  let curl0 = 0;
  let fastFor = 0;
  let misses = 0;
  let crouch = 0;
  let saidAt = -10;
  const setMode = (m, t) => {
    mode = m;
    modeT = t;
  };
  const say = (s) => {
    stage.headline(s);
    saidAt = stage.t;
  };
  stage.headline('move your mouse');

  stage.on('click', (x, y) => {
    const t = stage.t;
    if (mode === 'loaf' || mode === 'pin') {
      // woken up: it springs off you and the chase is back on
      setMode('skid', t);
      say('it woke up.');
      stage.shake(8);
      return;
    }
    if (mode === 'chase' || mode === 'zoom') {
      // a click is a laser flick: it pounces at it
      target = [x, y];
      setMode('pounce', t);
    }
  });

  // the spine with the wiggle and the tail swish on top
  const wiggle = (t) => (mode === 'stalk' ? ease.inOut(clamp((t - modeT - 0.3) / 0.9)) : 0);
  const asleep = (t) => mode === 'loaf' && t - modeT > 1;
  const spine = (t) => {
    const P = Array.from({ length: N }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
    const w = wiggle(t);
    return P.map((q, i) => {
      const d = nrm(sub(P[Math.max(0, i - 1)], P[Math.min(N - 1, i + 1)]));
      const n = [-d[1], d[0]];
      let off = w * 14 * K * Math.sin(t * 17) * Math.exp(-Math.pow((i - HIP) / 3, 2));
      if (i > HIP) {
        const k = (i - HIP) / (N - HIP);
        off += (asleep(t) ? 0.3 : 1) * Math.sin(t * 2.6 - i * 0.45) * k * 26 * K;
        if (mode === 'stalk') off += Math.sin(t * 21) * Math.pow(k, 3) * 14 * K;
      }
      return add(q, n, off);
    });
  };

  function step(dt, t) {
    const c = [p.x, p.y];
    const head = [J[0], J[1]];
    const mid = [J[16], J[17]];
    const dc = Math.hypot(c[0] - head[0], c[1] - head[1]);
    fastFor = p.speed > 1400 ? fastFor + dt : Math.max(0, fastFor - dt * 2);
    let air = false;
    let want = 0;

    if (mode === 'chase' || mode === 'zoom') {
      if (mode === 'chase' && fastFor > 0.5) {
        setMode('zoom', t);
        say('zoomies.');
      }
      if (mode === 'zoom' && fastFor === 0 && t - modeT > 1) setMode('chase', t);
      const zoom = mode === 'zoom';
      steer(J, c, { rate: zoom ? 7.5 : 5, dt, off: (zoom ? 80 : 170) * K, maxTurn: zoom ? 1.2 : 1, turnSpeed: 150 * K });
      // you stopped: it's seen you
      if (p.still > 0.5 && p.real && dc < 700 * K) {
        setMode('stalk', t);
        stalkD = dc;
        say("don't move.");
      }
    } else if (mode === 'stalk') {
      const u = clamp((t - modeT) / 1.6);
      steer(J, c, { rate: 2.4, dt, off: Math.max(110 * K, stalkD * lerp(1, 0.78, ease.inOut(u))), maxTurn: 1, turnSpeed: 120 * K });
      want = clamp((t - modeT) / 0.35);
      if (p.still === 0 && dc > 250 * K) setMode('chase', t);
      else if (t - modeT > 1.6) {
        target = c;
        setMode('pounce', t);
      }
    } else if (mode === 'pounce') {
      const d = unit(target[0] - mid[0], target[1] - mid[1]);
      const goal = [target[0] + d[0] * 70 * K, target[1] + d[1] * 70 * K];
      J[0] = approach(J[0], goal[0], 26, dt);
      J[1] = approach(J[1], goal[1], 26, dt);
      air = true;
      if (t - modeT > 0.22) {
        if (Math.hypot(c[0] - target[0], c[1] - target[1]) < 60) {
          target = c;
          setMode('pin', t);
          say('caught.');
          stage.shake(10);
        } else {
          misses++;
          setMode('skid', t);
          say(misses > 2 ? 'missed again.' : 'missed.');
          stage.shake(6);
        }
        stage.bump();
      }
    } else if (mode === 'skid') {
      // skidding to a stop
      if (t - modeT > 0.4) setMode('chase', t);
    } else if (mode === 'pin') {
      want = 0.6;
      if (t - modeT > 0.8) {
        setMode('loaf', t);
        curl0 = Math.atan2(J[1] - target[1], J[0] - target[0]);
        say('purring.');
      }
    } else if (mode === 'loaf') {
      const u = ease.inOut(Math.min(1, (t - modeT) / 1.0));
      const a = curl0 + u * Math.PI * 1.25;
      const r = 118 * K;
      J[0] = approach(J[0], target[0] + Math.cos(a) * r, 7, dt);
      J[1] = approach(J[1], target[1] + Math.sin(a) * r, 7, dt);
      want = 1;
      if (t - modeT > 1.2) stage.headline('zzz');
    }
    crouch = approach(crouch, want, 10, dt);
    followChain(J, N, segLen, 0.2);

    for (let li = 0; li < 4; li++) {
      const g = legGeom(li, crouch);
      const pinning = mode === 'pin' || mode === 'loaf';
      if (air || pinning) {
        let tx;
        let ty;
        if (mode === 'pin' && g.front) {
          tx = li === 1 ? target[0] + 32 : target[0] - g.fy * g.side * 30 * K;
          ty = li === 1 ? target[1] + 64 : target[1] + g.fx * g.side * 30 * K;
        } else if (mode === 'loaf') {
          tx = g.hx + g.fx * (g.front ? 22 : -22) * K - g.fy * g.side * 10 * K;
          ty = g.hy + g.fy * (g.front ? 22 : -22) * K + g.fx * g.side * 10 * K;
        } else if (g.front) {
          tx = J[0] - g.fx * 8 * K - g.fy * g.side * 24 * K;
          ty = J[1] - g.fy * 8 * K + g.fx * g.side * 24 * K;
        } else {
          tx = g.hx - g.fx * 70 * K;
          ty = g.hy - g.fy * 70 * K;
        }
        feet[li * 2] = approach(feet[li * 2], tx, air ? 30 : 8, dt);
        feet[li * 2 + 1] = approach(feet[li * 2 + 1], ty, air ? 30 : 8, dt);
        stepping[li] = 0;
        continue;
      }
      if (stepping[li]) {
        const q = (t - stepT[li]) / stepLen[li];
        if (q >= 1) {
          stepping[li] = 0;
          feet[li * 2] = to[li * 2];
          feet[li * 2 + 1] = to[li * 2 + 1];
        } else {
          const e = ease.inOut(q);
          feet[li * 2] = lerp(from[li * 2], to[li * 2], e);
          feet[li * 2 + 1] = lerp(from[li * 2 + 1], to[li * 2 + 1], e);
        }
      } else {
        const other = li === 0 || li === 3 ? [1, 2] : [0, 3];
        const ex = g.restX - feet[li * 2];
        const ey = g.restY - feet[li * 2 + 1];
        const err = Math.hypot(ex, ey);
        const at = STEP_AT * (crouch > 0.5 ? 0.5 : 1);
        if ((err > at && !other.some((o) => stepping[o])) || err > at * 1.6) {
          stepping[li] = 1;
          stepT[li] = t;
          stepLen[li] = mode === 'zoom' ? 0.075 : 0.11;
          from[li * 2] = feet[li * 2];
          from[li * 2 + 1] = feet[li * 2 + 1];
          const lead = Math.min(0.6, (34 * K) / Math.max(1, err)) + 0.25;
          to[li * 2] = g.restX + ex * lead;
          to[li * 2 + 1] = g.restY + ey * lead;
        }
      }
    }

    // the cursor: pinned under its paws, then in the curl
    stage.cursor.hidden = mode === 'pin' || mode === 'loaf';
    if ((mode === 'chase' || mode === 'zoom') && saidAt > 0 && t - saidAt > 2.5) {
      stage.headline('move your mouse');
      saidAt = -10;
    }
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function legs(g, t, P, frontOnly) {
    for (let li = 0; li < 4; li++) {
      const front = li < 2;
      if (frontOnly && !front) continue;
      const side = li % 2 === 0 ? -1 : 1;
      const a = front ? SHOULDER : HIP;
      const dd = nrm(sub(P[a - 1], P[a + 1]));
      const hip = add(P[a], [-dd[1], dd[0]], side * 13 * K);
      const raw = [feet[li * 2], feet[li * 2 + 1]];
      const reach = Math.hypot(raw[0] - hip[0], raw[1] - hip[1]);
      const foot = reach > (UPPER + LOWER) * 0.97 ? add(hip, nrm(sub(raw, hip)), (UPPER + LOWER) * 0.97) : raw;
      const k = ik2(hip, foot, UPPER, LOWER, side * (front ? 1 : -1));
      const pd = nrm(sub(foot, k));
      g.lineWidth = 3.6;
      line(g, [hip, k, foot]);
      g.stroke();
      dot(g, k[0], k[1], 4.2);
      const lift = stepping[li] ? Math.sin(Math.PI * Math.min(1, (t - stepT[li]) / stepLen[li])) : 0;
      g.beginPath();
      g.arc(foot[0], foot[1], (5.5 + 1.5 * lift) * K, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.lineWidth = 2.6;
      g.stroke();
      g.fillStyle = BONE;
      for (const o of [-0.7, -0.23, 0.23, 0.7]) {
        const ang = Math.atan2(pd[1], pd[0]) + o;
        dot(g, foot[0] + Math.cos(ang) * 9 * K, foot[1] + Math.sin(ang) * 9 * K, 2.6 * K);
      }
    }
  }

  function drawCat(g, t) {
    g.strokeStyle = BONE;
    g.fillStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const P = spine(t);
    const d = nrm(sub(P[0], P[2]));
    const n = [-d[1], d[0]];
    const pt = (f, s) => add(add(P[0], d, f * K), n, s * K);
    legs(g, t, P, false);
    g.lineWidth = 3.6;
    line(g, P.slice(0, HIP + 2));
    g.stroke();
    g.lineWidth = 3;
    line(g, P.slice(HIP + 1));
    g.stroke();
    for (let i = HIP + 2; i < N; i++) dot(g, P[i][0], P[i][1], Math.max(1.6, 3.4 - (i - HIP) * 0.12));
    // ribs
    for (let i = 4; i <= 10; i++) {
      const dd = nrm(sub(P[i - 1], P[i + 1]));
      const nn = [-dd[1], dd[0]];
      const w = (12 + 24 * Math.sin((Math.PI * (i - 3.3)) / 7.6)) * K;
      g.lineWidth = 2.3;
      for (const s of [-1, 1]) {
        const end = add(add(P[i], nn, w * s), dd, -w * 0.45);
        const ctl = add(P[i], nn, w * 0.8 * s);
        g.beginPath();
        g.moveTo(P[i][0], P[i][1]);
        g.quadraticCurveTo(ctl[0], ctl[1], end[0], end[1]);
        g.stroke();
      }
      dot(g, P[i][0], P[i][1], 3.6);
    }
    for (let i = 11; i < HIP; i++) {
      const dd = nrm(sub(P[i - 1], P[i + 1]));
      const nn = [-dd[1], dd[0]];
      g.lineWidth = 2.3;
      line(g, [add(add(P[i], nn, 9 * K), dd, -3 * K), P[i], add(add(P[i], nn, -9 * K), dd, -3 * K)]);
      g.stroke();
      dot(g, P[i][0], P[i][1], 3.4);
    }
    // shoulder blades and hips
    for (const s of [-1, 1]) {
      for (const [at, off, rx, ry, tilt] of [
        [SHOULDER, 6, 15, 7, 0],
        [HIP, 0, 16, 8, s * 0.25],
      ]) {
        const dd = nrm(sub(P[at - 1], P[at + 1]));
        const c = add(add(P[at], [-dd[1], dd[0]], s * (at === HIP ? 14 : 15) * K), dd, off * K);
        g.beginPath();
        g.ellipse(c[0], c[1], rx * K, ry * K, Math.atan2(dd[1], dd[0]) + tilt, 0, Math.PI * 2);
        g.fillStyle = BG;
        g.fill();
        g.lineWidth = 2.4;
        g.stroke();
      }
    }
    g.fillStyle = BONE;
    // the skull
    for (const s of [-1, 1]) {
      line(g, [pt(-6, 24 * s), pt(-30, 40 * s), pt(-26, 12 * s)], true);
      g.fillStyle = BG;
      g.fill();
      g.lineWidth = 3.2;
      g.stroke();
    }
    line(g, [pt(34, 0), pt(28, 13), pt(12, 25), pt(-8, 26), pt(-24, 20), pt(-32, 8), pt(-34, 0), pt(-32, -8), pt(-24, -20), pt(-8, -26), pt(12, -25), pt(28, -13)], true);
    g.fillStyle = BG;
    g.fill();
    g.lineWidth = 3.4;
    g.stroke();
    const ang = Math.atan2(d[1], d[0]);
    for (const s of [-1, 1]) {
      const e = pt(8, 12 * s);
      if (asleep(t)) {
        const a = pt(2, 6 * s);
        const b = pt(2, 18 * s);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.quadraticCurveTo(e[0] + d[0] * 6, e[1] + d[1] * 6, b[0], b[1]);
        g.stroke();
      } else {
        const wide = mode === 'stalk' || mode === 'pounce' ? 1.25 : 1;
        g.fillStyle = EYE;
        g.beginPath();
        g.ellipse(e[0], e[1], 8 * K * wide, 5.5 * K * wide, ang, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = BG;
        g.beginPath();
        g.ellipse(e[0], e[1], 1.6 * K * wide, 4.6 * K * wide, ang + Math.PI / 2, 0, Math.PI * 2);
        g.fill();
      }
      g.lineWidth = 1.5;
      g.globalAlpha = 0.85;
      for (const [a, l] of [
        [0.25, 46],
        [0, 52],
        [-0.25, 44],
      ]) {
        const root = pt(26, 7 * s);
        const wa = Math.atan2(n[1] * s, n[0] * s) + a * s + Math.sin(t * 5 + a * 8) * 0.04;
        const tip = add(root, [Math.cos(wa) * 0.9 + d[0] * 0.45, Math.sin(wa) * 0.9 + d[1] * 0.45], l * K);
        line(g, [root, tip]);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.fillStyle = BONE;
    line(g, [pt(31, 0), pt(26, 4), pt(26, -4)], true);
    g.fill();
  }

  function drawFx(g, t) {
    if (mode === 'pin' || mode === 'loaf') {
      // the cursor, squashed under its paws (drawn here so the paws can go over it)
      const sq = mode === 'pin' && t - modeT < 0.3 ? 1 - 0.25 * Math.sin((Math.PI * (t - modeT)) / 0.3) : 1;
      stage.drawArrow(g, target[0], target[1], { scale: 1.1 * sq, angle: mode === 'pin' ? Math.sin(t * 34) * 0.08 : 0 });
    }
    if (!asleep(t)) return;
    g.fillStyle = 'rgba(255,240,248,0.85)';
    for (let k = 0; k < 3; k++) {
      const u = ((t - modeT - 1 + k * 0.55) % 1.65) / 1.65;
      g.globalAlpha = Math.sin(Math.PI * u);
      g.font = `italic 300 ${34 + k * 10}px Fraunces, Georgia, serif`;
      g.fillText('z', target[0] + 140 + u * 60, target[1] - 120 - u * 140);
    }
    g.globalAlpha = 1;
  }

  function draw(ctx, t) {
    drawCat(ctx.body, t);
    drawFx(ctx.fx, t);
    // over the pinned cursor, the front paws again
    if (mode === 'pin') {
      const g = ctx.paws;
      g.strokeStyle = BONE;
      g.fillStyle = BONE;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      legs(g, t, spine(t), true);
    }
    const state = mode === 'loaf' ? 'purring' : mode === 'pin' ? 'caught it' : mode === 'zoom' ? 'zoomies' : mode === 'stalk' ? 'stalking' : misses ? `missed ${misses}` : 'chasing';
    stage.stats(`lives 9 · ${state}`);
  }

  return { step, draw };
}
