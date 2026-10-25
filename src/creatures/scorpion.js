// a skeleton scorpion. it squares up to your cursor and snaps a pincer at it when you
// get close. click and it swings its tail over and stings. hold still and it grabs the
// cursor, holds it up and stings it properly: your cursor stops responding for a bit.

import { dot, line } from '../kit/stage.js';
import { approach, clamp, ease, followChain, ik2, lerp, unit } from '../kit/math.js';
import { add, mix, nrm, sub } from '../kit/body.js';

const BONE = '#fff3e3';
const BG = '#06070b';
const VENOM = '#b8ff5a';

export const meta = {
  file: 'scorpion.js',
  hint: 'click and it stings · hold still and it grabs you',
  layers: [{ name: 'body', glow: 'rgba(255,160,50,0.6)' }, { name: 'fx' }],
  vars: { accent: 'rgba(255,200,120,0.92)' },
  ripple: 'rgba(255,220,170,0.8)',
};

const K = 1.3;
const NB = 9;
const SEG = 22 * K;
const HIPS = [1, 2, 3, 4];
const UPPER = 66 * K;
const LOWER = 74 * K;
const SPLAY = [0.95, 1.35, 1.8, 2.25];
const REACH = 118 * K;
const STEP_AT = 50 * K;
const STEP_TIME = 0.075;
const LEGS = 8;
const STANDOFF = 118 * K;
const NT = 8;
const TSEG = 32 * K;

export function create(stage) {
  const p = stage.pointer;
  const J = new Float32Array(NB * 2);
  for (let i = 0; i < NB; i++) {
    J[i * 2] = stage.W * 0.3 - i * SEG;
    J[i * 2 + 1] = stage.H * 0.6;
  }
  const legGeom = (li) => {
    const pair = li >> 1;
    const a = HIPS[pair];
    const side = li % 2 === 0 ? -1 : 1;
    const [fx, fy] = unit(J[(a - 1) * 2] - J[(a + 1) * 2], J[(a - 1) * 2 + 1] - J[(a + 1) * 2 + 1]);
    const ang = side * SPLAY[pair];
    const rx = fx * Math.cos(ang) - fy * Math.sin(ang);
    const ry = fx * Math.sin(ang) + fy * Math.cos(ang);
    const hx = J[a * 2] - fy * side * 10 * K;
    const hy = J[a * 2 + 1] + fx * side * 10 * K;
    return { hx, hy, fx, fy, restX: hx + rx * REACH, restY: hy + ry * REACH };
  };
  const feet = new Float32Array(LEGS * 2);
  const from = new Float32Array(LEGS * 2);
  const to = new Float32Array(LEGS * 2);
  const stepT = new Float32Array(LEGS);
  const stepping = new Uint8Array(LEGS);
  for (let li = 0; li < LEGS; li++) {
    const g = legGeom(li);
    feet[li * 2] = g.restX;
    feet[li * 2 + 1] = g.restY;
  }

  // what it's doing: hunt · grab (claw closing) · hold (cursor up in the claw, sting coming) · frozen (cursor not responding) · back to hunt
  let mode = 'hunt';
  let modeT = -10;
  let snapAt = -10;
  let snapTo = [0, 0];
  let stingAt = -10;
  let stingTo = [0, 0];
  let stingHit = false;
  let grabbed = [0, 0];
  let dropAt = [0, 0];
  let freeAt = -10;
  let stings = 0;
  let hits = 0;
  const splashes = [];
  const setMode = (m, t) => {
    mode = m;
    modeT = t;
  };
  let saidAt = -10;
  const say = (text) => {
    stage.headline(text);
    saidAt = stage.t;
  };
  stage.headline('move your mouse');

  const cur = () => [p.x, p.y];

  // ── poses: the pincers and the tail, worked out from the body and the events ──
  const frame = () => {
    const h = [J[0], J[1]];
    const d = nrm(sub([J[0], J[1]], [J[4], J[5]]));
    return { h, d, n: [-d[1], d[0]] };
  };
  function clawAt(t, side) {
    const { h, d, n } = frame();
    const idle = add(add(h, d, 92 * K + 6 * Math.sin(t * 3 + side)), n, side * 72 * K);
    let tip = idle;
    let open = 0.38 + 0.08 * Math.sin(t * 5 + side * 2);
    if (side > 0) {
      const u = t - snapAt;
      if (u > -0.14 && u < 0.3) {
        const out = u < 0 ? ease.out(clamp((u + 0.14) / 0.14)) : 1 - ease.inOut(clamp((u - 0.05) / 0.25));
        tip = mix(idle, snapTo, out);
        open = u < -0.03 ? 0.6 : 0.02;
      }
    }
    if (side < 0 && (mode === 'grab' || mode === 'hold')) {
      const lift = add(add(grabbed, d, -60 * K), n, 20 * K);
      if (mode === 'grab') {
        tip = mix(idle, grabbed, ease.out(clamp((t - modeT) / 0.16)));
        open = 0.65;
      } else {
        tip = mix(grabbed, lift, ease.inOut(clamp((t - modeT) / 0.5)));
        tip = add(tip, [Math.sin(t * 31) * 2, Math.cos(t * 27) * 2]);
        open = 0.05;
      }
    }
    return { tip, open };
  }
  function tailAt(t) {
    const base = [J[(NB - 1) * 2], J[(NB - 1) * 2 + 1]];
    const back = nrm(sub(base, [J[(NB - 3) * 2], J[(NB - 3) * 2 + 1]]));
    const a0 = Math.atan2(back[1], back[0]);
    let curl = 0.36 + 0.02 * Math.sin(t * 2.2);
    let reach = 0;
    const u = t - stingAt;
    const wind = 0.35;
    if (u > -wind && u < 0.55) {
      if (u < -0.08) curl += 0.1 * ease.inOut(clamp((u + wind) / (wind - 0.08)));
      else reach = u < 0.02 ? ease.out(clamp((u + 0.08) / 0.1)) : 1 - ease.inOut(clamp((u - 0.2) / 0.35));
    }
    const rest = [base];
    for (let k = 1; k <= NT; k++) {
      const a = a0 + curl * k;
      rest.push(add(rest[k - 1], [Math.cos(a), Math.sin(a)], TSEG));
    }
    if (reach <= 0) return rest;
    const span = Math.hypot(stingTo[0] - base[0], stingTo[1] - base[1]);
    const aim = span > NT * TSEG * 0.9 ? add(base, nrm(sub(stingTo, base)), NT * TSEG * 0.9) : stingTo;
    const hit = rest.map((q) => [...q]);
    for (let it = 0; it < 12; it++) {
      hit[NT] = [...aim];
      for (let i = NT - 1; i >= 0; i--) hit[i] = add(hit[i + 1], nrm(sub(hit[i], hit[i + 1])), TSEG);
      hit[0] = [...base];
      for (let i = 1; i <= NT; i++) hit[i] = add(hit[i - 1], nrm(sub(hit[i], hit[i - 1])), TSEG);
    }
    return rest.map((q, i) => mix(q, hit[i], reach));
  }
  const stingTip = (T) => {
    const a = nrm(sub(T[NT], T[NT - 1]));
    const na = [-a[1], a[0]];
    const bulb = add(T[NT], a, 12 * K);
    return add(add(bulb, a, 26 * K), na, -12 * K);
  };

  // click: it stings at wherever you clicked
  stage.on('click', (x, y) => {
    const t = stage.t;
    if (mode !== 'hunt' || t - stingAt < 0.7) return;
    stingAt = t + 0.35; // wind up first
    stingTo = [x, y];
    stingHit = false;
    stings++;
    say('dodge.');
  });

  function step(dt, t) {
    const c = cur();
    // body: stand off from the cursor (or the cursor in its claw, or back off from the frozen one)
    let target = c;
    let rate = 3.2;
    if (mode === 'grab' || mode === 'hold') {
      target = grabbed;
      rate = 2;
    }
    let goal;
    const mid = [J[8], J[9]];
    if (mode === 'frozen') {
      const d = unit(mid[0] - dropAt[0], mid[1] - dropAt[1]);
      goal = [dropAt[0] + d[0] * 300 * K, dropAt[1] + d[1] * 300 * K];
      rate = 2.2;
    } else {
      const d = unit(mid[0] - target[0], mid[1] - target[1]);
      const lunge = Math.abs(t - stingAt) < 0.12;
      const off = lunge ? STANDOFF * 0.55 : STANDOFF;
      goal = [target[0] + d[0] * off, target[1] + d[1] * off];
    }
    J[0] = approach(J[0], goal[0], rate, dt);
    J[1] = approach(J[1], goal[1], rate, dt);
    followChain(J, NB, SEG, 0.07);
    for (let li = 0; li < LEGS; li++) {
      const g = legGeom(li);
      if (stepping[li]) {
        const q = (t - stepT[li]) / STEP_TIME;
        if (q >= 1) {
          stepping[li] = 0;
          feet[li * 2] = to[li * 2];
          feet[li * 2 + 1] = to[li * 2 + 1];
        } else {
          const e = ease.inOut(q);
          feet[li * 2] = lerp(from[li * 2], to[li * 2], e);
          feet[li * 2 + 1] = lerp(from[li * 2 + 1], to[li * 2 + 1], e);
        }
      } else if (!stepping[li ^ 1] && Math.hypot(feet[li * 2] - g.restX, feet[li * 2 + 1] - g.restY) > STEP_AT) {
        stepping[li] = 1;
        stepT[li] = t;
        from[li * 2] = feet[li * 2];
        from[li * 2 + 1] = feet[li * 2 + 1];
        to[li * 2] = g.restX + g.fx * 26 * K;
        to[li * 2 + 1] = g.restY + g.fy * 26 * K;
      }
    }

    const head = [J[0], J[1]];
    const near = Math.hypot(c[0] - head[0], c[1] - head[1]) < 260 * K;
    if (mode === 'hunt') {
      // snap the right pincer at a cursor that's close
      if (near && t - snapAt > 1.1 && t - stingAt > 0.6) {
        snapAt = t + 0.14;
        snapTo = c;
      }
      // the sting lands: if you're still where it aimed, it got you
      if (!stingHit && t >= stingAt && t < stingAt + 0.05) {
        stingHit = true;
        const T = tailAt(t);
        const tip = stingTip(T);
        if (Math.hypot(tip[0] - c[0], tip[1] - c[1]) < 70) {
          hits++;
          stage.shake(12);
          say('ow.');
        } else say('missed.');
        stage.bump();
        splashes.push({ at: t, p: tip, venom: false });
      }
      // hold still near it and it grabs you
      if (near && p.still > 1.1 && p.real && t - stingAt > 1 && t - freeAt > 2.5) {
        grabbed = c;
        setMode('grab', t);
        say('caught.');
        stage.bump();
      }
    }
    if (mode === 'grab' && t - modeT > 0.16) setMode('hold', t);
    if (mode === 'hold') {
      // the big sting, into the cursor in its claw
      if (t - modeT > 0.5 && stingAt < modeT) {
        stingAt = t + 0.4;
        stingHit = true;
      }
      stingTo = clawAt(t, -1).tip;
      if (stingAt > modeT && t > stingAt + 0.02 && !splashes.some((s) => s.at === stingAt)) {
        splashes.push({ at: stingAt, p: stingTo, venom: true });
        stage.shake(16);
      }
      if (stingAt > modeT && t > stingAt + 0.5) {
        dropAt = clawAt(t, -1).tip;
        setMode('frozen', t);
        say('not responding');
        stage.bump();
      }
    }
    if (mode === 'frozen' && t - modeT > 3) {
      setMode('hunt', t);
      freeAt = t;
      say('run.');
      snapAt = t + 0.6;
      snapTo = c;
    }
    if (mode === 'hunt' && saidAt > 0 && t - saidAt > 2.6) {
      stage.headline('move your mouse');
      saidAt = -10;
    }

    // the cursor: in the claw, then a busy wheel, then yours again
    if (mode === 'grab' || mode === 'hold') {
      const tip = clawAt(t, -1).tip;
      stage.cursor.override = { x: tip[0] - 8, y: tip[1] - 12, scale: 1.1, angle: -0.25 + Math.sin(t * 30) * 0.1 };
      stage.cursor.hidden = false;
    } else if (mode === 'frozen') {
      stage.cursor.hidden = true;
      stage.cursor.override = null;
    } else {
      stage.cursor.hidden = false;
      stage.cursor.override = null;
    }
    for (let i = splashes.length - 1; i >= 0; i--) if (t - splashes[i].at > 0.8) splashes.splice(i, 1);
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawScorpion(g, t) {
    g.strokeStyle = BONE;
    g.fillStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const P = Array.from({ length: NB }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
    const { d, n } = frame();
    // legs
    for (let li = 0; li < LEGS; li++) {
      const pair = li >> 1;
      const a = HIPS[pair];
      const side = li % 2 === 0 ? -1 : 1;
      const fd = nrm(sub(P[Math.max(0, a - 1)], P[a + 1]));
      const hip = add(P[a], [-fd[1], fd[0]], side * 10 * K);
      const foot = [feet[li * 2], feet[li * 2 + 1]];
      const k = ik2(hip, foot, UPPER, LOWER, side);
      const dir = nrm(sub(foot, k));
      const cl = add(foot, [dir[0] * Math.cos(0.5 * side) - dir[1] * Math.sin(0.5 * side), dir[0] * Math.sin(0.5 * side) + dir[1] * Math.cos(0.5 * side)], 16 * K);
      g.lineWidth = 3;
      line(g, [hip, k, foot, cl]);
      g.stroke();
      dot(g, k[0], k[1], 4);
      const lift = stepping[li] ? Math.sin(Math.PI * Math.min(1, (t - stepT[li]) / STEP_TIME)) : 0;
      dot(g, foot[0], foot[1], 2.5 + 2.5 * lift);
    }
    // the body: a carapace and seven plates
    const width = (i) => (i <= 2 ? 30 + i * 6 : 44 - (i - 3) * 2.6) * K;
    const edge = (s) =>
      P.map((q, i) => {
        const dd = nrm(sub(P[Math.max(0, i - 1)], P[Math.min(NB - 1, i + 1)]));
        return add(q, [-dd[1] * s, dd[0] * s], width(i));
      });
    const L = edge(-1);
    const R = edge(1);
    const nose = add(P[0], d, 18 * K);
    line(g, [nose, ...R, ...[...L].reverse()], true);
    g.fillStyle = BG;
    g.fill();
    g.lineWidth = 3.2;
    g.stroke();
    g.fillStyle = BONE;
    for (let i = 2; i < NB; i++) {
      const ctl = add(P[i], d, -10 * K);
      g.lineWidth = i === 2 ? 3 : 2.2;
      g.beginPath();
      g.moveTo(L[i][0], L[i][1]);
      g.quadraticCurveTo(ctl[0], ctl[1], R[i][0], R[i][1]);
      g.stroke();
    }
    g.globalAlpha = 0.7;
    g.lineWidth = 1.6;
    line(g, P);
    g.stroke();
    g.globalAlpha = 1;
    for (let i = 3; i < NB; i++) dot(g, P[i][0], P[i][1], 2.6);
    for (const s of [-1, 1]) {
      const e = add(add(P[0], d, -2 * K), n, s * 7 * K);
      dot(g, e[0], e[1], 4.2);
      const f = add(add(P[0], d, 10 * K), n, s * 24 * K);
      dot(g, f[0], f[1], 2);
    }
    // pincers
    for (const side of [-1, 1]) {
      const shoulder = add(add(P[0], d, 8 * K), n, side * 22 * K);
      const { tip, open } = clawAt(t, side);
      const fore = nrm(sub(tip, shoulder));
      const wrist = add(tip, fore, -46 * K);
      const el = ik2(shoulder, wrist, 58 * K, 62 * K, -side);
      const dirC = nrm(sub(tip, wrist));
      const nc = [-dirC[1], dirC[0]];
      const palm = add(wrist, dirC, 18 * K);
      g.lineWidth = 4;
      line(g, [shoulder, el, wrist]);
      g.stroke();
      dot(g, el[0], el[1], 4.5);
      const pc = add(palm, dirC, -6);
      g.beginPath();
      g.ellipse(pc[0], pc[1], 22 * K, 13 * K, Math.atan2(dirC[1], dirC[0]), 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.lineWidth = 3.2;
      g.stroke();
      g.fillStyle = BONE;
      for (const [s, ang] of [
        [1, 0.08 + open * 0.55],
        [-1, 0.08 + open * 0.2],
      ]) {
        const a = Math.atan2(dirC[1], dirC[0]) + s * ang;
        const end = add(palm, [Math.cos(a), Math.sin(a)], 34 * K);
        const ctl = add(add(palm, [Math.cos(a), Math.sin(a)], 20 * K), nc, s * 8 * K);
        g.lineWidth = 3.4;
        g.beginPath();
        g.moveTo(palm[0], palm[1]);
        g.quadraticCurveTo(ctl[0], ctl[1], end[0], end[1]);
        g.stroke();
      }
    }
    // the tail and the sting
    const T = tailAt(t);
    g.lineWidth = 3;
    line(g, T);
    g.stroke();
    for (let i = 1; i <= NT; i++) {
      const r = (15 - i * 1.1) * K;
      const a = nrm(sub(T[i], T[i - 1]));
      g.beginPath();
      g.ellipse((T[i][0] + T[i - 1][0]) / 2, (T[i][1] + T[i - 1][1]) / 2, TSEG * 0.52, r * 0.7, Math.atan2(a[1], a[0]), 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.lineWidth = 2.6;
      g.stroke();
    }
    const a = nrm(sub(T[NT], T[NT - 1]));
    const na = [-a[1], a[0]];
    const bulb = add(T[NT], a, 12 * K);
    const sting = add(add(bulb, a, 26 * K), na, -12 * K);
    const ctl = add(add(bulb, a, 24 * K), na, 6 * K);
    g.beginPath();
    g.ellipse(bulb[0], bulb[1], 16 * K, 11 * K, Math.atan2(a[1], a[0]), 0, Math.PI * 2);
    g.fillStyle = BG;
    g.fill();
    g.lineWidth = 3.2;
    g.stroke();
    g.strokeStyle = mode === 'hold' || mode === 'frozen' ? VENOM : BONE;
    g.lineWidth = 3.6;
    g.beginPath();
    g.moveTo(bulb[0] + a[0] * 12, bulb[1] + a[1] * 12);
    g.quadraticCurveTo(ctl[0], ctl[1], sting[0], sting[1]);
    g.stroke();
    g.strokeStyle = BONE;
  }

  function drawFx(g, t) {
    g.lineCap = 'round';
    for (const s of splashes) {
      const u = (t - s.at) / 0.8;
      if (u < 0) continue;
      g.globalAlpha = 1 - u;
      g.strokeStyle = s.venom ? VENOM : BONE;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(s.p[0], s.p[1], 10 + 80 * ease.out(u), 0, Math.PI * 2);
      g.stroke();
      if (s.venom) {
        g.fillStyle = VENOM;
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * Math.PI * 2;
          const r = 20 + 90 * ease.out(u);
          dot(g, s.p[0] + Math.cos(ang) * r, s.p[1] + Math.sin(ang) * r + 30 * u * u, 7 * (1 - u));
        }
      }
      g.globalAlpha = 1;
    }
    // the cursor, paralysed: a busy wheel dripping venom
    if (mode === 'frozen') {
      const s = 1.15 / stage.Z;
      const k = ease.out(clamp((t - modeT) / 0.12)) * (t - modeT > 2.85 ? clamp((3 - (t - modeT)) / 0.15) : 1);
      g.save();
      g.translate(dropAt[0], dropAt[1]);
      g.scale(s * k, s * k);
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(184,255,90,0.25)';
      g.beginPath();
      g.arc(0, 0, 16, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = VENOM;
      g.beginPath();
      g.arc(0, 0, 16, t * 9, t * 9 + 2.2);
      g.stroke();
      g.fillStyle = VENOM;
      const dr = (t * 40) % 24;
      g.globalAlpha = 1 - dr / 24;
      dot(g, 0, 24 + dr, 2.6);
      g.restore();
      g.globalAlpha = 1;
    }
  }

  function draw(ctx, t) {
    drawScorpion(ctx.body, t);
    drawFx(ctx.fx, t);
    const state = mode === 'frozen' ? 'cursor not responding' : mode === 'hold' || mode === 'grab' ? 'pincer locked' : `stings ${stings} · hits ${hits}`;
    stage.stats(`legs 8 · ${state}`);
  }

  return { step, draw };
}
