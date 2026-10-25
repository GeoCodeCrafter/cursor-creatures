// moths that think your cursor is a lamp. they spiral round it, and if you keep
// still they land on it. click to switch the light off and on.
// switch it off twice and something much bigger notices the light.

import { dot } from '../kit/stage.js';
import { angleDiff, approach, clamp, ease, hash, lerp, unit } from '../kit/math.js';

export const meta = {
  file: 'moths.js',
  hint: 'click: light on/off · keep still and they land',
  layers: [
    { name: 'light', blend: 'screen' },
    { name: 'moths' },
    { name: 'dark' },
    { name: 'big' },
  ],
  vars: {
    bg: '#07060a',
    dot: 'rgba(255,230,190,0.05)',
    ghost: 'rgba(255,235,200,0.12)',
    ink: 'rgba(255,235,210,0.5)',
    accent: 'rgba(255,214,150,0.95)',
  },
  ripple: 'rgba(255,230,180,0.8)',
};

const N = 110;
const COLS = [
  [196, 176, 140],
  [150, 128, 104],
  [222, 210, 186],
  [120, 104, 92],
  [176, 150, 120],
];

export function create(stage) {
  const p = stage.pointer;
  const moths = Array.from({ length: N }, (_, i) => {
    const a = stage.rand() * Math.PI * 2;
    const r = 80 + stage.rand() * 400;
    return {
      x: p.x + Math.cos(a) * r,
      y: p.y + Math.sin(a) * r,
      vx: 0,
      vy: 0,
      th: a,
      w: (stage.rand() < 0.5 ? -1 : 1) * (1.5 + stage.rand() * 2.5),
      r: 50 + Math.pow(stage.rand(), 1.6) * 330,
      size: 0.7 + stage.rand() * 0.7,
      flap: stage.rand() * 10,
      col: COLS[i % COLS.length],
      spots: stage.rand() < 0.35,
      dive: 0,
      land: null, // [dx, dy] spot on the cursor once it has landed
      wander: [p.x, p.y],
      heading: a,
    };
  });

  let light = true;
  let lightLevel = 1;
  let clicks = 0;
  let landed = 0;
  // the big one: null | 'eyes' (watching from the dark) | 'here' | 'leave'
  let big = null;
  let bigT = 0;
  let bigPos = [0, 0];
  let gone = null; // when the cursor has been carried off

  stage.headline('move your mouse');

  stage.on('click', () => {
    const t = stage.t;
    if (big === 'here' || big === 'leave' || gone) return;
    light = !light;
    clicks++;
    stage.bump();
    if (!light) {
      for (const m of moths) {
        m.land = null;
        m.wander = [stage.rand() * stage.W, stage.rand() * stage.H];
      }
      landed = 0;
      if (clicks >= 3) {
        big = 'eyes';
        bigT = t;
        stage.headline('something is out there');
      } else stage.headline('lights out');
    } else if (big === 'eyes') {
      // lights on, and it's right there
      big = 'here';
      bigT = t;
      bigPos = [p.x, p.y - 40];
      stage.shake(30);
      stage.headline('oh no.');
    } else stage.headline('lights on');
  });

  function step(dt, t) {
    const cur = [p.x, p.y];
    lightLevel = approach(lightLevel, light && !gone ? 1 : 0, light ? 10 : 18, dt);

    // the big one carries the light away, then lets it go again
    if (big === 'here' && t - bigT > 2.2) {
      big = 'leave';
      bigT = t;
      gone = { t0: t };
      stage.cursor.hidden = true;
    }
    if (big === 'leave') {
      bigPos = [bigPos[0] + Math.sin((t - bigT) * 3) * 4, bigPos[1] - 900 * dt * ease.in(clamp((t - bigT) / 0.6))];
      if (t - bigT > 2.4) {
        big = null;
        gone = null;
        clicks = 0;
        light = true;
        stage.cursor.hidden = false;
        stage.headline('move your mouse');
      }
    }

    // keep still in the light and they land on you, one by one
    const settling = light && !big && !gone && p.still > 1.8 && p.real;
    if (settling) {
      const want = Math.min(N, Math.floor((p.still - 1.8) * 26));
      while (landed < want) {
        const m = moths[landed];
        const a = stage.rand() * Math.PI * 2;
        const rr = Math.sqrt(stage.rand()) * 36;
        m.land = [Math.cos(a) * rr + 8, Math.sin(a) * rr + 14];
        landed++;
      }
      if (landed > 40) stage.headline("where's my cursor?");
    } else if (landed > 0) {
      // you moved: they all burst off
      for (const m of moths) {
        if (!m.land) continue;
        const a = Math.atan2(m.land[1], m.land[0]);
        m.vx = Math.cos(a) * 900;
        m.vy = Math.sin(a) * 900;
        m.land = null;
      }
      landed = 0;
      stage.shake(6);
      if (light && !big) stage.headline('move your mouse');
    }

    for (const m of moths) {
      m.flap += dt * (m.land ? 2 : 28 + m.size * 6);
      if (m.land) {
        m.x = cur[0] + m.land[0];
        m.y = cur[1] + m.land[1];
        continue;
      }
      let tx;
      let ty;
      let k = 9;
      if (big === 'here' || big === 'leave') {
        // everything flees from the big one
        const d = unit(m.x - bigPos[0], m.y - bigPos[1]);
        tx = m.x + d[0] * 400;
        ty = m.y + d[1] * 400;
        k = 6;
      } else if (lightLevel > 0.5) {
        // spiral round the light, now and then diving right into it
        m.th += m.w * dt;
        if (m.dive <= 0 && stage.rand() < dt * 0.25) m.dive = 0.5;
        m.dive -= dt;
        const r = m.dive > 0 ? 8 : m.r + Math.sin(t * 2 + m.th * 3) * 30;
        tx = cur[0] + Math.cos(m.th) * r;
        ty = cur[1] + Math.sin(m.th) * r * 0.8;
      } else {
        // dark: they flutter about aimlessly
        if (stage.rand() < dt * 0.6) m.wander = [stage.rand() * stage.W, stage.rand() * stage.H];
        tx = m.wander[0];
        ty = m.wander[1];
        k = 2;
      }
      // erratic: a twitchy random kick every step
      const jx = (stage.rand() - 0.5) * 9000;
      const jy = (stage.rand() - 0.5) * 9000;
      m.vx += ((tx - m.x) * k - m.vx * 2.4 + jx) * dt;
      m.vy += ((ty - m.y) * k - m.vy * 2.4 + jy) * dt;
      const sp = Math.hypot(m.vx, m.vy);
      if (sp > 1100) {
        m.vx *= 1100 / sp;
        m.vy *= 1100 / sp;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (sp > 30) m.heading += clamp(angleDiff(Math.atan2(m.vy, m.vx), m.heading), -12 * dt, 12 * dt);
    }

    if (gone) stage.cursor.override = null;
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  // a moth seen from above. open = 1 wings spread, 0 folded flat over its back
  function moth(g, x, y, heading, size, open, col, spots, alpha = 1, shade = 1) {
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.rotate(heading + Math.PI / 2); // local -y = forwards
    g.scale(size, size);
    const c = (k) => `rgb(${col.map((v) => Math.round(v * k * shade)).join(',')})`;
    for (const s of [-1, 1]) {
      const spread = lerp(0.18, 1, open);
      // forewing
      g.fillStyle = c(1);
      g.beginPath();
      g.moveTo(0, -4);
      g.quadraticCurveTo(s * 20 * spread, -16, s * 26 * spread, -2 + (1 - spread) * 10);
      g.quadraticCurveTo(s * 18 * spread, 6, 0, 3);
      g.fill();
      // hindwing
      g.fillStyle = c(0.82);
      g.beginPath();
      g.moveTo(0, 2);
      g.quadraticCurveTo(s * 18 * spread, 4, s * 15 * spread, 13);
      g.quadraticCurveTo(s * 6 * spread, 16, 0, 9);
      g.fill();
      if (spots && open > 0.5) {
        g.fillStyle = c(0.45);
        dot(g, s * 13 * spread, -5, 2.6);
      }
    }
    // furry body + antennae
    g.fillStyle = c(0.6);
    g.beginPath();
    g.ellipse(0, 2, 3.4, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = c(0.5);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-1, -6);
    g.quadraticCurveTo(-5, -12, -8, -13);
    g.moveTo(1, -6);
    g.quadraticCurveTo(5, -12, 8, -13);
    g.stroke();
    g.restore();
  }

  // the big one gets its own drawing: veined wings, eye spots, feathery antennae
  function bigMoth(g, x, y, size, open, t) {
    g.save();
    g.translate(x, y);
    g.scale(size, size);
    g.shadowColor = 'rgba(0,0,0,0.8)';
    g.shadowBlur = 30;
    for (const s of [-1, 1]) {
      const sp = lerp(0.3, 1, open);
      const fore = new Path2D();
      fore.moveTo(0, -4);
      fore.bezierCurveTo(s * 8 * sp, -18, s * 24 * sp, -20, s * 30 * sp, -8);
      fore.bezierCurveTo(s * 31 * sp, -2, s * 22 * sp, 6, 0, 3);
      const hind = new Path2D();
      hind.moveTo(0, 2);
      hind.bezierCurveTo(s * 18 * sp, 2, s * 22 * sp, 12, s * 16 * sp, 17);
      hind.bezierCurveTo(s * 10 * sp, 21, s * 3 * sp, 15, 0, 9);
      const gr = g.createLinearGradient(0, 0, s * 30 * sp, 0);
      gr.addColorStop(0, '#5a4a40');
      gr.addColorStop(0.7, '#3a2f2a');
      gr.addColorStop(1, '#1a1412');
      g.fillStyle = gr;
      g.fill(hind);
      g.fill(fore);
      g.shadowBlur = 0;
      // veins
      g.strokeStyle = 'rgba(20,14,12,0.7)';
      g.lineWidth = 0.35;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.moveTo(0, -2);
        g.quadraticCurveTo(s * (6 + k * 4) * sp, -12 + k * 2, s * (14 + k * 4) * sp, -14 + k * 4.5);
        g.stroke();
      }
      // eye spots that look back at you
      for (const [ex, ey, r] of [[19, -7, 4.4], [12, 11, 3.2]]) {
        g.fillStyle = '#2a1e1a';
        dot(g, s * ex * sp, ey, r);
        g.fillStyle = '#8a6a4a';
        dot(g, s * ex * sp, ey, r * 0.62);
        g.fillStyle = '#120c0a';
        dot(g, s * ex * sp, ey, r * 0.34);
      }
    }
    // furry thorax + abdomen
    g.fillStyle = '#2e2420';
    g.beginPath();
    g.ellipse(0, -1, 4.6, 7, 0, 0, Math.PI * 2);
    g.ellipse(0, 9, 3.4, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,96,80,0.5)';
    g.lineWidth = 0.4;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(-3, 4 + k * 2.4);
      g.lineTo(3, 4 + k * 2.4);
      g.stroke();
    }
    // feathery antennae
    g.strokeStyle = '#3a2f2a';
    for (const s of [-1, 1]) {
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(s * 1.5, -7);
      g.quadraticCurveTo(s * 5, -14 - Math.sin(t * 3) * 0.6, s * 9, -16);
      g.stroke();
      g.lineWidth = 0.3;
      for (let k = 1; k < 8; k++) {
        const u = k / 8;
        const ax = s * lerp(1.5, 9, u);
        const ay = lerp(-7, -16, u);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(ax + s * 1.6, ay + 1.4);
        g.moveTo(ax, ay);
        g.lineTo(ax - s * 0.6, ay - 1.8);
        g.stroke();
      }
    }
    g.restore();
  }

  function drawLight(g, t) {
    if (lightLevel < 0.01) return;
    const flicker = 1 - 0.04 * Math.sin(t * 37) * Math.sin(t * 13);
    const R = 460;
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
    gr.addColorStop(0, `rgba(255,236,190,${0.55 * lightLevel * flicker})`);
    gr.addColorStop(0.25, `rgba(255,200,120,${0.22 * lightLevel * flicker})`);
    gr.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = gr;
    g.fillRect(p.x - R, p.y - R, R * 2, R * 2);
  }

  function drawMoths(g, t) {
    const lit = 0.35 + 0.65 * lightLevel;
    // the ones on the cursor go on top, so the pile looks piled
    for (const m of moths) if (!m.land) moth(g, m.x, m.y, m.heading, m.size * 1.15, 0.5 + 0.5 * Math.sin(m.flap), m.col, m.spots, 1, lit * (0.7 + 0.3 * clamp(1 - Math.hypot(m.x - p.x, m.y - p.y) / 600)));
    for (const m of moths) if (m.land) moth(g, m.x, m.y, Math.atan2(m.land[1], m.land[0]) + Math.PI / 2, m.size * 1.15, 0.15 + 0.1 * Math.sin(m.flap), m.col, m.spots, 1, lit);
  }

  function drawBig(g, t) {
    if (big === 'eyes') {
      // two red eyes, far off in the dark, blinking
      const q = clamp((t - bigT - 0.6) / 0.8);
      const ex = stage.W * 0.72;
      const ey = stage.H * 0.22;
      const blink = (t - bigT) % 3.1 < 0.12 ? 0.15 : 1;
      g.fillStyle = `rgba(255,30,30,${0.9 * q})`;
      g.shadowColor = 'rgba(255,0,0,0.9)';
      g.shadowBlur = 24;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(ex + s * 26, ey, 9, 7 * blink, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.shadowBlur = 0;
      return;
    }
    if (big !== 'here' && big !== 'leave') return;
    // the big one, wings spread over the light
    const q = ease.out(clamp((t - bigT) / 0.5));
    const flap = big === 'leave' ? 0.6 + 0.4 * Math.sin((t - bigT) * 14) : 0.85 + 0.15 * Math.sin((t - bigT) * 3);
    const size = 16 * (0.5 + 0.5 * q);
    bigMoth(g, bigPos[0], bigPos[1], size, flap, t);
    // eyes
    g.fillStyle = '#ff2a2a';
    g.shadowColor = 'rgba(255,0,0,1)';
    g.shadowBlur = 40;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(bigPos[0] + s * 4.5 * size, bigPos[1] - 6.5 * size, 1.6 * size, 1.1 * size, s * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.shadowBlur = 0;
    // it has your cursor
    if (big === 'leave') stage.drawArrow(g, bigPos[0], bigPos[1] + 4 * size, { size: 1.2, angle: Math.sin(t * 6) * 0.3 });
  }

  function drawDark(g) {
    const d = 1 - lightLevel;
    if (d < 0.01) return;
    g.fillStyle = `rgba(0,0,0,${0.55 * d})`;
    g.fillRect(-300, -300, stage.W + 600, stage.H + 600);
  }

  function draw(ctx, t) {
    drawLight(ctx.light, t);
    drawMoths(ctx.moths, t);
    drawDark(ctx.dark);
    drawBig(ctx.big, t);
    const status = gone ? 'the light is gone' : big === 'here' ? '??????' : `on your cursor ${landed} · light ${light ? 'on' : 'off'}`;
    stage.stats(`moths ${N} · ${status}`);
  }

  return { step, draw };
}
