// t-rex skeleton, side view. it stomps after the cursor along the floor.
// hover by its face and it roars. by its chest and the tiny arms can't reach.
// go above its head and it jumps. zip left-right-left-right and it trips over its
// own tail and falls apart. click the pile to put it back together.

import { createStage, line, dot } from '../kit/stage.js';
import { approach, clamp, ease, fall, hash, ik2, lerp, rotate } from '../kit/math.js';

const BONE = '#fff3e3';
const BG = '#06070b';
const SC = 1.2;
const HIP_H = 330 * SC;
const STRIDE = 230 * SC;
const STEP_T = 0.3;
const JUMP = { dur: 0.85, height: 300 };

const stage = createStage({
  file: 'trex.js',
  hint: 'try: its face · its arms · above it · zip back and forth',
  layers: [{ name: 'body', glow: 'rgba(255,140,60,0.6)' }],
  vars: { accent: 'rgba(255,190,130,0.95)' },
  ripple: 'rgba(255,210,170,0.8)',
});

const p = stage.pointer;
const ground = () => stage.H - Math.max(240, stage.H * 0.22);

const s = {
  x: 300,
  vx: 0,
  face: 1,
  want: 1,
  foot: [290, 330],
  from: [0, 0],
  to: [0, 0],
  stepT: [0, 0],
  stepping: [0, 0],
  lift: [0, 0],
};
let jumpAt = -10;
let roarAt = -10;
let flips = [];
let tripAt = null; // falling over
let pile = null; // { t0, bones }
let rebuildAt = null;
let status = 'hunting';

stage.on('click', (x, y) => {
  if (pile && !rebuildAt && stage.t - pile.t0 > 0.6) {
    rebuildAt = stage.t;
    stage.headline('ctrl + z');
    stage.bump();
  }
});

const hipY = (t) => {
  let y = ground() - HIP_H - 10 * Math.max(s.lift[0], s.lift[1]);
  if (t >= jumpAt && t < jumpAt + JUMP.dur) y -= JUMP.height * Math.sin((Math.PI * (t - jumpAt)) / JUMP.dur);
  return y;
};

// rough spots on the body, for deciding what the cursor is near
const headPos = (t) => [s.x + 260 * SC * s.face, hipY(t) - 200 * SC];
const chestPos = (t) => [s.x + 175 * SC * s.face, hipY(t) - 10 * SC];

function step(dt, t) {
  if (tripAt !== null || pile) return;
  const G = ground();
  // turn to face the cursor (with a bit of hysteresis so it doesn't flicker)
  const prevWant = s.want;
  if (p.x > s.x + 90) s.want = 1;
  else if (p.x < s.x - 90) s.want = -1;
  if (s.want !== prevWant && p.real) flips.push(t);
  flips = flips.filter((f) => t - f < 3);
  const dizzy = flips.length >= 3;
  s.face = approach(s.face, s.want, dizzy ? 9 : 6, dt);

  const head = headPos(t);
  const chest = chestPos(t);
  const nearChest = Math.hypot(p.x - chest[0], p.y - chest[1]) < 150;
  const nearHead = Math.hypot(p.x - head[0], p.y - head[1]) < 190;
  const jumping = t >= jumpAt && t < jumpAt + JUMP.dur;

  // keep its head near the cursor (closer in when you hover at its arms)
  const reach = nearChest ? 180 : 360;
  const target = p.x - s.want * reach;
  const maxV = dizzy ? 520 : 400;
  const dv = clamp((target - s.x) * 3, -maxV, maxV);
  s.vx = approach(s.vx, jumping ? 0 : dv, 5, dt);
  s.x += s.vx * dt;
  s.x = clamp(s.x, 260, stage.W - 260);

  // the moves
  if (p.real && !jumping && t - jumpAt > 1.6 && p.y < head[1] - 170 && Math.abs(p.x - head[0]) < 260) {
    jumpAt = t;
  }
  if (p.real && nearHead && p.still > 0.35 && t - roarAt > 3) {
    roarAt = t;
    stage.shake(22);
  }
  status = nearChest ? 'arms: too short' : 'hunting';
  let h = 'move your mouse';
  if (nearChest) h = 'tiny arms';
  if (dizzy) h = 'dizzy';
  if (t - jumpAt < JUMP.dur) h = 'jump!';
  if (t - roarAt < 1.1) h = 'ROAR';
  stage.headline(h);

  // trip: too many turns, or you zip between its legs
  const between = p.y > hipY(t) && p.y < G && Math.abs(p.x - s.x) < 80 && p.speed > 900;
  if (flips.length >= 5 || (p.real && between)) {
    tripAt = t;
    flips = [];
    stage.headline('oops');
    return;
  }

  // feet: plant, then step when the hip has moved half a stride away
  for (let k = 0; k < 2; k++) {
    if (s.stepping[k]) {
      const q = (t - s.stepT[k]) / STEP_T;
      if (q >= 1) {
        s.stepping[k] = 0;
        s.foot[k] = s.to[k];
        s.lift[k] = 0;
        stage.shake(3);
      } else {
        s.foot[k] = lerp(s.from[k], s.to[k], ease.inOut(q));
        s.lift[k] = Math.sin(Math.PI * q);
      }
      continue;
    }
    if (jumping) continue;
    const home = s.x + (k === 0 ? -18 : 18) * SC * s.face;
    if (!s.stepping[1 - k] && Math.abs(s.foot[k] - home) > STRIDE / 2) {
      s.stepping[k] = 1;
      s.stepT[k] = t;
      s.from[k] = s.foot[k];
      s.to[k] = home + s.vx * 0.32;
    }
  }
  if (t >= jumpAt + JUMP.dur && t < jumpAt + JUMP.dur + 1 / 100) stage.shake(30);
}

function jawAt(t, nearChest) {
  const r = t - roarAt;
  if (r >= 0 && r < 1.1) return 0.75 * Math.min(1, r / 0.15) * (1 - clamp((r - 0.8) / 0.3));
  if (nearChest) return 0.35 * Math.max(0, Math.sin(t * 11));
  const j = t - jumpAt;
  if (j >= 0.25 && j < 0.55) return 0.6;
  return 0.08 + 0.06 * Math.sin(t * 2);
}

// the skeleton as a list of bones (so each one can fall on its own)
function build(t, { frozen = false, tilt = 0 } = {}) {
  const G = ground();
  const x = s.x;
  let f = s.face;
  if (frozen) f = p.x >= x ? 1 : -1;
  else if (Math.abs(f) < 0.12) f = 0.12 * Math.sign(f || 1);
  const H = [x, frozen ? G - HIP_H : hipY(t)];
  const L = (lx, ly) => [H[0] + lx * f * SC, H[1] + ly * SC];
  const bones = [];
  const chest = chestPos(t);
  const nearChest = !frozen && Math.hypot(p.x - chest[0], p.y - chest[1]) < 150;

  const spine = [L(0, 0), L(40, -26), L(85, -48), L(130, -62), L(165, -66)];
  bones.push({ pts: spine, w: 5 });
  for (let r = 0; r < 6; r++) {
    const lx = 22 + r * 24;
    const ly = -14 - (lx / 165) * 52;
    const len = 60 + 70 * Math.sin((Math.PI * (lx - 10)) / 165);
    bones.push({ pts: [L(lx, ly), L(lx - 6, ly + len * 0.5), L(lx - 22, ly + len)], w: 3 });
  }
  bones.push({ pts: [L(-42, -18), L(40, -26), L(36, 6), L(-36, 8)], w: 3.4, closed: true, fill: true });
  bones.push({ pts: [L(0, 4), L(26, 74), L(44, 80)], w: 4 });
  bones.push({ pts: [L(-4, 4), L(-30, 62)], w: 4 });
  // tail
  for (let j = 0; j < 11; j++) {
    const a = L(-j * 34, -8 - j * 1.5 + Math.sin(t * 2.6 - j * 0.45) * j * 1.6);
    const b = L(-(j + 1) * 34, -8 - (j + 1) * 1.5 + Math.sin(t * 2.6 - (j + 1) * 0.45) * (j + 1) * 1.6);
    const chev = Math.max(6, 34 - j * 2.6);
    bones.push({ pts: [a, b], w: Math.max(2, 5 - j * 0.3), dots: [[a[0], a[1], Math.max(2.5, 5.5 - j * 0.3)]] });
    bones.push({ pts: [L(-j * 34 - 8, -2 - j * 1.5), L(-j * 34 - 18, -2 - j * 1.5 + chev)], w: 2.2 });
  }
  // neck + skull, looking at the cursor
  const S = spine[4];
  const look = clamp(Math.atan2(p.y - S[1], (p.x - S[0]) * f) * 0.5, -0.5, 0.6);
  const N = rotate(L(220, -160), S, look * f * 0.6);
  const neckMid = rotate(L(205, -110), S, look * f * 0.4);
  bones.push({ pts: [S, neckMid, N], w: 5, dots: [[neckMid[0], neckMid[1], 5]] });
  const pitch = clamp(look + 0.15, -0.4, 0.9);
  const sk = (lx, ly, jaw = 0) => {
    let q = [lx, ly];
    if (jaw) q = rotate(q, [20, 16], jaw);
    return rotate([N[0] + q[0] * f * SC, N[1] + q[1] * SC], N, pitch * f);
  };
  const jaw = jawAt(t, nearChest);
  const upper = [[0, -6], [30, -34], [90, -46], [160, -38], [205, -18], [212, 0], [200, 10], [140, 14], [60, 16], [10, 18]];
  const teethU = [];
  for (let tx = 70; tx <= 190; tx += 17) teethU.push(sk(tx, 13), sk(tx + 6, 29), sk(tx + 12, 13));
  const eye = sk(62, -18);
  const fen = sk(120, -16);
  bones.push({ pts: upper.map(([a, b]) => sk(a, b)), w: 4, closed: true, fill: true, dots: [[eye[0], eye[1], -13], [fen[0], fen[1], -11]] });
  bones.push({ pts: teethU, w: 2.4 });
  const lower = [[20, 16], [80, 20], [150, 18], [200, 14], [196, 30], [140, 40], [70, 44], [25, 34]];
  const teethL = [];
  for (let tx = 78; tx <= 186; tx += 18) teethL.push(sk(tx, 20, jaw), sk(tx + 6, 6, jaw), sk(tx + 12, 20, jaw));
  bones.push({ pts: lower.map(([a, b]) => sk(a, b, jaw)), w: 3.6, closed: true, fill: true });
  bones.push({ pts: teethL, w: 2.4 });
  // the tiny arms (they flail when you hover just out of reach)
  const flail = nearChest ? 1 : 0.25;
  for (let k = 0; k < 2; k++) {
    const sh = L(170 + k * 6, -30 + k * 4);
    const a1 = 0.7 + flail * 0.7 * Math.sin(t * 15 + k * 2.1);
    const a2 = a1 + 0.9 + flail * 0.6 * Math.sin(t * 19 + k);
    const el = [sh[0] + Math.cos(a1) * 40 * SC * f, sh[1] + Math.sin(a1) * 40 * SC];
    const wr = [el[0] + Math.cos(a2) * 34 * SC * f, el[1] + Math.sin(a2) * 34 * SC];
    bones.push({ pts: [sh, el, wr], w: 3.6, dots: [[el[0], el[1], 3.5]] });
    bones.push({ pts: [wr, [wr[0] + 14 * f, wr[1] + 6], wr, [wr[0] + 10 * f, wr[1] + 14]], w: 2.4 });
  }
  // legs
  const jumping = !frozen && t >= jumpAt && t < jumpAt + JUMP.dur;
  for (let k = 0; k < 2; k++) {
    const hipJ = L(0, 8);
    let foot = frozen ? [x + (k === 0 ? -18 : 18) * SC * f, G] : [s.foot[k], G - s.lift[k] * 70 * SC];
    if (jumping) foot = [hipJ[0] + (30 + k * 26) * SC * f, hipJ[1] + 250 * SC];
    const ankle = [foot[0] - 28 * SC * f, foot[1] - 78 * SC];
    const k1 = ik2(hipJ, ankle, 150 * SC, 160 * SC, 1);
    const k2 = ik2(hipJ, ankle, 150 * SC, 160 * SC, -1);
    const knee = (k1[0] - hipJ[0]) * f > (k2[0] - hipJ[0]) * f ? k1 : k2;
    bones.push({ pts: [hipJ, knee], w: 6, dots: [[knee[0], knee[1], 7]] });
    bones.push({ pts: [knee, ankle], w: 5, dots: [[ankle[0], ankle[1], 5]] });
    bones.push({ pts: [ankle, foot], w: 4.4 });
    bones.push({ pts: [foot, [foot[0] + 46 * SC * f, foot[1] - 2], foot, [foot[0] + 34 * SC * f, foot[1] + 10], foot, [foot[0] - 18 * SC * f, foot[1] + 2]], w: 3 });
  }

  if (tilt) {
    const pivot = [x + 60 * SC * f, G];
    return bones.map((b) => ({
      ...b,
      pts: b.pts.map((q) => rotate(q, pivot, tilt * f)),
      dots: b.dots && b.dots.map(([dx, dy, r]) => [...rotate([dx, dy], pivot, tilt * f), r]),
    }));
  }
  return bones;
}

const centroid = (pts) => pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length], [0, 0]);
const moveBone = (b, c0, dx, dy, da) => ({
  ...b,
  pts: b.pts.map((q) => {
    const r = rotate(q, c0, da);
    return [r[0] + dx, r[1] + dy];
  }),
  dots: b.dots && b.dots.map(([x, y, r]) => {
    const q = rotate([x, y], c0, da);
    return [q[0] + dx, q[1] + dy, r];
  }),
});

// a bone's spot in the pile, `sec` seconds after the collapse
function pileOf(b, i, sec) {
  const G = ground();
  const c0 = centroid(b.pts);
  const rest = G - 6 - hash(i, 1) * 26;
  const lowest = Math.max(...b.pts.map((q) => q[1])) - c0[1];
  const dist = Math.max(0, rest - lowest - c0[1]);
  const dy = fall(sec, dist, { bounce: 0.25 });
  const vx = (hash(i, 2) - 0.5) * 520 + (c0[0] - s.x) * 0.4;
  const dx = (vx * (1 - Math.exp(-3 * sec))) / 3;
  const spin = (Math.round((hash(i, 3) - 0.5) * 3) * Math.PI) / 2;
  return { c0, dx, dy, da: spin * ease.out(Math.min(1, sec / 0.7)) };
}

function skeletonAt(t) {
  if (tripAt !== null) {
    const q = clamp((t - tripAt) / 0.25);
    if (q < 1) return build(t, { tilt: 0.42 * ease.in(q) });
    pile = { t0: t, bones: build(t, { tilt: 0.42 }) };
    tripAt = null;
    stage.shake(26);
    stage.bump();
  }
  if (!pile) return build(t);
  const sec = (rebuildAt ?? t) - pile.t0;
  const lying = pile.bones.map((b, i) => {
    const q = pileOf(b, i, sec);
    return moveBone(b, q.c0, q.dx, q.dy, q.da);
  });
  if (!rebuildAt) return lying;
  // fly back together, a few at a time
  const up = build(t, { frozen: true });
  const done = t - rebuildAt > 0.9;
  if (done) {
    pile = null;
    rebuildAt = null;
    s.face = up[0].pts[1][0] > up[0].pts[0][0] ? 1 : -1;
    s.want = s.face;
    s.foot = [s.x - 18 * SC * s.face, s.x + 18 * SC * s.face];
    s.stepping = [0, 0];
    s.lift = [0, 0];
    stage.shake(16);
    stage.headline('move your mouse');
    return up;
  }
  return lying.map((b, i) => {
    const q = clamp((t - rebuildAt - hash(i, 4) * 0.15) / 0.75);
    const e = ease.back(q);
    const target = up[i];
    const hop = Math.sin(Math.PI * q) * 140;
    return {
      ...target,
      pts: target.pts.map((tp, k) => {
        const lp = b.pts[Math.min(k, b.pts.length - 1)];
        return [lerp(lp[0], tp[0], e), lerp(lp[1], tp[1], e) - hop];
      }),
      dots: target.dots && target.dots.map(([x, y, r], k) => {
        const ld = (b.dots && b.dots[k]) || [x, y, r];
        return [lerp(ld[0], x, e), lerp(ld[1], y, e) - hop, r];
      }),
    };
  });
}

function draw(ctx, t) {
  const c = ctx.body;
  const G = ground();
  // the page's floor
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.fillRect(60 / stage.Z, G + 2, stage.W - 120 / stage.Z, 3);

  c.strokeStyle = BONE;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const b of skeletonAt(t)) {
    c.lineWidth = b.w;
    line(c, b.pts, b.closed);
    if (b.fill) {
      c.fillStyle = BG;
      c.fill();
    }
    c.stroke();
    if (b.dots) {
      for (const [x, y, r] of b.dots) {
        if (r > 0) {
          c.fillStyle = BONE;
          dot(c, x, y, r);
        } else {
          c.fillStyle = BG;
          c.lineWidth = 3;
          dot(c, x, y, -r);
          c.stroke();
        }
      }
    }
  }
  if (pile && !rebuildAt) status = 'bones: everywhere · click them';
  stage.stats(`bones 68 · ${status}`);
}

stage.headline('move your mouse');
stage.run({ step, draw });
