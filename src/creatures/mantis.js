// a skeleton mantis shrimp: the fastest punch in the sea. it follows your cursor and jabs
// at it whenever you're in range, and every punch lands on the glass: the screen cracks.
// click to make it throw a big one. hold still in front of it and it winds up for the
// punch that breaks the screen.

import { dot, line } from '../kit/stage.js';
import { approach, clamp, ease, followChain, ik2 } from '../kit/math.js';
import { add, facingAt, gaitInit, gaitLift, gaitStep, mix, nrm, perp, rot, scale, steer, sub } from '../kit/body.js';

const BG = '#06070b';
const HUE = [176, 168, 150, 132, 52, 40, 30, 20, 10, 0, 345, 322, 300, 286];

export const meta = {
  file: 'mantis.js',
  hint: 'click to punch · hold still in front of it',
  layers: [{ name: 'holes' }, { name: 'body', glow: 'rgba(140,200,255,0.45)' }, { name: 'flash', glow: 'rgba(255,255,255,0.8)', blur: 12 }, { name: 'glass' }],
  vars: { accent: 'rgba(255,190,240,0.92)' },
  ripple: 'rgba(255,220,250,0.8)',
};

const K = 1.4;
const N = 14;
const segLen = (i) => (i < 4 ? 22 : i < 11 ? 20 : 15) * K;
const REACH = 80 * K;
const MERUS = 52 * K;
const DACTYL = 50 * K;
const bone = (i, l = 80) => `hsl(${HUE[Math.max(0, Math.min(N - 1, i))]}, 100%, ${l}%)`;
const LEGS = [3, 4, 5].flatMap((at, k) => [-1, 1].map((side) => ({ at, side, angle: [1.0, 1.55, 2.1][k], hip: 15 * K, reach: 30 * K, group: (k + (side > 0 ? 1 : 0)) % 2 })));
const SIZES = {
  jab: { n: 5, len: 70, rings: [0.5], dur: 0.06, crush: 6, cost: 4 },
  hit: { n: 8, len: 160, rings: [0.3, 0.7], dur: 0.12, crush: 10, cost: 12 },
  final: { n: 18, len: 1500, rings: [0.06, 0.14, 0.26, 0.42, 0.62], dur: 0.35, crush: 34, cost: 100 },
};
const STEPS = 10;

function makeCrack(c, at, kind, seed) {
  const z = SIZES[kind];
  let s = seed;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const rays = [];
  for (let i = 0; i < z.n; i++) {
    let a = (i / z.n) * Math.PI * 2 + (r() - 0.5) * (Math.PI / z.n);
    const len = z.len * (0.65 + r() * 0.5);
    let q = add(c, [Math.cos(a), Math.sin(a)], z.crush);
    const ray = [q];
    for (let k = 0; k < STEPS; k++) {
      a += (r() - 0.5) * 0.4;
      q = add(q, [Math.cos(a), Math.sin(a)], len / STEPS);
      ray.push(q);
    }
    rays.push(ray);
    if (r() < 0.55) {
      const k0 = 3 + Math.floor(r() * 4);
      let fa = a + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.4);
      let f = ray[k0];
      const fork = [f];
      for (let k = 0; k < 4; k++) {
        fa += (r() - 0.5) * 0.4;
        f = add(f, [Math.cos(fa), Math.sin(fa)], len / STEPS);
        fork.push(f);
      }
      rays.push(fork);
    }
  }
  const main = rays.filter((ray) => ray.length === STEPS + 1);
  const rings = [];
  for (const f of z.rings) {
    const k = Math.max(1, Math.round(f * STEPS));
    for (let i = 0; i < main.length; i++) {
      if (r() < 0.22) continue;
      const a = main[i][k];
      const b = main[(i + 1) % main.length][k];
      const m = add(mix(a, b, 0.5), nrm(sub(mix(a, b, 0.5), c)), 6 + r() * 10);
      rings.push({ pts: [a, m, b], f });
    }
  }
  const crush = [];
  for (let k = 0; k < (kind === 'final' ? 26 : kind === 'hit' ? 8 : 0); k++) {
    const a = r() * Math.PI * 2;
    const q = add(c, [Math.cos(a), Math.sin(a)], r() * z.crush);
    crush.push([q, add(q, [Math.cos(a + 1.3), Math.sin(a + 1.3)], 5 + r() * z.crush * 0.6)]);
  }
  return { c, at, kind, dur: z.dur, rays, main, rings, crush };
}

export function create(stage) {
  const p = stage.pointer;
  const J = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    J[i * 2] = stage.W * 0.5 + i * 3;
    J[i * 2 + 1] = stage.H + 60 + i * segLen(i);
  }
  const gait = gaitInit(J, N, LEGS);
  const punches = []; // { at, side: -1|1|0 (both), kind, to }
  let cracks = [];
  let integrity = 100;
  let windAt = -10;
  let shatterAt = -10;
  let knock = { at: -10, v: [0, 0], spin: 0 };
  let saidAt = -10;
  let calmUntil = 0;
  const say = (s) => {
    stage.headline(s);
    saidAt = stage.t;
  };
  stage.headline('move your mouse');

  const clubAt = (side, ext, cock = 0) => {
    const f = facingAt(J, 1, N);
    const sd = scale(perp(f), side);
    const root = add([J[2], J[3]], sd, 13 * K);
    const blend = (a, b) => nrm(add(scale(f, a[0] + (b[0] - a[0]) * ext), sd, a[1] + (b[1] - a[1]) * ext));
    const elbow = add(root, blend([-0.85 + 0.2 * cock, 0.5 + 0.3 * cock], [0.97, 0.22]), MERUS);
    const cd = blend([0.95, 0.28], [1, 0.02]);
    return { root, elbow, tip: add(elbow, cd, DACTYL), dir: cd };
  };
  const pose = (t, side) => {
    let ext = 0;
    let cock = 0;
    for (const q of punches) {
      if (q.side !== 0 && q.side !== side) continue;
      const wind = q.kind === 'final' ? 0.6 : q.kind === 'hit' ? 0.3 : 0.16;
      if (t >= q.at - wind && t < q.at) cock = Math.max(cock, (t - (q.at - wind)) / wind);
      if (t >= q.at && t < q.at + 0.14) ext = 1;
      else if (t >= q.at + 0.14 && t < q.at + 0.4) ext = Math.max(ext, 1 - (t - q.at - 0.14) / 0.26);
    }
    if (windAt > 0 && t >= windAt && shatterAt < windAt) cock = Math.max(cock, clamp((t - windAt) / 0.4));
    return { ext, cock };
  };
  function punch(t, kind, side, to) {
    punches.push({ at: t + (kind === 'hit' ? 0.3 : 0.16), side, kind, to, landed: false });
  }

  stage.on('click', (x, y) => {
    const t = stage.t;
    if (shatterAt > 0 && t - shatterAt < 3) return;
    if (punches.some((q) => !q.landed && q.kind === 'hit')) return;
    punch(t, 'hit', 0, [x, y]);
  });

  let side = 1;
  let lastJab = -10;
  function step(dt, t) {
    const c = [p.x, p.y];
    const head = [J[0], J[1]];
    const d = Math.hypot(c[0] - head[0], c[1] - head[1]);
    const shattered = shatterAt > 0 && t - shatterAt < 3.2;
    const winding = windAt > 0 && shatterAt < windAt;
    // follow, stopping just inside punching range; plant itself to wind up
    if (!shattered) steer(J, c, { off: REACH + 8, rate: winding ? 1.2 : 3.6, dt, maxTurn: 0.6, turnSpeed: 120 });
    followChain(J, N, segLen, 0.12);
    gaitStep(gait, J, N, LEGS, t, { stepAt: 22 * K, stepTime: 0.08, dt });

    // jabs at a cursor in range
    if (!shattered && !winding && d < REACH * 2 && t - lastJab > 1.1) {
      lastJab = t;
      side = -side;
      punch(t, 'jab', side, null);
    }
    // hold still in front of it: the big one
    if (!shattered && !winding && t > calmUntil && d < REACH * 2.6 && p.still > 1.2 && p.real) {
      windAt = t;
      say('…');
    }
    if (winding && t - windAt > 0.6) {
      punches.push({ at: t, side: 0, kind: 'final', to: c, landed: false });
      windAt = -10;
    }
    // punches landing
    for (const q of punches) {
      if (q.landed || t < q.at) continue;
      q.landed = true;
      const tip = q.kind === 'final' ? q.to : q.side === 0 ? mix(clubAt(-1, 1).tip, clubAt(1, 1).tip, 0.5) : clubAt(q.side, 1).tip;
      const near = Math.hypot(c[0] - tip[0], c[1] - tip[1]) < 70;
      const at = q.kind === 'hit' ? add(tip, nrm(sub(q.to, tip)), Math.min(60, Math.hypot(q.to[0] - tip[0], q.to[1] - tip[1]))) : q.kind === 'jab' && near ? c : tip;
      cracks.push(makeCrack(at, t, q.kind, Math.floor(t * 1000) + 7));
      integrity = Math.max(0, integrity - SIZES[q.kind].cost);
      stage.bump();
      if (q.kind === 'final' || integrity <= 0) {
        if (q.kind !== 'final') cracks.push(makeCrack(c, t, 'final', Math.floor(t * 999)));
        shatterAt = t;
        integrity = 0;
        stage.shake(40);
        say('my screen.');
      } else {
        stage.shake(q.kind === 'hit' ? 18 : 7);
        if (Math.hypot(at[0] - c[0], at[1] - c[1]) < 90) {
          knock = { at: t, v: nrm(sub(c, head)), spin: (Math.random() < 0.5 ? -1 : 1) * 4 * Math.PI };
          say(q.kind === 'hit' ? 'ouch.' : 'ow.');
        }
      }
    }
    while (punches.length && t - punches[0].at > 1) punches.shift();
    // a new screen, eventually
    if (shatterAt > 0 && t - shatterAt > 3.2) {
      cracks = [];
      integrity = 100;
      shatterAt = -10;
      calmUntil = t + 4;
      say('new screen.');
    }
    if (saidAt > 0 && t - saidAt > 2.5 && shatterAt < 0) {
      stage.headline('move your mouse');
      saidAt = -10;
    }
    // the cursor, knocked flying by a punch (and stuck in the glass by the last one)
    const kt = t - knock.at;
    if (shatterAt > 0) stage.cursor.override = { x: cracks[cracks.length - 1].c[0], y: cracks[cracks.length - 1].c[1], scale: 1.1, angle: -0.26 };
    else if (kt < 0.6) {
      const u = ease.out(kt / 0.6);
      stage.cursor.override = { x: c[0] + knock.v[0] * 40 * Math.sin(Math.PI * u), y: c[1] + knock.v[1] * 40 * Math.sin(Math.PI * u), scale: 1.1, angle: knock.spin * u };
    } else stage.cursor.override = null;
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  const width = (i) => [20, 27, 31, 33, 35, 38, 39, 38, 36, 33, 29, 22, 18, 14][i] * K;
  function drawShrimp(g, t) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const P = Array.from({ length: N }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
    const F = (i) => facingAt(J, i, N);
    const sideAt = (i, s, w = width(i)) => add(P[i], perp(F(i)), w * s);
    const c = [p.x, p.y];
    const poly = (pts, stroke, w) => {
      line(g, pts, true);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = stroke;
      g.lineWidth = w;
      g.stroke();
    };
    LEGS.forEach((leg, li) => {
      const f = F(leg.at);
      const hip = add(P[leg.at], perp(f), leg.hip * leg.side);
      const foot = [gait.feet[li * 2], gait.feet[li * 2 + 1]];
      const knee = ik2(hip, foot, 20 * K, 20 * K, leg.side);
      g.strokeStyle = bone(leg.at, 78);
      g.lineWidth = 2.2;
      line(g, [hip, knee, foot]);
      g.stroke();
      g.fillStyle = bone(leg.at, 80);
      dot(g, foot[0], foot[1], 2.6 + 1.5 * gaitLift(gait, t, li));
    });
    for (let i = 4; i <= 9; i++)
      for (const s of [-1, 1]) {
        const a = sideAt(i, s, width(i) * 0.95);
        const b = add(add(a, perp(F(i)), s * 10 * K * (0.8 + 0.4 * Math.sin(t * 15 - i))), F(i), -6 * K);
        g.strokeStyle = bone(i, 75);
        g.lineWidth = 1.6;
        line(g, [a, b]);
        g.stroke();
      }
    for (const s of [-1, 1]) {
      const f = F(12);
      const root = sideAt(12, s, width(12) * 0.6);
      const dir = nrm(add(scale(f, -0.75), perp(f), s * 0.7));
      const tip = add(root, dir, 40 * K);
      const ctr = mix(root, tip, 0.5);
      g.beginPath();
      g.ellipse(ctr[0], ctr[1], 22 * K, 8 * K, Math.atan2(dir[1], dir[0]), 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = bone(12);
      g.lineWidth = 2.2;
      g.stroke();
    }
    poly([sideAt(11, -1), sideAt(12, -1, width(12)), add(P[13], F(13), -16 * K), sideAt(12, 1, width(12)), sideAt(11, 1)], bone(12), 2.6);
    for (let i = 10; i >= 4; i--) {
      poly([sideAt(i, -1), sideAt(i + 1, -1, width(i + 1) * 0.96), sideAt(i + 1, 1, width(i + 1) * 0.96), sideAt(i, 1)], bone(i), 2.6);
      const m = mix(P[i], P[i + 1], 0.45);
      g.strokeStyle = bone(i, 70);
      g.lineWidth = 1.2;
      line(g, [add(m, perp(F(i)), -width(i) * 0.7), add(m, perp(F(i)), width(i) * 0.7)]);
      g.stroke();
      g.fillStyle = bone(i);
      dot(g, m[0], m[1], 3);
    }
    poly([add(P[0], F(0), 10 * K), sideAt(0, 1), sideAt(1, 1), sideAt(2, 1), sideAt(3, 1), sideAt(4, 1), sideAt(4, -1), sideAt(3, -1), sideAt(2, -1), sideAt(1, -1), sideAt(0, -1)], bone(2), 3);
    g.strokeStyle = bone(1, 70);
    g.lineWidth = 1.6;
    line(g, P.slice(0, 5));
    g.stroke();
    const f0 = F(0);
    for (const s of [-1, 1]) {
      const root = add(add(P[0], f0, 6 * K), perp(f0), s * 8 * K);
      const A = [root];
      let dir = nrm(add(f0, perp(f0), s * 0.35));
      let q = root;
      for (let k = 0; k < 8; k++) {
        dir = rot(dir, s * (0.06 + 0.05 * Math.sin(t * 4 + k * 0.6 + s)));
        q = add(q, dir, 17 * K);
        A.push(q);
      }
      g.strokeStyle = bone(0, 82);
      g.lineWidth = 1.6;
      line(g, A);
      g.stroke();
      const sc = add(add(P[0], f0, 2 * K), perp(f0), s * 20 * K);
      g.beginPath();
      g.ellipse(sc[0], sc[1], 13 * K, 5.5 * K, Math.atan2(f0[1], f0[0]) + s * 0.49, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = bone(0);
      g.lineWidth = 2;
      g.stroke();
    }
    for (const s of [-1, 1]) {
      const root = add(add(P[0], f0, 4 * K), perp(f0), s * 6 * K);
      const toC = nrm(sub(c, root));
      const wander = rot(f0, s * (0.55 + 0.35 * Math.sin(t * 2.7 + s * 2)));
      const dir = s < 0 ? nrm(mix(wander, toC, 0.8)) : wander;
      const e = add(root, dir, 22 * K);
      g.strokeStyle = bone(0);
      g.lineWidth = 3;
      line(g, [root, e]);
      g.stroke();
      g.beginPath();
      g.ellipse(e[0], e[1], 10 * K, 7 * K, Math.atan2(dir[1], dir[0]), 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = bone(0, 85);
      g.lineWidth = 2.4;
      g.stroke();
      g.strokeStyle = '#ffe36a';
      g.lineWidth = 1.6;
      for (const o of [-1.6, 1.6]) {
        const q = add(e, perp(dir), o * K);
        line(g, [add(q, dir, -8 * K), add(q, dir, 8 * K)]);
        g.stroke();
      }
    }
    for (const s of [-1, 1]) {
      const { ext, cock } = pose(t, s);
      const k = clubAt(s, ext, cock);
      if (ext > 0.95) {
        const folded = clubAt(s, 0, 1).tip;
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 18 * K;
        line(g, [folded, k.tip]);
        g.stroke();
      }
      g.strokeStyle = bone(1, 85);
      g.lineWidth = 5;
      line(g, [k.root, k.elbow, k.tip]);
      g.stroke();
      g.fillStyle = bone(1, 85);
      dot(g, k.elbow[0], k.elbow[1], 5);
      const hot = Math.max(cock, ext);
      g.beginPath();
      g.ellipse(k.tip[0], k.tip[1], 12 * K, 9 * K, Math.atan2(k.dir[1], k.dir[0]), 0, Math.PI * 2);
      g.fillStyle = hot > 0.05 ? `hsla(${s < 0 ? 320 : 176}, 100%, 75%, ${0.25 + 0.75 * hot})` : BG;
      g.fill();
      g.strokeStyle = bone(0, 88);
      g.lineWidth = 3;
      g.stroke();
    }
  }

  function drawFlash(g, t) {
    g.lineCap = 'round';
    for (const k of cracks) {
      const s = t - k.at;
      if (s < 0 || s > 0.35) continue;
      const big = k.kind === 'final' ? 2.2 : k.kind === 'jab' ? 0.7 : 1;
      g.fillStyle = '#fff';
      g.globalAlpha = 1 - clamp(s / 0.15);
      dot(g, k.c[0], k.c[1], (8 + 50 * clamp(s / 0.08)) * big);
      g.globalAlpha = 1 - clamp(s / 0.3);
      g.strokeStyle = '#bff6ff';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(k.c[0], k.c[1], (20 + 140 * clamp(s / 0.3)) * big, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1 - clamp(s / 0.2);
      g.lineWidth = 3;
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * Math.PI * 2 + k.at;
        const p0 = add(k.c, [Math.cos(a), Math.sin(a)], (30 + 200 * clamp(s / 0.15)) * big);
        g.strokeStyle = j % 2 ? '#ffe36a' : '#ff9ae6';
        line(g, [p0, add(p0, [Math.cos(a), Math.sin(a)], 26 * big)]);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }

  function drawGlass(holes, g, t) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const paths = [];
    for (const k of cracks) {
      if (t < k.at) continue;
      const gr = Math.pow(clamp((t - k.at) / k.dur), 0.6);
      for (const ray of k.rays) {
        const n = Math.max(1, Math.round(gr * (ray.length - 1)));
        paths.push(ray.slice(0, n + 1));
      }
      for (const ring of k.rings) if (gr > ring.f) paths.push(ring.pts);
      for (const seg of k.crush) paths.push(seg);
      // the shards that fall out of the big one
      if (k.kind === 'final') {
        const S = [
          [0, 1],
          [3, 0],
          [5, 1],
          [8, 2],
          [11, 1],
          [14, 0],
          [16, 2],
        ];
        S.forEach(([ri, ki], j) => {
          const at = k.at + 0.6 + j * 0.12;
          if (t < at) return;
          const a = k.main[ri % k.main.length];
          const b = k.main[(ri + 1) % k.main.length];
          const k0 = Math.max(1, Math.round(SIZES.final.rings[ki] * STEPS));
          const k1 = Math.max(k0 + 1, Math.round(SIZES.final.rings[ki + 1] * STEPS));
          const poly = [a[k0], a[k1], b[k1], b[k0]];
          line(holes, poly, true);
          holes.fillStyle = '#000';
          holes.fill();
          holes.strokeStyle = 'rgba(255,255,255,0.5)';
          holes.lineWidth = 1.4;
          holes.stroke();
          const s = t - at;
          if (s < 1.2) {
            const ctr = mix(mix(poly[0], poly[2], 0.5), mix(poly[1], poly[3], 0.5), 0.5);
            const moved = poly.map((q) => add(rot(sub(q, ctr), s * (j % 2 ? 2.4 : -2.0)), add(ctr, [s * (j % 2 ? 60 : -50), 0.5 * 3200 * s * s])));
            line(g, moved, true);
            g.fillStyle = 'rgba(210,235,255,0.1)';
            g.globalAlpha = 1 - s / 1.2;
            g.fill();
            g.strokeStyle = 'rgba(255,255,255,0.75)';
            g.lineWidth = 1.6;
            g.stroke();
            g.globalAlpha = 1;
          }
        });
      }
    }
    for (const [style, w, off] of [
      ['rgba(0,0,0,0.55)', 3.4, 0],
      ['rgba(235,248,255,0.88)', 1.5, 0],
      ['rgba(255,255,255,0.35)', 0.8, 1.4],
    ]) {
      g.strokeStyle = style;
      g.lineWidth = w;
      g.beginPath();
      for (const pts of paths) {
        g.moveTo(pts[0][0] + off, pts[0][1] + off);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] + off, pts[i][1] + off);
      }
      g.stroke();
    }
  }

  function draw(ctx, t) {
    drawShrimp(ctx.body, t);
    drawFlash(ctx.flash, t);
    drawGlass(ctx.holes, ctx.glass, t);
    stage.stats(`punches ${cracks.length} · screen ${integrity}%`);
  }

  return { step, draw };
}
