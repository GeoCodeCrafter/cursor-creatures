// glowing jellyfish that drift after the cursor, pulse by pulse, trailing tentacles.
// brush through the tentacles and they sting. click to add another jelly.
// stop moving when there are a few of them around... and they light up together.

import { dot } from '../kit/stage.js';
import { angleDiff, approach, clamp, ease, hash, lerp, unit } from '../kit/math.js';

export const meta = {
  file: 'jellies.js',
  hint: 'click to add a jelly · stop moving if you dare',
  layers: [{ name: 'sea' }, { name: 'tentacles', glow: 'rgba(120,220,255,0.6)', blur: 6 }, { name: 'bells', glow: 'rgba(160,230,255,0.7)', blur: 10 }, { name: 'zap', blend: 'screen' }],
  vars: {
    bg: 'radial-gradient(120% 80% at 50% 0%, #0a2a4a 0%, #04121f 55%, #01050b 100%)',
    dot: 'rgba(150,220,255,0.05)',
    ghost: 'rgba(180,230,255,0.12)',
    accent: 'rgba(150,230,255,0.95)',
  },
  ripple: 'rgba(170,235,255,0.8)',
};

const HUES = [190, 300, 265, 165, 330, 210, 45];
const TENT = 12; // tentacles per jelly
const TN = 16; // nodes per tentacle
const ARMS = 4;
const AN = 9;
const MAX = 12;

export function create(stage) {
  const p = stage.pointer;
  const jellies = [];

  function spawn(x, y, t, size = 1) {
    const J = {
      x,
      y,
      vx: 0,
      vy: 0,
      a: -Math.PI / 2,
      size,
      grow: t,
      hue: HUES[jellies.length % HUES.length],
      phase: stage.rand(),
      period: 1.0 + stage.rand() * 0.4,
      sq: 0,
      k: jellies.length,
      tent: [],
      arms: [],
    };
    const rope = (n, len) => {
      const r = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        r[i * 4] = r[i * 4 + 2] = x;
        r[i * 4 + 1] = r[i * 4 + 3] = y + i * len;
      }
      return r;
    };
    for (let i = 0; i < TENT; i++) J.tent.push(rope(TN, 16));
    for (let i = 0; i < ARMS; i++) J.arms.push(rope(AN, 18));
    jellies.push(J);
    return J;
  }

  spawn(stage.W * 0.35, stage.H * 0.4, -10);
  spawn(stage.W * 0.62, stage.H * 0.3, -10, 0.8);
  spawn(stage.W * 0.55, stage.H * 0.62, -10, 0.65);

  // drift -> gather (they ring you) -> zap (chain lightning) -> fried -> drift
  let mode = 'drift';
  let modeT = 0;
  let stings = 0;
  let stingAt = -10;
  let arcs = [];
  const setMode = (m, t) => {
    mode = m;
    modeT = t;
  };

  stage.headline('move your mouse');
  stage.on('click', (x, y) => {
    if (mode !== 'drift') return;
    if (jellies.length >= MAX) {
      stage.headline('the sea is full');
      return;
    }
    spawn(x, y, stage.t, 0.55 + stage.rand() * 0.45);
    stage.bump();
    stage.headline(jellies.length >= 7 ? 'bloom' : 'another one');
  });

  const R = (J, t) => 90 * J.size * ease.out(clamp((t - J.grow) / 0.6));
  // contraction: quick squeeze, slow relax
  const squeeze = (ph) => (ph < 0.28 ? Math.sin((ph / 0.28) * (Math.PI / 2)) : 1 - (ph - 0.28) / 0.72);

  // bell-space -> world. u runs along the heading (top of the bell), w across it
  const toWorld = (J, u, w) => {
    const hx = Math.cos(J.a);
    const hy = Math.sin(J.a);
    return [J.x + hx * u - hy * w, J.y + hy * u + hx * w];
  };

  function stepRope(r, n, len, ax, ay, dt, cur) {
    for (let i = 1; i < n; i++) {
      const o = i * 4;
      const x = r[o];
      const y = r[o + 1];
      let vx = (x - r[o + 2]) * 0.965;
      let vy = (y - r[o + 3]) * 0.965;
      // the cursor pushes tentacles out of the way
      const dx = x - cur[0];
      const dy = y - cur[1];
      const d2 = dx * dx + dy * dy;
      if (d2 < 3600 && d2 > 1) {
        const d = Math.sqrt(d2);
        vx += (dx / d) * (60 - d) * 0.08;
        vy += (dy / d) * (60 - d) * 0.08;
      }
      r[o + 2] = x;
      r[o + 3] = y;
      r[o] = x + vx + ax * dt * dt;
      r[o + 1] = y + vy + ay * dt * dt;
    }
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < n; i++) {
        const a = (i - 1) * 4;
        const b = i * 4;
        const dx = r[b] - r[a];
        const dy = r[b + 1] - r[a + 1];
        const d = Math.hypot(dx, dy) || 1;
        const k = (d - len) / d;
        if (i === 1) {
          r[b] -= dx * k;
          r[b + 1] -= dy * k;
        } else {
          r[a] += dx * k * 0.5;
          r[a + 1] += dy * k * 0.5;
          r[b] -= dx * k * 0.5;
          r[b + 1] -= dy * k * 0.5;
        }
      }
    }
  }

  function step(dt, t) {
    const cur = [p.x, p.y];
    const n = jellies.length;

    if (mode === 'drift' && p.still > 1.6 && n >= 3 && p.real) {
      setMode('gather', t);
      stage.headline('uh oh');
    }
    if (mode === 'gather') {
      if (p.speed > 500) {
        setMode('drift', t);
        stage.headline('phew');
      } else if (t - modeT > 1.6) {
        setMode('zap', t);
        stage.shake(26);
        stage.bump();
        stage.headline('ZAP');
      }
    }
    if (mode === 'zap' && t - modeT > 1.3) setMode('fried', t);
    if (mode === 'fried' && t - modeT > 1.6) {
      setMode('drift', t);
      stage.headline('move your mouse');
    }

    jellies.forEach((J, i) => {
      // where it wants to be
      let tx;
      let ty;
      if (mode === 'gather' || mode === 'zap' || mode === 'fried') {
        const ang = (i / n) * Math.PI * 2 + t * 0.4;
        const rr = 230 + 40 * Math.sin(i * 1.7);
        tx = cur[0] + Math.cos(ang) * rr;
        ty = cur[1] + Math.sin(ang) * rr;
      } else {
        const ang = i * 2.39996;
        const rr = 120 + (i % 4) * 70;
        tx = cur[0] + Math.cos(ang) * rr;
        ty = cur[1] + Math.sin(ang) * rr - 60;
      }
      // turn the bell towards it, slowly
      const want = Math.atan2(ty - J.y, tx - J.x);
      J.a += clamp(angleDiff(want, J.a), -1.8 * dt, 1.8 * dt);
      // pulse: thrust only while squeezing
      const prev = J.phase;
      J.phase = (J.phase + dt / (mode === 'gather' ? 0.6 : J.period)) % 1;
      if (mode === 'gather' && prev > J.phase) J.phase = 0; // they sync up
      const sq = squeeze(J.phase);
      if (J.phase < 0.28) {
        const far = clamp(Math.hypot(tx - J.x, ty - J.y) / 300, 0.2, 1.4);
        const thrust = 1700 * far * (0.6 + 0.4 * J.size);
        J.vx += Math.cos(J.a) * thrust * dt;
        J.vy += Math.sin(J.a) * thrust * dt;
      }
      const drag = Math.exp(-1.9 * dt);
      J.vx *= drag;
      J.vy *= drag;
      J.vy += 18 * dt; // slowly sinks between pulses
      J.x += J.vx * dt;
      J.y += J.vy * dt;
      J.sq = sq;

      // tentacles hang off the rim, oral arms off the middle
      const r = R(J, t);
      const bw = r * (1 - 0.22 * sq);
      // a gentle current pulling everything back past the bell
      const ax = -Math.cos(J.a) * 160;
      const ay = -Math.sin(J.a) * 160 + 60;
      J.tent.forEach((rope, k) => {
        const w = lerp(-bw * 0.92, bw * 0.92, k / (TENT - 1));
        const [x0, y0] = toWorld(J, -r * 0.08, w);
        rope[0] = rope[2] = x0;
        rope[1] = rope[3] = y0;
        stepRope(rope, TN, 15 * J.size + 4, ax, ay, dt, cur);
      });
      J.arms.forEach((rope, k) => {
        const w = lerp(-bw * 0.3, bw * 0.3, k / (ARMS - 1));
        const [x0, y0] = toWorld(J, -r * 0.05, w);
        rope[0] = rope[2] = x0;
        rope[1] = rope[3] = y0;
        stepRope(rope, AN, 17 * J.size + 4, ax * 0.8, ay * 0.8, dt, cur);
      });
    });

    // touching a tentacle stings
    if (mode === 'drift' && t - stingAt > 0.8) {
      outer: for (const J of jellies) {
        for (const rope of J.tent) {
          for (let i = 4; i < TN; i += 2) {
            if (Math.hypot(rope[i * 4] - cur[0], rope[i * 4 + 1] - cur[1]) < 22) {
              stings++;
              stingAt = t;
              arcs = [{ from: [rope[i * 4], rope[i * 4 + 1]], to: cur, t0: t, hue: J.hue }];
              stage.shake(8);
              stage.bump();
              stage.headline('ouch');
              break outer;
            }
          }
        }
      }
    }

    // the cursor while it's being electrocuted
    if (mode === 'zap') {
      stage.cursor.override = { x: p.x + (stage.rand() - 0.5) * 10, y: p.y + (stage.rand() - 0.5) * 10, size: 1, fill: stage.rand() < 0.5 ? '#fff' : '#000', stroke: stage.rand() < 0.5 ? '#9ef' : '#fff' };
    } else if (mode === 'fried') {
      stage.cursor.override = { x: p.x, y: p.y, size: 1, fill: '#1a1a1a', stroke: '#777', angle: Math.sin(t * 30) * 0.08 };
    } else stage.cursor.override = null;
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawSea(g, t) {
    g.fillStyle = 'rgba(200,240,255,0.35)';
    for (let i = 0; i < 80; i++) {
      const y = ((hash(i, 1) * (stage.H + 200) - (t + 30) * (8 + hash(i, 2) * 14)) % (stage.H + 200) + stage.H + 200) % (stage.H + 200) - 100;
      const x = hash(i, 3) * stage.W + Math.sin(t * 0.5 + i) * 18;
      dot(g, x, y, 1 + hash(i, 4) * 2.2);
    }
  }

  function strokeRope(g, rope, n, w0, w1) {
    for (let i = 1; i < n; i++) {
      g.lineWidth = lerp(w0, w1, i / n);
      g.beginPath();
      g.moveTo(rope[(i - 1) * 4], rope[(i - 1) * 4 + 1]);
      g.lineTo(rope[i * 4], rope[i * 4 + 1]);
      g.stroke();
    }
  }

  // how brightly each jelly is glowing right now (they flash when they zap)
  const glowOf = (J, t) => {
    if (mode === 'zap') return 1 + 0.8 * Math.max(0, Math.sin(t * 40 + J.k));
    if (mode === 'gather') return 0.8 + 0.4 * (1 - J.phase);
    return 0.75 + 0.25 * J.sq;
  };

  function drawTentacles(g, t) {
    g.lineCap = 'round';
    for (const J of jellies) {
      const L = glowOf(J, t);
      g.strokeStyle = `hsla(${J.hue}, 90%, ${Math.min(90, 60 + 20 * L)}%, ${0.5 * Math.min(1.4, L)})`;
      for (const rope of J.tent) strokeRope(g, rope, TN, 2.2 * J.size + 0.6, 0.6);
      g.strokeStyle = `hsla(${J.hue}, 80%, 75%, ${0.28 * Math.min(1.4, L)})`;
      for (const rope of J.arms) strokeRope(g, rope, AN, 12 * J.size, 3);
    }
  }

  function drawBells(g, t) {
    for (const J of jellies) {
      const r = R(J, t);
      if (r < 2) continue;
      const sq = J.sq || 0;
      const bw = r * (1 - 0.22 * sq);
      const bh = r * 0.95 * (1 + 0.2 * sq);
      const L = glowOf(J, t);
      g.save();
      g.translate(J.x, J.y);
      g.rotate(J.a + Math.PI / 2); // local -y is the top of the bell
      // dome + scalloped rim
      g.beginPath();
      g.moveTo(-bw, 0);
      g.bezierCurveTo(-bw, -bh * 1.1, bw, -bh * 1.1, bw, 0);
      const sc = 8;
      for (let k = sc; k > 0; k--) {
        const x1 = lerp(-bw, bw, (k - 1) / sc);
        const xm = lerp(-bw, bw, (k - 0.5) / sc);
        g.quadraticCurveTo(xm, r * 0.12, x1, 0);
      }
      g.closePath();
      const grad = g.createRadialGradient(0, -bh * 0.45, 0, 0, -bh * 0.3, bw * 1.1);
      grad.addColorStop(0, `hsla(${J.hue}, 100%, 85%, ${Math.min(0.9, 0.5 * L)})`);
      grad.addColorStop(0.55, `hsla(${J.hue}, 90%, 60%, ${0.22 * L})`);
      grad.addColorStop(1, `hsla(${J.hue}, 90%, 50%, ${0.08 * L})`);
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = `hsla(${J.hue}, 100%, 80%, ${Math.min(1, 0.75 * L)})`;
      g.lineWidth = 2.6;
      g.stroke();
      // the four-leaf clover inside (like a moon jelly)
      g.strokeStyle = `hsla(${J.hue}, 100%, 88%, ${Math.min(1, 0.55 * L)})`;
      g.lineWidth = 2.4;
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
        g.beginPath();
        g.ellipse(Math.cos(ang) * bw * 0.22, -bh * 0.42 + Math.sin(ang) * bh * 0.14, bw * 0.15, bh * 0.1, ang, 0, Math.PI * 2);
        g.stroke();
      }
      // a highlight
      g.strokeStyle = `rgba(255,255,255,${0.35 * Math.min(1, L)})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, -bh * 0.1, bw * 0.75, Math.PI * 1.15, Math.PI * 1.4);
      g.stroke();
      g.restore();
    }
  }

  // jagged lightning
  function bolt(g, a, b, hue, w) {
    const pts = [a];
    const n = 9;
    const d = unit(b[0] - a[0], b[1] - a[1]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const off = (stage.rand() - 0.5) * len * 0.18;
      pts.push([lerp(a[0], b[0], f) - d[1] * off, lerp(a[1], b[1], f) + d[0] * off]);
    }
    pts.push(b);
    for (const [lw, col] of [
      [w * 4, `hsla(${hue}, 100%, 70%, 0.35)`],
      [w, 'rgba(255,255,255,0.95)'],
    ]) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
      g.stroke();
    }
  }

  function drawZap(g, t) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const a of arcs) if (t - a.t0 < 0.25) bolt(g, a.from, [p.x, p.y], a.hue, 2.5);
    if (mode === 'zap') {
      // jelly to jelly round the ring, and every one of them into the cursor
      const q = t - modeT;
      jellies.forEach((J, i) => {
        const N = jellies[(i + 1) % jellies.length];
        if (stage.rand() < 0.7) bolt(g, [J.x, J.y], [N.x, N.y], J.hue, 2);
        if (q > 0.15 && stage.rand() < 0.8) bolt(g, [J.x, J.y], [p.x, p.y], J.hue, 3);
      });
      // the whole sea lights up
      g.fillStyle = `rgba(160,230,255,${0.18 * Math.max(0, 1 - q / 1.3) * (0.5 + 0.5 * Math.sin(t * 50))})`;
      g.fillRect(-300, -300, stage.W + 600, stage.H + 600);
    }
    if (mode === 'fried') {
      // smoke off the cursor
      for (let k = 0; k < 6; k++) {
        const s = (t - modeT - k * 0.12) % 1.2;
        if (s < 0) continue;
        g.fillStyle = `rgba(140,140,150,${0.3 * (1 - s / 1.2)})`;
        dot(g, p.x + 14 + Math.sin(s * 5 + k) * 10, p.y - s * 160, 8 + s * 22);
      }
    }
  }

  function draw(ctx, t) {
    drawSea(ctx.sea, t);
    drawTentacles(ctx.tentacles, t);
    drawBells(ctx.bells, t);
    drawZap(ctx.zap, t);
    const state = mode === 'zap' ? 'ZAPPING' : mode === 'fried' ? 'cursor fried' : mode === 'gather' ? 'surrounding you' : 'drifting';
    stage.stats(`jellies ${jellies.length} · stings ${stings} · ${state}`);
  }

  return { step, draw };
}
