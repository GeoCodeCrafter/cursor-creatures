// a skeleton murder hornet. it buzzes round your cursor and stings it, and every sting
// makes the cursor swell up: puffier, redder, throbbing, and the "pointer size" slider
// moves along with it. four stings in, the rest of the nest turns up. one sting too many
// and it pops like a balloon. click to swat them.

import { dot, line } from '../kit/stage.js';
import { clamp, ease } from '../kit/math.js';
import { add, ARROW, ARROW_PTS, arrowScale, mix, nrm, sub } from '../kit/body.js';

const AMBER = 'hsl(38, 100%, 72%)';
const HEADC = 'hsla(26, 100%, 55%, 0.55)';
const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const COND = "'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif";
const HORNETS = 7;
const MID = [10.25, 16]; // the arrow's middle, in arrow units (it swells round this)

export const meta = {
  file: 'hornet.js',
  hint: 'click to swat them',
  layers: [{ name: 'ui' }, { name: 'cursor' }, { name: 'fx' }, { name: 'hornets', glow: 'rgba(255,150,40,0.4)', blur: 10 }],
  vars: { accent: 'rgba(255,176,32,0.95)' },
  ripple: 'rgba(255,210,140,0.8)',
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
const swellColor = (S) => {
  const u = clamp((S - 1) / 12);
  return `rgb(255, ${Math.round(255 - 190 * Math.pow(u, 0.7))}, ${Math.round(255 - 200 * Math.pow(u, 0.6))})`;
};

export function create(stage) {
  const p = stage.pointer;
  stage.cursor.hidden = true;
  const spawn = (i) => {
    const a = i * 2.1 + 0.4;
    return [stage.W / 2 + Math.cos(a) * stage.W * 0.75, stage.H / 2 + Math.sin(a) * stage.H * 0.75];
  };
  const hs = Array.from({ length: HORNETS }, (_, i) => {
    const q = i === 0 ? [stage.W * 0.7, stage.H * 0.3] : spawn(i);
    return { x: q[0], y: q[1], vx: 0, vy: 0, hx: 0, hy: -1, sx: 0, sy: -1, ph: i * 1.7, here: i === 0, sting: null, next: 2 + i * 0.3, knock: -10, sc: i === 0 ? 1.3 : 1 };
  });

  let S = 1;
  let swellFrom = 1;
  let swellAt = -10;
  let swellTo = 1;
  let stings = []; // welts { on }
  const fx = []; // sting bursts { at, p }
  let swarm = false;
  let popAt = -10;
  let popP = [0, 0];
  let landedAt = -10;
  let healAt = -10;
  let saidAt = -10;
  const say = (s) => {
    stage.headline(s);
    saidAt = stage.t;
  };
  stage.headline('move your mouse');

  const landed = () => [stage.W * 0.62, stage.H * 0.84];
  const k0 = () => arrowScale(stage);
  // where the arrow is: its middle, its scale and its tip
  const arrowNow = (t) => {
    const k = k0() * S;
    let c = add([p.x, p.y], MID, k0());
    if (popAt > 0) {
      const u = Math.min(1, (t - popAt) / 1.4);
      const L = landed();
      const loops = [Math.sin(u * 13) * stage.W * 0.25 * (1 - u * 0.7) + Math.sin(u * 29) * 50, Math.cos(u * 9.5) * stage.H * 0.25 * (1 - u * 0.6) - 160 * Math.sin(u * Math.PI)];
      const base = [popP[0] + (L[0] - popP[0]) * u * u, popP[1] + (L[1] - popP[1]) * u * u];
      c = u >= 1 ? L : add(base, loops, Math.sin(u * Math.PI));
      // healed: it floats back up to where you are
      if (healAt > 0) c = mix(L, add([p.x, p.y], MID, k0()), ease.inOut(clamp((t - healAt) / 0.5)));
    }
    return { c, k, tip: [c[0] - MID[0] * k, c[1] - MID[1] * k] };
  };
  const onArrow = (t, q) => {
    const a = arrowNow(t);
    return [a.tip[0] + q[0] * a.k, a.tip[1] + q[1] * a.k];
  };
  const pickSpot = () => {
    for (let k = 0; k < 50; k++) {
      const q = [1 + Math.random() * 18, 2 + Math.random() * 28];
      if (inside(q[0], q[1])) return q;
    }
    return [6, 15];
  };

  stage.on('click', (x, y) => {
    const t = stage.t;
    let hit = false;
    for (const h of hs) {
      if (!h.here) continue;
      if (Math.hypot(h.x - x, h.y - y) < 95 * h.sc) {
        h.knock = t;
        const d = nrm(sub([h.x, h.y], [x, y]));
        h.vx = d[0] * 2600;
        h.vy = d[1] * 2600;
        h.sting = null;
        h.next = t + 1.6;
        hit = true;
      }
    }
    if (popAt < 0) say(hit ? 'swat.' : 'missed.');
  });

  function step(dt, t) {
    // the swelling eases to its new size after each sting
    if (popAt < 0) S = swellFrom + (swellTo - swellFrom) * ease.out(clamp((t - swellAt) / 0.25));
    else {
      const s = t - popAt;
      S = healAt > 0 ? 0.7 + 0.3 * ease.out(clamp((t - healAt) / 0.5)) : s < 0.15 ? 16 - 6 * ease.out(s / 0.15) : s < 0.75 ? 10 - 5.5 * ((s - 0.15) / 0.6) : 4.5 - 3.8 * ease.in(clamp((s - 0.75) / 0.65));
    }
    if (popAt > 0 && landedAt < 0 && t - popAt > 1.4) {
      landedAt = t;
      stage.shake(8);
      say("it's fine.");
    }
    if (landedAt > 0 && healAt < 0 && t - landedAt > 2.5) healAt = t;
    if (healAt > 0 && t - healAt > 0.5) {
      popAt = -10;
      landedAt = -10;
      healAt = -10;
      S = swellFrom = swellTo = 1;
      stings = [];
      swarm = false;
      for (let i = 1; i < HORNETS; i++) hs[i].here = false;
      hs[0].next = t + 2;
    }

    const a = arrowNow(t);
    hs.forEach((h, i) => {
      if (i > 0 && swarm && !h.here) {
        h.here = true;
        h.next = t + 0.6 + Math.random() * 1.2;
      }
      h.ph += dt * (1.1 + i * 0.13);
      let target;
      let k = 22;
      if (!h.here) target = spawn(i);
      else if (h.sting) {
        // dive in and settle on the spot, sting end first
        const spot = onArrow(t, h.sting.on);
        if (t < h.sting.at - 0.4) {
          const d = nrm(sub([h.x, h.y], spot));
          h.sx = d[0];
          h.sy = d[1];
        }
        target = add(spot, [h.sx, h.sy], 98 * h.sc);
        k = 90;
        if (t >= h.sting.at) {
          // the sting goes in
          stings.push({ on: h.sting.on });
          fx.push({ at: t, p: spot });
          stage.bump();
          if (popAt < 0) {
            if (S >= 13.5) {
              popAt = t;
              popP = a.c;
              stage.shake(30);
              say('');
              for (const o of hs) o.sting = null;
            } else {
              swellFrom = S;
              swellTo = S < 3.2 ? [1.45, 1.9, 2.5, 3.2].find((v) => v > S + 0.01) ?? 3.2 : S * 1.3;
              swellAt = t;
              stage.shake(swellTo > 8 ? 9 : 6);
              if (stings.length === 1) say("it's fine.");
              if (stings.length === 4 && !swarm) {
                swarm = true;
                say('oh no.');
              }
              if (swellTo > 10) say('');
            }
          }
          h.sting = null;
          h.next = t + (i === 0 && !swarm ? 1.8 + Math.random() * 0.7 : 0.5 + Math.random() * 1.1);
        }
      } else if (popAt > 0) {
        // scattered by the pop; then hovering, wary
        const ang = i * 2.7 + h.ph * 0.3;
        target = t - popAt < 0.6 ? add(popP, [Math.cos(i * 2.7), Math.sin(i * 2.7)], 700) : add(a.c, [Math.cos(ang), Math.sin(ang) * 0.7], 300 + i * 25);
        k = 14;
      } else {
        // orbit the cursor, further out the bigger it gets
        const R = 200 + 45 * Math.pow(S, 0.75) + i * 18;
        target = add(a.c, [Math.cos(h.ph + i), Math.sin(h.ph * 1.3 + i) * 0.8], R);
        target = [clamp(target[0], 80, stage.W - 80), clamp(target[1], 120, stage.H - 80)];
        if (p.real && t > h.next && t - h.knock > 1.2) h.sting = { at: t + 0.45, on: pickSpot() };
      }
      // knocked flying by a swat: no spring for a moment
      const swatted = t - h.knock < 0.35;
      const c = 2 * Math.sqrt(k);
      if (!swatted) {
        h.vx += ((target[0] - h.x) * k - h.vx * c + (Math.random() - 0.5) * 2600) * dt;
        h.vy += ((target[1] - h.y) * k - h.vy * c + (Math.random() - 0.5) * 2600) * dt;
      } else {
        h.vx *= Math.exp(-3 * dt);
        h.vy *= Math.exp(-3 * dt);
      }
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      const want = h.sting && t >= h.sting.at - 0.25 ? [h.sx, h.sy] : Math.hypot(h.vx, h.vy) > 60 ? nrm([h.vx, h.vy]) : [h.hx, h.hy];
      const m = 1 - Math.exp(-10 * dt);
      const hh = nrm([h.hx + (want[0] - h.hx) * m, h.hy + (want[1] - h.hy) * m]);
      h.hx = hh[0];
      h.hy = hh[1];
      if (swatted) {
        const sp = (t - h.knock) * 30;
        h.hx = Math.cos(sp);
        h.hy = Math.sin(sp);
      }
    });
    while (fx.length && t - fx[0].at > 0.3) fx.shift();
    if (saidAt > 0 && t - saidAt > 1.6 && stings.length === 0) {
      stage.headline('move your mouse');
      saidAt = -10;
    }
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawSlider(g, t) {
    const T = { x: stage.W * 0.08, y: Math.max(200, stage.H * 0.2), w: stage.W * 0.84 };
    const kx = T.x + ((S - 1) / 3) * T.w;
    const last = fx.length ? fx[fx.length - 1].at : -10;
    const bump = Math.max(0, 1 - (t - last) / 0.3);
    const over = S > 4;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = `600 ${Math.min(40, stage.W / 26)}px ${SANS}`;
    g.fillText('Pointer size', T.x, T.y - 48);
    g.save();
    g.translate(T.x + T.w, T.y - 44);
    g.scale(1 + 0.15 * bump, 1 + 0.15 * bump);
    g.textAlign = 'right';
    g.fillStyle = over ? '#ff5a5a' : S > 1.3 ? '#ffb020' : '#fff';
    g.font = `800 ${Math.min(60, stage.W / 17)}px ${COND}`;
    g.fillText(`${Math.round(S * 100)}%`, 0, 0);
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.roundRect(T.x, T.y - 6, T.w, 12, 6);
    g.fill();
    g.fillStyle = over ? '#ff5a5a' : '#ffb020';
    g.beginPath();
    g.roundRect(T.x, T.y - 6, Math.max(0, Math.min(kx, stage.W + 200) - T.x), 12, 6);
    g.fill();
    g.beginPath();
    g.arc(kx, T.y, 24 * (1 + 0.2 * bump), 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = `500 ${Math.min(30, stage.W / 34)}px ${SANS}`;
    g.fillText('Normal', T.x, T.y + 54);
    g.textAlign = 'right';
    g.fillText('Large', T.x + T.w, T.y + 54);
  }

  function drawCursor(g, t) {
    const a = arrowNow(t);
    const popped = popAt > 0 && healAt < 0;
    const puff = popped ? 0.8 : Math.min(5.5, (S - 1) * 1.4);
    const throb = popped ? 1 : 1 + 0.035 * Math.sin(t * 9) * clamp((S - 1.5) / 3);
    const s = t - popAt;
    const fill = popped ? `rgb(255, ${Math.round(140 + 80 * clamp(s / 1.2))}, ${Math.round(140 + 80 * clamp(s / 1.2))})` : S > 1.01 ? swellColor(S) : '#000';
    const spin = popped ? s * 15 * (1 - clamp(s / 1.4)) : 0;
    // deflated: wrinkly
    const wr = popped ? clamp(s / 0.6) : 0;
    let shape = ARROW;
    if (popped) {
      shape = new Path2D();
      let j = 0;
      ARROW_PTS.forEach((q0, i) => {
        const q1 = ARROW_PTS[(i + 1) % ARROW_PTS.length];
        for (let k = 0; k < 6; k++, j++) {
          const m = mix(q0, q1, k / 6);
          const w = Math.sin(j * 2.3 + t * 40) * 0.55 * wr;
          if (j) shape.lineTo(m[0] + w, m[1] + w * 0.8);
          else shape.moveTo(m[0] + w, m[1] + w * 0.8);
        }
      });
      shape.closePath();
    }
    g.save();
    if (S > 2 && !popped) {
      g.shadowColor = 'rgba(255,60,60,0.45)';
      g.shadowBlur = 10 + S * 3;
    }
    g.translate(a.c[0], a.c[1]);
    g.rotate(spin);
    g.scale(throb, throb);
    g.translate(-a.c[0], -a.c[1]);
    g.translate(a.tip[0], a.tip[1]);
    g.scale(a.k, a.k);
    g.lineJoin = 'round';
    g.fillStyle = fill;
    g.strokeStyle = S > 1.01 || popped ? '#000' : '#fff';
    g.lineWidth = puff + 2.2 / Math.max(0.5, S);
    g.fill(shape);
    g.stroke(shape);
    g.shadowBlur = 0;
    if (puff > 0.05) {
      g.strokeStyle = fill;
      g.lineWidth = puff;
      g.fill(shape);
      g.stroke(shape);
    }
    if (!popped) {
      // welts where it was stung
      for (const w of stings) {
        g.globalAlpha = 0.8;
        g.fillStyle = '#d4232b';
        dot(g, w.on[0], w.on[1], 1.3 + 0.25 * puff);
        g.globalAlpha = 1;
        g.fillStyle = '#2a0306';
        dot(g, w.on[0], w.on[1], 0.5);
      }
      if (S > 1.5) {
        g.save();
        g.translate(5, 9);
        g.rotate(-0.42);
        g.globalAlpha = 0.45;
        g.fillStyle = '#fff';
        g.beginPath();
        g.ellipse(0, 0, 1.6 + puff * 0.35, 4 + puff * 0.4, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    g.restore();
  }

  function drawFx(g, t) {
    for (const f of fx) {
      const a = t - f.at;
      g.globalAlpha = 1 - a / 0.3;
      g.strokeStyle = '#ff4d4d';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(f.p[0], f.p[1], 10 + 70 * clamp(a / 0.2), 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#fff';
      g.lineWidth = 4;
      g.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const p0 = add(f.p, [Math.cos(ang), Math.sin(ang)], 14 + 40 * clamp(a / 0.15));
        line(g, [p0, add(p0, [Math.cos(ang), Math.sin(ang)], 18)]);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    // the pop: a flash, a ring, and bits flying
    const s = t - popAt;
    if (popAt > 0 && s < 0.6) {
      g.globalAlpha = 1 - clamp(s / 0.15);
      g.fillStyle = '#ffe8e8';
      dot(g, popP[0], popP[1], 300 * clamp(s / 0.08));
      g.globalAlpha = 1 - clamp(s / 0.3);
      g.strokeStyle = '#fff';
      g.lineWidth = 14;
      g.beginPath();
      g.arc(popP[0], popP[1], 60 + 900 * clamp(s / 0.3), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1 - s / 0.6;
      g.lineWidth = 8;
      g.lineCap = 'round';
      for (let k = 0; k < 22; k++) {
        const a = k * 2.39;
        const d = (400 + ((k * 0.61) % 1) * 700) * s;
        const q = add(popP, [Math.cos(a), Math.sin(a)], d + 120);
        const r = s * 20 + k;
        g.strokeStyle = k % 3 ? '#ff5a5a' : '#fff';
        line(g, [q, add(q, [Math.cos(a + r), Math.sin(a + r)], 26)]);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }

  function drawHornet(g, h, t, i) {
    const f = [h.hx, h.hy];
    const n = [-f[1], f[0]];
    const sc = h.sc;
    const P = (x, y) => [h.x + (f[0] * x + n[0] * y) * sc, h.y + (f[1] * x + n[1] * y) * sc];
    const ang = Math.atan2(f[1], f[0]);
    const el = (x, y, rx, ry, rot, fill, stroke, w) => {
      const c = P(x, y);
      g.beginPath();
      g.ellipse(c[0], c[1], rx * sc, ry * sc, ang + rot, 0, Math.PI * 2);
      if (fill) {
        g.fillStyle = fill;
        g.fill();
      }
      g.strokeStyle = stroke;
      g.lineWidth = w;
      g.stroke();
    };
    const stroke = (pts, col, w) => {
      line(g, pts);
      g.strokeStyle = col;
      g.lineWidth = w;
      g.stroke();
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const s of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const flap = (Math.sin(t * 150 + i + k * 2.1) * 22 * Math.PI) / 180;
        el(-12, s * 38, 46, 12, s * (0.49 + flap), 'rgba(255,240,210,0.07)', 'rgba(255,230,190,0.35)', 1.4);
        el(-22, s * 28, 30, 8, s * (0.7 + flap), 'rgba(255,240,210,0.05)', 'rgba(255,230,190,0.25)', 1.2);
      }
    for (const s of [-1, 1]) [6, 0, -6].forEach((x, k) => stroke([P(x, s * 12), P(x - 14 - k * 6, s * (30 + k * 4)), P(x - 34 - k * 8, s * (34 + k * 3))], AMBER, 2));
    el(-54, 0, 38, 22, 0, 'rgba(10,8,4,0.9)', AMBER, 2.6);
    for (let k = 0; k < 4; k++) {
      const x = -30 - k * 15;
      const w = 21 * Math.sqrt(Math.max(0, 1 - Math.pow((x + 54) / 38, 2)));
      const a = P(x, -w);
      const b = P(x, w);
      const c = P(x - 5, 0);
      g.globalAlpha = k % 2 ? 0.6 : 0.9;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.quadraticCurveTo(c[0], c[1], b[0], b[1]);
      g.strokeStyle = AMBER;
      g.lineWidth = k % 2 ? 1.4 : 4;
      g.stroke();
      g.globalAlpha = 1;
    }
    const st = h.sting && Math.abs(t - h.sting.at) < 0.12 ? 1 - Math.abs(t - h.sting.at) / 0.12 : 0;
    stroke([P(-91, 0), P(-101 - 14 * st, 0)], '#fff', 2.6);
    stroke([P(-16, 0), P(-6, 0)], AMBER, 3);
    el(6, 0, 18, 15, 0, 'rgba(10,8,4,0.9)', AMBER, 2.6);
    el(36, 0, 15, 20, 0, HEADC, AMBER, 2.6);
    for (const s of [-1, 1]) {
      el(38, s * 13, 9, 5.5, s * 0.17, 'hsl(20, 70%, 22%)', AMBER, 1.6);
      stroke([P(50, s * 7), P(60, s * 6), P(62, s * 1)], '#fff', 3);
      stroke([P(48, s * 5), P(66, s * 16), P(84, s * 13 + Math.sin(t * 6 + s + i) * 3)], AMBER, 1.8);
    }
  }

  function draw(ctx, t) {
    drawSlider(ctx.ui, t);
    drawCursor(ctx.cursor, t);
    drawFx(ctx.fx, t);
    hs.forEach((h, i) => {
      if (h.here || Math.hypot(h.x - stage.W / 2, h.y - stage.H / 2) < stage.W) drawHornet(ctx.hornets, h, t, i);
    });
    const n = hs.filter((h) => h.here).length;
    stage.stats(`stings ${stings.length} · ${n} hornet${n > 1 ? 's' : ''}`);
  }

  return { step, draw };
}
