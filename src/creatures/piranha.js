// a skeleton piranha circles your cursor and darts in to take bites out of it. every
// bite really takes a piece away. a few bites in, friends turn up, and then the whole
// school: a feeding frenzy that strips the cursor right down to its skeleton (it still
// works). click to scare them off for a moment.

import { dot, line } from '../kit/stage.js';
import { add, ARROW, ARROW_PTS, arrowScale, smooth, wrapAngle } from '../kit/body.js';

const BONE = '#fff0ee';
const BG = '#06070b';
const FISH = 14;

export const meta = {
  file: 'piranha.js',
  hint: 'they bite · click to scare them off',
  layers: [{ name: 'water' }, { name: 'fish', glow: 'rgba(255,60,70,0.6)', blur: 6 }, { name: 'top' }],
  vars: { accent: 'rgba(255,150,150,0.95)' },
  ripple: 'rgba(255,200,200,0.8)',
};

const inside = (x, y) => {
  let hit = false;
  for (let i = 0, j = ARROW_PTS.length - 1; i < ARROW_PTS.length; j = i++) {
    const [xi, yi] = ARROW_PTS[i];
    const [xj, yj] = ARROW_PTS[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
// sample points over the cursor, to work out how much of it is left
const SAMPLES = [];
for (let y = 0.5; y < 32; y += 1) for (let x = 0.5; x < 21; x += 1) if (inside(x, y)) SAMPLES.push([x, y]);

// the bones of the cursor: its outline, ribs across, a tiny skull at the tip
const BONES = [
  [[0, 0], [0, 28]],
  [[0, 0], [20.5, 19.8]],
  [[0, 28], [7, 21.5]],
  [[20.5, 19.8], [11.5, 19.8]],
  [[7, 21.5], [11.5, 32]],
  [[11.5, 19.8], [16, 30]],
  [[11.5, 32], [16, 30]],
  [[0, 8], [8.3, 8]],
  [[0, 12.5], [12.9, 12.5]],
  [[0, 17], [17.6, 17]],
  [[9, 21], [13.6, 31]],
];
const KNOBS = [
  [0, 28],
  [7, 21.5],
  [20.5, 19.8],
  [11.5, 19.8],
  [11.5, 32],
  [16, 30],
  [8.3, 8],
  [12.9, 12.5],
  [17.6, 17],
];

// one piranha, side-on, in its own frame: +x forward, +y belly
const BODY = [
  [86, 2],
  [62, -30],
  [12, -54],
  [-38, -32],
  [-62, -9],
  [-62, 9],
  [-38, 34],
  [12, 56],
  [54, 40],
  [80, 22],
];
const SKULL = [
  [40, -36],
  [64, -26],
  [80, -12],
  [88, 2],
  [84, 7],
  [58, 8],
  [42, 14],
  [36, -10],
];
function drawPiranha(g, jaw, wag) {
  const tail = Math.sin(wag) * 0.35;
  const shape = (pts, close, w, fill) => {
    line(g, pts, close);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    g.lineWidth = w;
    g.stroke();
  };
  g.globalAlpha = 0.55;
  shape(BODY, true, 1.6, BG);
  g.globalAlpha = 1;
  const sp = (x) => [x, -4 + Math.sin(wag - x * 0.03) * (x < 0 ? (-x / 62) * 6 : 0)];
  shape([sp(46), sp(20), sp(-10), sp(-40), sp(-62)], false, 3.2);
  g.fillStyle = BONE;
  for (const x of [32, 20, 8, -4, -16, -28]) {
    const a = sp(x);
    const h = 44 - Math.abs(x - 10) * 0.35;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.quadraticCurveTo(a[0] + 6, a[1] + h * 0.6, a[0] - 4, a[1] + h);
    g.lineWidth = 2;
    g.stroke();
    shape([a, [a[0] - 8, a[1] - h * 0.7]], false, 1.6);
    dot(g, a[0], a[1], 2.6);
  }
  for (let k = 0; k < 5; k++) {
    shape([[-6 + k * 5, -46 + k * 1.5], [-18 + k * 6, -72 + k * 3]], false, 1.3);
    shape([[-24 + k * 5, 40 - k], [-34 + k * 5, 62 - k * 2]], false, 1.3);
  }
  const tf = (x, y) => [-62 + x * Math.cos(tail) - y * Math.sin(tail), x * Math.sin(tail) + y * Math.cos(tail)];
  shape([tf(0, -8), tf(-34, -36), tf(-22, 0), tf(-34, 36), tf(0, 8)], true, 2.2, BG);
  for (const y of [-24, -12, 12, 24]) shape([tf(-2, y * 0.2), tf(-28, y)], false, 1.1);
  for (const q of [
    [26, 36],
    [24, 30],
    [28, 40],
  ])
    shape([[42, 22], q], false, 1.3);
  const hinge = [46, 16];
  const ja = jaw * 0.65;
  const jr = (q) => {
    const dx = q[0] - hinge[0];
    const dy = q[1] - hinge[1];
    return [hinge[0] + dx * Math.cos(ja) - dy * Math.sin(ja), hinge[1] + dx * Math.sin(ja) + dy * Math.cos(ja)];
  };
  shape([hinge, [70, 30], [92, 16], [90, 9], [62, 13]].map(jr), true, 2.8, BG);
  g.fillStyle = BONE;
  for (let k = 0; k < 5; k++) {
    line(g, [jr([64 + k * 5.5, 13 - k * 0.6]), jr([66.5 + k * 5.5, 5 - k * 0.6]), jr([69 + k * 5.5, 13 - k * 0.6])], true);
    g.fill();
  }
  shape(SKULL, true, 3, BG);
  g.fillStyle = BONE;
  for (let k = 0; k < 5; k++) {
    line(g, [[62 + k * 5, 7.5], [64.5 + k * 5, 15], [67 + k * 5, 7.5]], true);
    g.fill();
  }
  g.beginPath();
  g.arc(60, -10, 10, 0, Math.PI * 2);
  g.fillStyle = BG;
  g.fill();
  g.lineWidth = 2.4;
  g.stroke();
  g.fillStyle = '#ff3b4a';
  dot(g, 62, -10, 4.5);
}

export function create(stage) {
  const p = stage.pointer;
  const fish = Array.from({ length: FISH }, (_, i) => ({
    x: 0,
    y: 0,
    a: 0,
    v: 0,
    wag: i,
    orbit: i * 1.7,
    here: i === 0,
    mode: 'circle', // circle · dart · flee
    modeT: 0,
    nextBite: 2 + i * 0.3,
    biteP: [0, 0],
    biteR: 4,
    shutAt: -10,
    sc: 1.2 * (1.1 - (i % 3) * 0.08),
  }));
  const entry = (i) => {
    const a = i * 2.39996 + 0.6;
    return [stage.W * 0.5 + Math.cos(a) * stage.W * 0.75, stage.H * 0.5 + Math.sin(a) * stage.H * 0.75];
  };
  fish.forEach((f, i) => {
    [f.x, f.y] = i === 0 ? [stage.W * 0.15, stage.H * 1.1] : entry(i);
    f.a = Math.atan2(stage.H * 0.5 - f.y, stage.W * 0.5 - f.x);
  });

  let bites = []; // { p, r, at, where } in arrow units
  let pct = 100;
  let level = 0; // 0 one fish · 1 friends · 2 frenzy
  let skeletonAt = -10;
  let scareAt = -10;
  let scareP = [0, 0];
  let saidAt = -10;
  let dirty = true;
  // the headline it goes back to after a quick remark
  let base = 'move your mouse';
  const say = (s, keep = true) => {
    stage.headline(s);
    if (keep) base = s;
    saidAt = keep ? -10 : stage.t;
  };
  stage.headline('move your mouse');
  stage.cursor.hidden = true;

  // the bitten cursor lives on its own little canvas (arrow units × 4), redrawn on each bite
  const RES = 4;
  const PAD = 6;
  const cv = document.createElement('canvas');
  cv.width = (22 + PAD * 2) * RES;
  cv.height = (34 + PAD * 2) * RES;
  const cg = cv.getContext('2d');
  function redrawCursor() {
    cg.setTransform(1, 0, 0, 1, 0, 0);
    cg.clearRect(0, 0, cv.width, cv.height);
    cg.setTransform(RES, 0, 0, RES, PAD * RES, PAD * RES);
    cg.lineJoin = 'round';
    cg.lineWidth = 2.2;
    cg.fillStyle = '#000';
    cg.strokeStyle = '#fff';
    cg.fill(ARROW);
    cg.stroke(ARROW);
    cg.globalCompositeOperation = 'destination-out';
    bites.forEach((b, k) => {
      dot(cg, b.p[0], b.p[1], b.r);
      for (let j = 0; j < 6; j++) dot(cg, b.p[0] + Math.cos(j * 1.05 + k) * b.r, b.p[1] + Math.sin(j * 1.05 + k) * b.r, b.r * 0.28);
    });
    // the raw edge of every bite
    cg.globalCompositeOperation = 'source-atop';
    cg.strokeStyle = '#ff4a5a';
    cg.lineWidth = 1.8;
    for (const b of bites) {
      cg.beginPath();
      cg.arc(b.p[0], b.p[1], b.r + 0.9, 0, Math.PI * 2);
      cg.stroke();
    }
    cg.globalCompositeOperation = 'source-over';
    dirty = false;
  }
  const coverage = () => {
    let left = 0;
    for (const [x, y] of SAMPLES) if (!bites.some((b) => (x - b.p[0]) ** 2 + (y - b.p[1]) ** 2 < (b.r * 1.15) ** 2)) left++;
    return Math.round((left / SAMPLES.length) * 100);
  };
  // somewhere on what's left of the cursor
  const pickBite = () => {
    for (let k = 0; k < 40; k++) {
      const q = [Math.random() * 21, Math.random() * 32];
      if (!inside(q[0], q[1])) continue;
      if (bites.some((b) => (q[0] - b.p[0]) ** 2 + (q[1] - b.p[1]) ** 2 < (b.r * 0.9) ** 2)) continue;
      return q;
    }
    return SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
  };

  stage.on('click', (x, y) => {
    scareAt = stage.t;
    scareP = [x, y];
    for (const f of fish) if (f.here && Math.hypot(f.x - x, f.y - y) < 700) Object.assign(f, { mode: 'flee', modeT: stage.t });
    if (skeletonAt < 0) say('shoo.', false);
  });

  const bubbles = Array.from({ length: 40 }, (_, k) => ({ k, born: -Math.random() * 3, life: 1.6 + Math.random() * 1.2, x: Math.random(), y: Math.random(), r: 3 + Math.random() * 6, near: k >= 24 }));
  const crumbs = [];

  const big = () => arrowScale(stage) * 1.5;
  function step(dt, t) {
    const k = big();
    const c = [p.x, p.y];
    const skel = skeletonAt > 0;
    // more arrive the more it's been bitten
    const want = skel ? 1 : level === 0 ? 1 : level === 1 ? 3 : FISH;
    fish.forEach((f, i) => {
      if (i < want && !f.here) {
        f.here = true;
        f.mode = 'circle';
        f.nextBite = t + 0.8 + Math.random() * (level === 2 ? 1 : 2);
      }
    });
    const frenzy = level === 2 && !skel;

    fish.forEach((f, i) => {
      let tx;
      let ty;
      let speed;
      let turn = 5;
      const mouth = 95 * f.sc;
      if (!f.here || (skel && i >= 1 && t - skeletonAt > 0)) {
        // swim off (or stay off) round the edge
        const out = Math.atan2(f.y - c[1], f.x - c[0]);
        [tx, ty] = f.here ? [c[0] + Math.cos(out) * 3000, c[1] + Math.sin(out) * 3000] : entry(i);
        speed = f.here ? 1500 : 0;
        turn = 9;
        if (f.here && Math.hypot(f.x - stage.W / 2, f.y - stage.H / 2) > stage.W * 1.2) {
          f.here = false;
          [f.x, f.y] = entry(i);
        }
      } else if (f.mode === 'flee') {
        const out = Math.atan2(f.y - scareP[1], f.x - scareP[0]);
        tx = f.x + Math.cos(out) * 800;
        ty = f.y + Math.sin(out) * 800;
        speed = 1400;
        turn = 12;
        if (t - f.modeT > 1.1) {
          f.mode = 'circle';
          f.nextBite = t + 0.6 + Math.random();
        }
      } else if (f.mode === 'dart') {
        // dart in: the jaws meet on that bit of the cursor (the mouth is ahead of its middle)
        const goal = add(c, f.biteP, k);
        tx = goal[0] - Math.cos(f.a) * mouth;
        ty = goal[1] - Math.sin(f.a) * mouth;
        speed = frenzy ? 1400 : 1200;
        turn = 14;
        const m = [f.x + Math.cos(f.a) * mouth, f.y + Math.sin(f.a) * mouth];
        if (Math.hypot(m[0] - goal[0], m[1] - goal[1]) < 34) {
          bites.push({ p: f.biteP, r: f.biteR, at: t, where: goal });
          for (let j = 0; j < 6; j++) {
            const a = Math.random() * Math.PI * 2;
            crumbs.push({ at: t, p: goal, v: [Math.cos(a), Math.sin(a)], s: 30 + Math.random() * 60, rot: Math.random() * 2 });
          }
          dirty = true;
          f.shutAt = t;
          f.mode = 'circle';
          f.nextBite = t + (frenzy ? 0.3 + Math.random() * 0.6 : level === 1 ? 1.2 + Math.random() : 1.8 + Math.random());
          stage.shake(frenzy ? 4 : 9);
          stage.bump();
          pct = coverage();
          const n = bites.length;
          if (n === 1) say('it bit me.');
          if (level === 0 && n >= 3) {
            level = 1;
            say('friends?');
          } else if (level === 1 && n >= 6) {
            level = 2;
            say('nope nope nope');
          }
          if (pct <= 14) {
            skeletonAt = t;
            for (const o of fish) o.mode = 'circle';
            stage.shake(16);
            say('');
          }
        } else if (t - f.modeT > 1.0) {
          f.mode = 'circle';
          f.nextBite = t + 0.5;
        }
      } else {
        // circle the cursor (tight and fast in the frenzy)
        const r = frenzy ? 120 + ((i * 37) % 130) : 220 + i * 40;
        f.orbit += dt * (frenzy ? 3.6 + (i % 3) * 0.6 : 1.5) * (i % 2 ? 1 : -1);
        tx = c[0] + Math.cos(f.orbit) * r;
        ty = c[1] + Math.sin(f.orbit) * r * 0.9;
        speed = frenzy ? 950 : 560;
        if (skel) {
          // one comes back for a sniff. nothing left.
          const sniff = (t - skeletonAt) % 4 > 2.6;
          tx = sniff ? c[0] + 30 - Math.cos(f.a) * 95 : c[0] + Math.cos(f.orbit) * 380;
          ty = sniff ? c[1] + 40 - Math.sin(f.a) * 95 : c[1] + Math.sin(f.orbit) * 300;
          speed = sniff ? 400 : 700;
        } else if (t > f.nextBite && Math.hypot(f.x - c[0], f.y - c[1]) < 600) {
          f.mode = 'dart';
          f.modeT = t;
          f.biteP = pickBite();
          f.biteR = frenzy ? 2.2 + Math.random() * 1.2 : 2.8 + Math.random() * 1.2;
        }
      }
      const wantA = Math.atan2(ty - f.y, tx - f.x);
      const d = Math.hypot(tx - f.x, ty - f.y);
      f.a += Math.max(-turn * dt, Math.min(turn * dt, wrapAngle(wantA - f.a)));
      const goalV = Math.min(speed, d * 6);
      f.v += (goalV - f.v) * (1 - Math.exp(-6 * dt));
      f.x += Math.cos(f.a) * f.v * dt;
      f.y += Math.sin(f.a) * f.v * dt;
      f.wag += dt * (6 + f.v * 0.02);
    });

    if (skel && t - skeletonAt > 1 && t - skeletonAt < 1.1) say('still works.');
    // it grows back
    if (skel && t - skeletonAt > 9) {
      skeletonAt = -10;
      bites = [];
      dirty = true;
      pct = 100;
      level = 0;
      say('it grew back.', false);
      base = 'move your mouse';
      fish[0].nextBite = t + 3;
    }
    while (crumbs.length && t - crumbs[0].at > 0.9) crumbs.shift();
    if (saidAt > 0 && t - saidAt > 1.6) {
      stage.headline(base);
      saidAt = -10;
    }
  }

  function drawWater(g, t) {
    const c = [p.x, p.y];
    const murk = level === 2 && skeletonAt < 0 ? 1 : skeletonAt > 0 ? 1 - smooth(0, 0.8, stage.t - skeletonAt) : 0;
    if (murk > 0) {
      const gr = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], 560);
      gr.addColorStop(0, `rgba(200,20,40,${0.32 * murk})`);
      gr.addColorStop(0.65, 'rgba(200,20,40,0)');
      g.fillStyle = gr;
      g.fillRect(c[0] - 560, c[1] - 560, 1120, 1120);
    }
    g.lineWidth = 1.6;
    g.strokeStyle = 'rgba(255,220,220,0.5)';
    for (const b of bubbles) {
      let u = (t - b.born) / b.life;
      if (u > 1) {
        b.born = t;
        b.x = Math.random();
        b.y = Math.random();
        u = 0;
      }
      if (b.near && murk < 0.2) continue;
      const x0 = b.near ? c[0] + (b.x - 0.5) * 380 : b.x * stage.W;
      const y0 = b.near ? c[1] + (b.y - 0.5) * 320 : stage.H * 0.25 + b.y * stage.H * 0.8;
      g.globalAlpha = Math.sin(Math.PI * u);
      g.beginPath();
      g.arc(x0 + Math.sin(u * 9 + b.k) * 8, y0 - u * 260, b.r, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawFish(g, t) {
    g.strokeStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const f of fish) {
      if (!f.here && f.v < 1) continue;
      let jaw = 0;
      if (f.mode === 'dart') jaw = smooth(0, 0.18, t - f.modeT);
      const flip = Math.cos(f.a) < 0 ? -1 : 1;
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.a);
      g.scale(f.sc, f.sc * flip);
      drawPiranha(g, jaw, f.wag);
      g.restore();
    }
  }

  function drawCursor(g, t) {
    const k = big();
    const c = [p.x, p.y];
    g.fillStyle = '#fff';
    for (const cr of crumbs) {
      const u = (t - cr.at) / 0.9;
      const q = add(cr.p, cr.v, cr.s * u);
      g.globalAlpha = 1 - u;
      g.save();
      g.translate(q[0], q[1] + 40 * u * u);
      g.rotate(cr.rot);
      g.fillRect(-2.5, -2, 5, 4);
      g.restore();
    }
    g.globalAlpha = 1;
    const skel = skeletonAt > 0 ? smooth(0, 0.12, t - skeletonAt) : 0;
    if (skel < 1) {
      if (dirty) redrawCursor();
      g.globalAlpha = 1 - skel;
      g.drawImage(cv, c[0] - PAD * k, c[1] - PAD * k, (22 + PAD * 2) * k, (34 + PAD * 2) * k);
      g.globalAlpha = 1;
    }
    if (skel > 0) {
      g.save();
      g.translate(c[0], c[1]);
      g.scale(k, k);
      g.globalAlpha = skel;
      g.strokeStyle = '#fff';
      g.fillStyle = '#fff';
      g.lineCap = 'round';
      g.shadowColor = 'rgba(255,255,255,0.8)';
      g.shadowBlur = 4;
      g.lineWidth = 1.7;
      for (const [a, b] of BONES) {
        line(g, [a, b]);
        g.stroke();
      }
      for (const [x, y] of KNOBS) dot(g, x, y, 1.15);
      g.beginPath();
      g.arc(2.6, 4.2, 2.6, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.lineWidth = 1.1;
      g.stroke();
      g.fillStyle = '#fff';
      dot(g, 1.8, 3.9, 0.6);
      dot(g, 3.5, 3.9, 0.6);
      g.restore();
    }
  }

  function draw(ctx, t) {
    drawWater(ctx.water, t);
    drawFish(ctx.fish, t);
    drawCursor(ctx.top, t);
    const here = fish.filter((f) => f.here).length;
    stage.stats(skeletonAt > 0 ? 'cursor 0% · skeleton' : `cursor ${pct}% · ${here} piranha${here > 1 ? 's' : ''}`);
  }

  return { step, draw };
}
