// skeleton arms that live under the page. they claw at the cursor whenever it gets
// near the ground. click and another one bursts out. if one gets hold of you, pull
// away fast, because the others come to help drag it under.

import { dot, line } from '../kit/stage.js';
import { approach, clamp, ease, hash, ik2, lerp, unit } from '../kit/math.js';

const BONE = '#f1f5ea';
const BG = '#06070b';

export const meta = {
  file: 'grave.js',
  hint: 'click to raise another · if one grabs you, pull away fast',
  layers: [
    { name: 'back', glow: 'rgba(140,255,160,0.35)' },
    { name: 'body', glow: 'rgba(140,255,160,0.5)' },
    { name: 'soil' },
  ],
  vars: { accent: 'rgba(170,255,185,0.9)' },
  ripple: 'rgba(200,255,210,0.7)',
};

const L1 = 230; // humerus (mostly underground)
const L2 = 215; // radius / ulna
const PALM = 46;
const MAX_ARMS = 9;

export function create(stage) {
  const p = stage.pointer;
  const ground = () => (stage.H > stage.W * 1.3 ? stage.H * 0.66 : stage.H * 0.76);

  const arms = [];
  const addArm = (x, t) => {
    const G = ground();
    arms.push({
      x0: x,
      born: t,
      bend: arms.length % 2 ? 1 : -1,
      wrist: [x + (stage.rand() - 0.5) * 60, G - 150],
      curl: 0.2,
      k: arms.length,
    });
  };

  // a puff of dirt where something breaks the surface
  const dirt = [];
  const burst = (x, n, t, power = 1) => {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (stage.rand() - 0.5) * 2.2;
      const v = (300 + stage.rand() * 700) * power;
      dirt.push({ x: x + (stage.rand() - 0.5) * 50, y: ground(), vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: t, r: 2 + stage.rand() * 5 });
    }
  };

  // hunt -> held (one hand has it) -> drag (they all pull it under) -> buried -> back to hunt
  let mode = 'hunt';
  let modeT = 0;
  let holder = null;
  let grip = [0, 0];
  let cooldown = 0;
  let tomb = null;
  let buried = 0;

  const setMode = (m, t) => {
    mode = m;
    modeT = t;
  };

  addArm(stage.W * 0.36, -10);
  addArm(stage.W * 0.64, -10);
  stage.headline("don't go near the ground");

  stage.on('click', (x) => {
    const t = stage.t;
    if (mode !== 'hunt') return;
    if (arms.length >= MAX_ARMS) {
      stage.headline('that is enough arms');
      return;
    }
    addArm(clamp(x, 70, stage.W - 70), t);
    burst(clamp(x, 70, stage.W - 70), 26, t);
    stage.shake(10);
    stage.bump();
    stage.headline(['click.', 'again?', 'more?', 'too many'][clamp(arms.length - 3, 0, 3)]);
  });

  const shoulderOf = (a, t) => {
    const e = ease.out(clamp((t - a.born) / 0.55));
    return [a.x0, ground() + 120 + (1 - e) * 420];
  };
  const palmOf = (a) => a.palm || a.wrist;

  function step(dt, t) {
    const G = ground();
    const cur = [p.x, p.y];

    if (mode === 'hunt') {
      // a hand close enough closes on it
      if (t > cooldown) {
        for (const a of arms) {
          if (t - a.born < 0.4 || !a.palm) continue;
          if (Math.hypot(a.palm[0] - cur[0], a.palm[1] - cur[1]) < 52) {
            holder = a;
            grip = [...cur];
            setMode('held', t);
            stage.shake(12);
            stage.headline('help');
            break;
          }
        }
      }
    } else if (mode === 'held') {
      grip[1] += 70 * dt; // it starts pulling you down
      if (Math.hypot(p.x - grip[0], p.y - grip[1]) > 260) {
        // ripped free
        setMode('hunt', t);
        cooldown = t + 1.2;
        holder = null;
        stage.shake(8);
        stage.headline('phew');
      } else if (t - modeT > 1.3) {
        setMode('drag', t);
        stage.headline('no no no');
      }
    } else if (mode === 'drag') {
      const q = clamp((t - modeT) / 0.9);
      grip[1] = lerp(grip[1], G + 80, ease.in(q) * 0.25);
      if (grip[1] > G + 10) {
        setMode('buried', t);
        buried++;
        tomb = { x: clamp(grip[0], 110, stage.W - 110), t0: t };
        burst(grip[0], 60, t, 1.4);
        stage.shake(30);
        stage.bump();
        stage.headline('rest in peace');
      }
    } else if (mode === 'buried') {
      if (t - modeT > 2.6) {
        setMode('return', t);
        burst(tomb.x, 30, t);
      }
    } else if (mode === 'return') {
      if (t - modeT > 0.45) {
        setMode('hunt', t);
        cooldown = t + 2;
        holder = null;
        stage.headline("don't go near the ground");
      }
    }

    // the cursor itself
    if (mode === 'held' || mode === 'drag') {
      stage.cursor.override = { x: grip[0] + Math.sin(t * 70) * 2, y: grip[1], size: 1 };
      stage.cursor.hidden = false;
    } else if (mode === 'buried') {
      stage.cursor.override = null;
      stage.cursor.hidden = true;
    } else if (mode === 'return') {
      // tossed back up out of the dirt
      const q = clamp((t - modeT) / 0.45);
      const from = [tomb.x, G];
      stage.cursor.hidden = false;
      stage.cursor.override = { x: lerp(from[0], p.x, ease.out(q)), y: lerp(from[1], p.y, ease.out(q)) - Math.sin(Math.PI * q) * 160, size: 1, angle: q * Math.PI * 4 };
    } else {
      stage.cursor.override = null;
      stage.cursor.hidden = false;
    }

    // arms
    arms.forEach((a, i) => {
      const sh = shoulderOf(a, t);
      let target;
      let rate = 4.5 + (i % 3) * 0.6;
      if (mode === 'buried') {
        target = [sh[0] + Math.sin(t * 2 + i) * 40, G - 120];
        rate = 3;
      } else if ((mode === 'held' || mode === 'drag') && a === holder) {
        target = grip;
        rate = 30;
      } else if (mode === 'held' || mode === 'drag') {
        // everyone else piles in
        const ang = -Math.PI / 2 + (i - arms.length / 2) * 0.5;
        target = [grip[0] + Math.cos(ang) * 40, grip[1] + Math.sin(ang) * 30];
        rate = mode === 'drag' ? 12 : 8;
      } else {
        const off = ((i * 2.4) % (Math.PI * 2)) - Math.PI;
        target = [cur[0] + Math.cos(off) * 30, cur[1] + 20 + Math.sin(off) * 16];
      }
      // they lean towards you rather than lying flat: stay roughly over their own hole
      if (mode === 'hunt' || mode === 'buried') target = [clamp(target[0], a.x0 - 250, a.x0 + 250), Math.min(target[1], G - 70)];
      // can't reach further than the bones allow
      const reach = L1 + L2 - 4;
      const d = Math.hypot(target[0] - sh[0], target[1] - sh[1]);
      if (d > reach) {
        const u = unit(target[0] - sh[0], target[1] - sh[1]);
        target = [sh[0] + u[0] * reach, sh[1] + u[1] * reach];
      }
      // a zombie tremble
      target = [target[0] + Math.sin(t * 13 + i * 3) * 3, target[1] + Math.cos(t * 11 + i) * 3];
      a.wrist = [approach(a.wrist[0], target[0], rate, dt), approach(a.wrist[1], target[1], rate, dt)];

      // fingers close as they get near, snap shut when they've got you
      const dc = Math.hypot(a.wrist[0] - cur[0], a.wrist[1] - cur[1]);
      let want = 0.15 + 0.35 * Math.max(0, Math.sin(t * 3 + i * 1.7));
      if (dc < 160) want = 0.75;
      if ((mode === 'held' || mode === 'drag') && (a === holder || Math.hypot(a.wrist[0] - grip[0], a.wrist[1] - grip[1]) < 80)) want = 1;
      a.curl = approach(a.curl, want, 14, dt);
      const fdir = unit(a.wrist[0] - (a.elbow ? a.elbow[0] : sh[0]), a.wrist[1] - (a.elbow ? a.elbow[1] : sh[1]));
      a.palm = [a.wrist[0] + fdir[0] * PALM * 0.7, a.wrist[1] + fdir[1] * PALM * 0.7];
      // elbows point up, so they rise out of the dirt instead of crawling along it
      const e1 = ik2(sh, a.wrist, L1, L2, 1);
      const e2 = ik2(sh, a.wrist, L1, L2, -1);
      a.elbow = e1[1] < e2[1] ? e1 : e2;
    });

    // dirt
    for (let i = dirt.length - 1; i >= 0; i--) {
      const d = dirt[i];
      d.vy += 2600 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y > G + 30 && d.vy > 0) dirt.splice(i, 1);
    }
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function bone(c, a, b, w) {
    c.lineWidth = w;
    line(c, [a, b]);
    c.stroke();
    c.fillStyle = BONE;
    dot(c, a[0], a[1], w * 0.95);
    dot(c, b[0], b[1], w * 0.95);
  }

  function drawArm(c, a, t) {
    const sh = shoulderOf(a, t);
    const el = a.elbow || sh;
    const wr = a.wrist;
    c.strokeStyle = BONE;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    bone(c, sh, el, 9);
    // radius + ulna: two bones side by side
    const d = unit(wr[0] - el[0], wr[1] - el[1]);
    const n = [-d[1], d[0]];
    for (const s of [-1, 1]) {
      c.lineWidth = s < 0 ? 5 : 4;
      line(c, [[el[0] + n[0] * 3 * s, el[1] + n[1] * 3 * s], [wr[0] + n[0] * 7 * s, wr[1] + n[1] * 7 * s]]);
      c.stroke();
    }
    c.fillStyle = BONE;
    dot(c, el[0], el[1], 8);
    // carpals
    for (let k = 0; k < 4; k++) dot(c, wr[0] + d[0] * (6 + (k % 2) * 8) + n[0] * (k - 1.5) * 7, wr[1] + d[1] * (6 + (k % 2) * 8) + n[1] * (k - 1.5) * 7, 4);
    // four fingers + a thumb, each a little chain of phalanges that curls
    const ang = Math.atan2(d[1], d[0]);
    const side = a.bend;
    const fingers = [
      { o: -0.5, len: [36, 26, 19, 14] },
      { o: -0.17, len: [40, 29, 21, 15] },
      { o: 0.16, len: [38, 27, 20, 14] },
      { o: 0.48, len: [32, 22, 16, 12] },
      { o: -1.25, len: [24, 21, 17], thumb: true },
    ];
    for (const f of fingers) {
      const o = f.o * side;
      let pt = [wr[0] + d[0] * 14, wr[1] + d[1] * 14];
      let a0 = ang + o;
      c.lineWidth = f.thumb ? 5 : 4.6;
      c.beginPath();
      c.moveTo(pt[0], pt[1]);
      f.len.forEach((L, j) => {
        const bend = j === 0 ? 0 : a.curl * (f.thumb ? 0.6 : 0.85) * -side;
        a0 += bend;
        pt = [pt[0] + Math.cos(a0) * L, pt[1] + Math.sin(a0) * L];
        c.lineTo(pt[0], pt[1]);
      });
      c.stroke();
    }
  }

  function drawTomb(c, t) {
    if (!tomb) return;
    const G = ground();
    let rise = ease.out(clamp((t - tomb.t0 - 0.3) / 0.7));
    if (mode === 'return' || (mode === 'hunt' && t - modeT < 1.2 && buried)) rise *= 1 - clamp((t - modeT) / 1.2);
    if (rise <= 0) return;
    const w = 190;
    const h = 250;
    const x = tomb.x;
    const y = G + 10 - h * rise;
    c.save();
    c.beginPath();
    c.rect(x - w, 0, w * 2, G + 6);
    c.clip();
    c.beginPath();
    c.moveTo(x - w / 2, y + h);
    c.lineTo(x - w / 2, y + w / 2);
    c.arc(x, y + w / 2, w / 2, Math.PI, 0);
    c.lineTo(x + w / 2, y + h);
    c.closePath();
    c.fillStyle = BG;
    c.fill();
    c.strokeStyle = BONE;
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = BONE;
    c.textAlign = 'center';
    c.font = 'italic 300 64px Fraunces, Georgia, serif';
    c.fillText('RIP', x, y + 110);
    c.font = '500 26px "JetBrains Mono", ui-monospace, monospace';
    c.fillText('cursor', x, y + 152);
    c.fillText(buried > 1 ? `x${buried}` : '2026', x, y + 186);
    c.restore();
  }

  function drawSoil(c, t) {
    const G = ground();
    const W = stage.W;
    // the ground, with a ragged edge
    c.fillStyle = '#0b0a09';
    c.beginPath();
    c.moveTo(-300, stage.H + 300);
    c.lineTo(-300, G);
    for (let x = -300; x <= W + 300; x += 24) c.lineTo(x, G + Math.sin(x * 0.05) * 3 + hash(Math.floor(x / 24), 3) * 6);
    c.lineTo(W + 300, stage.H + 300);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(241,245,234,0.22)';
    c.lineWidth = 2;
    c.beginPath();
    for (let x = -300; x <= W + 300; x += 24) {
      const y = G + Math.sin(x * 0.05) * 3 + hash(Math.floor(x / 24), 3) * 6;
      if (x === -300) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // pebbles + roots
    c.fillStyle = 'rgba(241,245,234,0.07)';
    for (let i = 0; i < 90; i++) dot(c, hash(i, 1) * (W + 200) - 100, G + 20 + hash(i, 2) * (stage.H - G), 1.5 + hash(i, 4) * 3);
    // dirt in the air
    c.fillStyle = '#3a2f26';
    for (const d of dirt) dot(c, d.x, d.y, d.r);
  }

  // holes where the arms come out (behind the arms)
  function drawHoles(c, t) {
    const G = ground();
    c.fillStyle = '#000';
    for (const a of arms) {
      if (shoulderOf(a, t)[1] > G + 100) continue;
      c.beginPath();
      c.ellipse(a.x0, G + 4, 46, 9, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  function draw(ctx, t) {
    drawTomb(ctx.back, t);
    drawHoles(ctx.back, t);
    for (const a of arms) drawArm(ctx.body, a, t);
    drawSoil(ctx.soil, t);
    const state = { hunt: 'reaching', held: 'got you', drag: 'pulling you under', buried: 'buried', return: 'spat back out' }[mode];
    stage.stats(`arms ${arms.length} · fingers ${arms.length * 5} · ${state}`);
  }

  return { step, draw };
}
