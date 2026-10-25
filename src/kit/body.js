// helpers for the newer creatures: little vector maths, steering a head so a body never
// backs into itself, and a gait for creatures with lots of legs.
//
// a chain is a flat Float32Array [x0,y0,x1,y1,...], joint 0 is the head (see followChain).

import { clamp, unit } from './math.js';

export const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const scale = (a, k) => [a[0] * k, a[1] * k];
export const nrm = (v) => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
// 90° to the left of v (on screen)
export const perp = (v) => [-v[1], v[0]];
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
export const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const smooth = (a, b, x) => {
  const u = clamp((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
export const joints = (J, n = J.length / 2) => Array.from({ length: n }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
export const facingAt = (J, i, n) => {
  const a = Math.max(0, i - 1);
  const b = Math.min(n - 1, i + 1);
  return unit(J[a * 2] - J[b * 2], J[a * 2 + 1] - J[b * 2 + 1]);
};

/**
 * move the head (J[0], J[1]) towards p, stopping `off` short of it. it can only turn so
 * far per step relative to the way it's facing, so a creature facing away walks round in
 * an arc instead of reversing through its own body. `wig` adds a sideways slither.
 */
export function steer(J, p, { rate, dt, off = 0, wig = 0, maxTurn = 1, turnSpeed = 170 }) {
  const [fx, fy] = unit(J[0] - J[4], J[1] - J[5]);
  const ex = p[0] - fy * wig - J[0];
  const ey = p[1] + fx * wig - J[1];
  const d = Math.hypot(ex, ey);
  const facing = Math.atan2(fy, fx);
  const turn = wrapAngle(Math.atan2(ey, ex) - facing);
  const dir = facing + clamp(turn, -maxTurn, maxTurn);
  let v = Math.max(0, d - off) * (1 - Math.exp(-rate * dt)) * Math.max(0, Math.cos(turn));
  if (Math.abs(turn) > 0.5 && d > off + 30) v = Math.max(v, turnSpeed * dt);
  J[0] += Math.cos(dir) * v;
  J[1] += Math.sin(dir) * v;
}

// ── legs ──────────────────────────────────────────────────────────────────
// a leg: { at: spine joint, side: -1|1, angle (rest foot, from straight ahead), hip, reach, group }
// legs in a group step together; groups take turns.

export function legFrame(J, n, leg, reachScale = 1) {
  const f = facingAt(J, leg.at, n);
  const side = [-f[1] * leg.side, f[0] * leg.side];
  const hip = [J[leg.at * 2] + side[0] * leg.hip, J[leg.at * 2 + 1] + side[1] * leg.hip];
  const r = rot(f, leg.side * leg.angle);
  return { hip, rest: add(hip, r, leg.reach * reachScale), f, side };
}

export function gaitInit(J, n, legs) {
  const m = legs.length;
  const g = { feet: new Float32Array(m * 2), from: new Float32Array(m * 2), to: new Float32Array(m * 2), stepT: new Float32Array(m), stepLen: new Float32Array(m), stepping: new Uint8Array(m), steps: 0 };
  legs.forEach((leg, i) => {
    const { rest } = legFrame(J, n, leg);
    g.feet[i * 2] = rest[0];
    g.feet[i * 2 + 1] = rest[1];
  });
  return g;
}

/** feet stay planted until they're `stepAt` from where they'd rest, then swing over. */
export function gaitStep(g, J, n, legs, t, { stepAt, stepTime, reachScale = 1, pin = null, dt = 1 / 120 }) {
  legs.forEach((leg, i) => {
    const pinned = pin ? pin(i) : null;
    if (pinned) {
      const k = 1 - Math.exp(-25 * dt);
      g.feet[i * 2] += (pinned[0] - g.feet[i * 2]) * k;
      g.feet[i * 2 + 1] += (pinned[1] - g.feet[i * 2 + 1]) * k;
      g.stepping[i] = 0;
      return;
    }
    const { rest } = legFrame(J, n, leg, reachScale);
    if (g.stepping[i]) {
      const p = (t - g.stepT[i]) / g.stepLen[i];
      if (p >= 1) {
        g.stepping[i] = 0;
        g.feet[i * 2] = g.to[i * 2];
        g.feet[i * 2 + 1] = g.to[i * 2 + 1];
      } else {
        const e = p * p * (3 - 2 * p);
        g.feet[i * 2] = g.from[i * 2] + (g.to[i * 2] - g.from[i * 2]) * e;
        g.feet[i * 2 + 1] = g.from[i * 2 + 1] + (g.to[i * 2 + 1] - g.from[i * 2 + 1]) * e;
      }
      return;
    }
    const ex = rest[0] - g.feet[i * 2];
    const ey = rest[1] - g.feet[i * 2 + 1];
    const err = Math.hypot(ex, ey);
    const othersMoving = legs.some((l, j) => l.group !== leg.group && g.stepping[j]);
    if ((err > stepAt && !othersMoving) || err > stepAt * 1.7) {
      g.stepping[i] = 1;
      g.stepT[i] = t;
      g.stepLen[i] = stepTime;
      g.from[i * 2] = g.feet[i * 2];
      g.from[i * 2 + 1] = g.feet[i * 2 + 1];
      const lead = Math.min(0.6, (stepAt * 0.6) / Math.max(1, err)) + 0.25;
      g.to[i * 2] = rest[0] + ex * lead;
      g.to[i * 2 + 1] = rest[1] + ey * lead;
      g.steps++;
    }
  });
}

/** how high each foot is lifted right now (0 planted … 1 mid-swing) */
export const gaitLift = (g, t, i) => (g.stepping[i] ? Math.sin(Math.PI * Math.min(1, (t - g.stepT[i]) / g.stepLen[i])) : 0);

// ── the cursor, drawn by hand ─────────────────────────────────────────────
// the same arrow stage.drawArrow uses, tip at 0,0 (34 units tall)
export const ARROW_PTS = [
  [0, 0],
  [0, 28],
  [7, 21.5],
  [11.5, 32],
  [16, 30],
  [11.5, 19.8],
  [20.5, 19.8],
];
export const ARROW = new Path2D('M0 0 L0 28 L7 21.5 L11.5 32 L16 30 L11.5 19.8 L20.5 19.8 Z');
/** world units per arrow unit for a normal-sized cursor */
export const arrowScale = (stage) => 1.1 / stage.Z;
