// a skeleton hydra. every head chases the cursor and snaps at it.
// click to cut off the nearest head... and two grow back.
// get enough heads and hold still, and they all go for you at once.

import { dot, line } from '../kit/stage.js';
import { approach, clamp, ease, followChain, lerp, unit } from '../kit/math.js';

const BONE = '#f6f2ff';
const BG = '#06070b';

export const meta = {
  file: 'hydra.js',
  hint: 'click to cut off a head · then hold still',
  layers: [{ name: 'body', glow: 'rgba(120,255,200,0.55)' }, { name: 'fx' }],
  vars: { accent: 'rgba(150,255,210,0.95)' },
  ripple: 'rgba(200,255,230,0.8)',
};

const NJ = 26; // joints per neck
const SEG = 18;
const MAX_HEADS = 12;

export function create(stage) {
  const p = stage.pointer;
  const body = { x: stage.W / 2, y: stage.H > stage.W * 1.3 ? stage.H * 0.8 : stage.H * 0.86 };

  let nextId = 0;
  const necks = [];
  const debris = [];
  function addNeck(ang, t, from) {
    const J = new Float32Array(NJ * 2);
    const b = baseOf(ang);
    for (let i = 0; i < NJ; i++) {
      J[i * 2] = from ? from[0] : b[0];
      J[i * 2 + 1] = (from ? from[1] : b[1]) - (NJ - 1 - i) * 2;
    }
    necks.push({ id: nextId++, ang, J, born: t, mouth: 0, biteAt: -10, phase: stage.rand() * 6 });
  }
  function baseOf(ang) {
    return [body.x + Math.sin(ang) * 70, body.y - Math.cos(ang) * 50 - 20];
  }

  addNeck(-0.3, -10);
  addNeck(0.35, -10);

  // hunt -> ready (all rear back) -> strike -> bonk (they hit each other) -> hunt
  let mode = 'hunt';
  let modeT = 0;
  let cuts = 0;
  let bites = 0;
  const setMode = (m, t) => {
    mode = m;
    modeT = t;
  };

  stage.headline('move your mouse');

  stage.on('click', (x, y) => {
    const t = stage.t;
    if (mode !== 'hunt') return;
    if (necks.length >= MAX_HEADS) {
      stage.headline('no more room for heads');
      return;
    }
    // cut the head nearest the click
    let best = null;
    let bd = Infinity;
    for (const n of necks) {
      if (t - n.born < 0.8) continue;
      const d = Math.hypot(n.J[0] - x, n.J[1] - y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (!best) return;
    const at = [best.J[0], best.J[1]];
    const dir = unit(best.J[0] - best.J[4], best.J[1] - best.J[5]);
    debris.push({ x: at[0], y: at[1], vx: dir[0] * 200 + (stage.rand() - 0.5) * 300, vy: -400, rot: Math.atan2(dir[1], dir[0]), vr: (stage.rand() - 0.5) * 14, t0: t });
    necks.splice(necks.indexOf(best), 1);
    // two grow back from the stump
    const mid = [best.J[(NJ - 6) * 2], best.J[(NJ - 6) * 2 + 1]];
    addNeck(best.ang - 0.16, t, mid);
    addNeck(best.ang + 0.16, t, mid);
    necks.sort((a, b) => a.ang - b.ang);
    cuts++;
    stage.shake(12);
    stage.bump();
    const n = necks.length;
    stage.headline(n >= 8 ? "that's a lot of heads" : n >= 5 ? 'stop cutting' : 'two grew back');
  });

  function step(dt, t) {
    const cur = [p.x, p.y];
    const n = necks.length;

    if (mode === 'hunt' && n >= 6 && p.still > 1 && p.real) {
      setMode('ready', t);
      stage.headline('uh oh');
    }
    if (mode === 'ready' && t - modeT > 0.7) setMode('strike', t);
    if (mode === 'strike' && t - modeT > 0.14) {
      setMode('bonk', t);
      stage.shake(32);
      stage.bump();
      stage.headline('bonk.');
    }
    if (mode === 'bonk' && t - modeT > 2.6) {
      setMode('hunt', t);
      stage.headline('move your mouse');
    }

    // the body shuffles over towards you
    body.x = approach(body.x, clamp(p.x, stage.W * 0.25, stage.W * 0.75), 0.8, dt);

    necks.forEach((nk, i) => {
      const J = nk.J;
      const base = baseOf(nk.ang);
      // necks grow in over a moment
      const grow = ease.out(clamp((t - nk.born) / 0.8));
      const seg = lerp(3, SEG, grow);
      // where this head wants to be
      let target;
      let rate = 4.5;
      const spread = nk.ang * 1.6;
      if (mode === 'ready') {
        // rear back in a ring around you
        target = [cur[0] + Math.sin(spread) * 300, cur[1] - Math.cos(spread) * 300];
        rate = 7;
      } else if (mode === 'strike') {
        target = cur;
        rate = 40;
      } else if (mode === 'bonk') {
        // they all hit each other: bounce off, then sag, seeing stars
        const q = clamp((t - modeT) / 2.2);
        target = [cur[0] + Math.sin(spread) * (70 + 40 * Math.min(1, (t - modeT) * 6)), cur[1] + 40 + 160 * ease.inOut(q)];
        rate = t - modeT < 0.25 ? 14 : 3;
      } else {
        const a = spread + Math.sin(t * 1.3 + nk.phase) * 0.15;
        const r = 110 + (i % 3) * 30;
        target = [cur[0] + Math.sin(a) * r, cur[1] + Math.cos(a) * r * 0.4 + 40];
        // snap at the cursor every so often
        const d = Math.hypot(J[0] - cur[0], J[1] - cur[1]);
        if (d < 220 && t - nk.biteAt > 1.4 + (i % 3) * 0.3) nk.biteAt = t;
        if (t - nk.biteAt < 0.18) {
          target = cur;
          rate = 26;
          if (t - nk.biteAt > 0.12 && t - nk.biteAt < 0.12 + dt * 1.5 && Math.hypot(J[0] - cur[0], J[1] - cur[1]) < 40) {
            bites++;
            stage.shake(6);
          }
        }
      }
      const wob = Math.sin(t * 2 + i) * 6;
      J[0] = approach(J[0], target[0] + wob, rate, dt);
      J[1] = approach(J[1], target[1], rate, dt);
      // FABRIK-ish: drag from the head, then pin the base and pull back
      followChain(J, NJ, seg, 0.35);
      J[(NJ - 1) * 2] = base[0];
      J[(NJ - 1) * 2 + 1] = base[1];
      for (let k = NJ - 2; k >= 0; k--) {
        const [dx, dy] = unit(J[k * 2] - J[(k + 1) * 2], J[k * 2 + 1] - J[(k + 1) * 2 + 1]);
        J[k * 2] = J[(k + 1) * 2] + dx * seg;
        J[k * 2 + 1] = J[(k + 1) * 2 + 1] + dy * seg;
      }
      const biting = mode === 'strike' || (mode === 'hunt' && t - nk.biteAt < 0.18) || mode === 'ready';
      nk.mouth = approach(nk.mouth, biting ? 1 : 0, 22, dt);
    });

    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.vy += 2600 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      if (t - d.t0 > 2.5) debris.splice(i, 1);
    }
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function skull(g, h, d, mouth, t, ko, alpha = 1) {
    const nn = [-d[1], d[0]];
    const pt = (f, s) => [h[0] + d[0] * f + nn[0] * s, h[1] + d[1] * f + nn[1] * s];
    g.globalAlpha = alpha;
    g.lineWidth = 3.4;
    // upper jaw and lower jaw split open
    const open = mouth * 0.45;
    const rot = (q, a) => {
      const pv = pt(-8, 0);
      const x = q[0] - pv[0];
      const y = q[1] - pv[1];
      return [pv[0] + x * Math.cos(a) - y * Math.sin(a), pv[1] + x * Math.sin(a) + y * Math.cos(a)];
    };
    for (const s of [-1, 1]) {
      const jaw = [pt(52, 2 * s), pt(36, 13 * s), pt(10, 20 * s), pt(-16, 22 * s), pt(-30, 10 * s), pt(-32, 0)].map((q) => rot(q, s * open));
      line(g, jaw, true);
      g.fillStyle = BG;
      g.fill();
      g.stroke();
      if (mouth > 0.2) {
        g.lineWidth = 2.2;
        g.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = rot(pt(44 - k * 10, 6 * s), s * open);
          const b = rot(pt(41 - k * 10, -4 * s), s * open);
          g.moveTo(a[0], a[1]);
          g.lineTo(b[0], b[1]);
        }
        g.stroke();
        g.lineWidth = 3.4;
      }
      // horns
      const h0 = pt(-20, 16 * s);
      const h1 = pt(-48, 34 * s);
      const h2 = pt(-70, 30 * s);
      g.beginPath();
      g.moveTo(h0[0], h0[1]);
      g.quadraticCurveTo(h1[0], h1[1], h2[0], h2[1]);
      g.stroke();
      // eyes: X when knocked out
      const e = rot(pt(4, 11 * s), s * open);
      if (ko) {
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(e[0] - 5, e[1] - 5);
        g.lineTo(e[0] + 5, e[1] + 5);
        g.moveTo(e[0] + 5, e[1] - 5);
        g.lineTo(e[0] - 5, e[1] + 5);
        g.stroke();
        g.lineWidth = 3.4;
      } else {
        g.fillStyle = BONE;
        dot(g, e[0], e[1], 5.5);
      }
    }
    g.globalAlpha = 1;
  }

  function drawBody(g, t) {
    g.strokeStyle = BONE;
    g.fillStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const { x, y } = body;
    // tail curling off to one side
    const tail = [];
    for (let k = 0; k < 14; k++) tail.push([x - 60 - k * 22, y + 70 + Math.sin(k * 0.45 + t * 1.6) * 10 + k * k * 0.6]);
    g.lineWidth = 3;
    line(g, [[x - 40, y + 50], ...tail]);
    g.stroke();
    tail.forEach((q, k) => dot(g, q[0], q[1], Math.max(2, 6 - k * 0.3)));
    // legs
    g.lineWidth = 6;
    for (const s of [-1, 1]) {
      line(g, [[x + s * 70, y + 30], [x + s * 120, y + 80], [x + s * 110, y + 150]]);
      g.stroke();
    }
    // rib cage
    g.lineWidth = 3.2;
    g.beginPath();
    g.ellipse(x, y + 20, 110, 70, 0, 0, Math.PI * 2);
    g.fillStyle = BG;
    g.fill();
    g.stroke();
    g.lineWidth = 2.4;
    g.beginPath();
    for (let k = -3; k <= 3; k++) {
      g.moveTo(x + k * 26, y - 40);
      g.quadraticCurveTo(x + k * 34, y + 20, x + k * 24, y + 82);
    }
    g.stroke();
    g.lineWidth = 4;
    line(g, [[x - 100, y + 20], [x + 100, y + 20]]);
    g.stroke();
  }

  function drawNecks(g, t) {
    g.strokeStyle = BONE;
    g.fillStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const nk of necks) {
      const J = nk.J;
      const pts = Array.from({ length: NJ }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
      g.lineWidth = 3.4;
      line(g, pts);
      g.stroke();
      for (let i = 2; i < NJ; i += 2) {
        const d = unit(pts[i - 1][0] - pts[i + 1 < NJ ? i + 1 : i][0], pts[i - 1][1] - pts[i + 1 < NJ ? i + 1 : i][1]);
        const w = 7 + (i / NJ) * 9;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(pts[i][0] - d[1] * w, pts[i][1] + d[0] * w);
        g.lineTo(pts[i][0] + d[1] * w, pts[i][1] - d[0] * w);
        g.stroke();
        dot(g, pts[i][0], pts[i][1], 3.6);
      }
      const d = unit(pts[0][0] - pts[2][0], pts[0][1] - pts[2][1]);
      const grow = ease.back(clamp((t - nk.born) / 0.6));
      g.save();
      g.translate(pts[0][0], pts[0][1]);
      g.scale(grow, grow);
      g.translate(-pts[0][0], -pts[0][1]);
      skull(g, pts[0], d, nk.mouth, t, mode === 'bonk');
      g.restore();
      g.strokeStyle = BONE;
      g.fillStyle = BONE;
    }
    // severed heads tumbling away
    for (const dbr of debris) {
      skull(g, [dbr.x, dbr.y], [Math.cos(dbr.rot), Math.sin(dbr.rot)], 0.6, t, true, clamp(1 - (t - dbr.t0) / 2.5));
    }
  }

  function drawFx(g, t) {
    if (mode !== 'bonk') return;
    // stars circling the pile-up
    const c = [p.x, p.y];
    for (let k = 0; k < 6; k++) {
      const a = t * 4 + (k / 6) * Math.PI * 2;
      const x = c[0] + Math.cos(a) * 90;
      const y = c[1] - 70 + Math.sin(a) * 26;
      g.fillStyle = '#ffe36b';
      g.beginPath();
      for (let j = 0; j < 10; j++) {
        const r = j % 2 ? 6 : 14;
        const aa = (j / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
      }
      g.closePath();
      g.fill();
    }
  }

  function draw(ctx, t) {
    drawBody(ctx.body, t);
    drawNecks(ctx.body, t);
    drawFx(ctx.fx, t);
    const state = mode === 'bonk' ? 'knocked out' : mode === 'ready' || mode === 'strike' ? 'all at once' : `bites ${bites}`;
    stage.stats(`heads ${necks.length} · cut off ${cuts} · ${state}`);
  }

  return { step, draw };
}
