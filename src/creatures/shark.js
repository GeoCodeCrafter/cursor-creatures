// a skeleton shark, side-on. the page is flooding from the bottom and the fin cuts the
// surface under your cursor. stay dry: get too close to the water and it lunges. let the
// water get too high and it dives, comes up from the deep and leaps clean out of the
// water at you. click to bail some water out.

import { dot, line } from '../kit/stage.js';
import { approach, clamp, ease } from '../kit/math.js';
import { ARROW, arrowScale, smooth, wrapAngle } from '../kit/body.js';

const BONE = '#eef6ff';
const BG = '#06070b';
const G = 2600;

export const meta = {
  file: 'shark.js',
  hint: 'stay dry · click to bail',
  layers: [{ name: 'shark', glow: 'rgba(120,180,255,0.55)' }, { name: 'water' }, { name: 'top' }],
  vars: { accent: 'rgba(160,205,255,0.95)' },
  ripple: 'rgba(200,230,255,0.8)',
};

const BODY = [
  [262, 6],
  [240, -26],
  [180, -48],
  [90, -58],
  [0, -56],
  [-120, -40],
  [-230, -18],
  [-280, -8],
  [-282, 8],
  [-230, 22],
  [-120, 40],
  [0, 52],
  [90, 54],
  [180, 44],
  [240, 26],
];
const TOP_HALF = new Path2D('M0 0 L0 15 L2.5 13 L5 16 L7.5 13 L10 16 L12.5 13 L16.6 16 Z');
const BOTTOM_HALF = new Path2D('M0 15 L0 28 L7 21.5 L11.5 32 L16 30 L11.5 19.8 L20.5 19.8 L16.6 16 L12.5 13 L10 16 L7.5 13 L5 16 L2.5 13 Z');

function drawShark(g, jaw, wag) {
  const tail = Math.sin(wag) * 0.12;
  const tr = (x, y) => {
    const dx = x + 280;
    return [-280 + dx * Math.cos(tail) - y * Math.sin(tail), dx * Math.sin(tail) + y * Math.cos(tail)];
  };
  const poly = (pts, w, fill = BG, close = true) => {
    line(g, pts, close);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    g.lineWidth = w;
    g.stroke();
  };
  g.globalAlpha = 0.6;
  poly(BODY, 1.8);
  g.globalAlpha = 1;
  poly([[40, -54], [-20, -160], [-46, -150], [-40, -52]], 2.8);
  for (const k of [0, 1, 2]) poly([[30 - k * 24, -54], [-14 - k * 10, -146 + k * 14]], 1.2, null, false);
  poly([[-168, -30], [-196, -64], [-208, -26]], 2);
  poly([[140, 42], [40, 132], [26, 124], [92, 52]], 2.6);
  poly([[-100, 40], [-142, 80], [-140, 40]], 2);
  poly([tr(-276, -8), tr(-404, -152), tr(-372, -140), tr(-320, -12), tr(-318, 10), tr(-372, 84), tr(-284, 10)], 2.8);
  poly([[200, -14], [100, -16], [0, -14], [-120, -10], [-230, -6], tr(-296, -26), tr(-380, -124)], 3.4, null, false);
  g.fillStyle = BONE;
  for (let x = 140; x >= -210; x -= 30) {
    const y = -14 + (x < 0 ? -x * 0.03 : 0);
    poly([[x, y], [x - 6, y + 26]], 1.6, null, false);
    poly([[x, y], [x - 6, y - 16]], 1.3, null, false);
    g.fillStyle = BONE;
    dot(g, x, y, 2.8);
  }
  g.lineWidth = 1.6;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.moveTo(150 - k * 9, -26);
    g.quadraticCurveTo(144 - k * 9, 0, 150 - k * 9, 28);
    g.stroke();
  }
  // the skull and jaws: the lower jaw drops, the upper one pushes forward
  const hinge = [160, 22];
  const ja = jaw * 0.95;
  const jr = (q) => {
    const dx = q[0] - hinge[0];
    const dy = q[1] - hinge[1];
    return [hinge[0] + dx * Math.cos(ja) - dy * Math.sin(ja), hinge[1] + dx * Math.sin(ja) + dy * Math.cos(ja)];
  };
  const fwd = 14 * jaw;
  if (jaw > 0.02) {
    line(g, [[170 + fwd, 18], [250 + fwd, 16], jr([246, 30]), jr([170, 28])], true);
    g.fillStyle = '#06132e';
    g.fill();
    g.strokeStyle = '#7fb4ff';
    g.lineWidth = 1.2;
    g.stroke();
    g.strokeStyle = BONE;
  }
  poly([hinge, jr([246, 30]), jr([240, 40]), jr([168, 36])], 2.8);
  g.lineWidth = 0.8;
  for (let k = 0; k < 6; k++) {
    line(g, [jr([180 + k * 11, 30]), jr([185.5 + k * 11, 21]), jr([191 + k * 11, 30])], true);
    g.fillStyle = BONE;
    g.fill();
  }
  poly([[262 + fwd * 0.5, 6], [240, -26], [150, -36], [150, 12], [170 + fwd, 18], [250 + fwd, 16]], 3);
  for (let k = 0; k < 6; k++) {
    line(g, [[178 + fwd + k * 11, 17], [183.5 + fwd + k * 11, 27 + jaw * 4], [189 + fwd + k * 11, 17]], true);
    g.fillStyle = BONE;
    g.fill();
  }
  g.beginPath();
  g.arc(206, -12, 11, 0, Math.PI * 2);
  g.fillStyle = BG;
  g.fill();
  g.lineWidth = 2.4;
  g.stroke();
  g.beginPath();
  g.arc(207, -12, 5.5, 0, Math.PI * 2);
  g.fillStyle = '#000';
  g.fill();
  g.strokeStyle = '#9cc8ff';
  g.lineWidth = 1.2;
  g.stroke();
  g.strokeStyle = BONE;
}

export function create(stage) {
  const p = stage.pointer;
  const S = () => clamp(stage.W / 1900, 0.5, 0.85);
  const NOSE = () => 260 * S();
  const startLevel = () => stage.H * 0.86;
  const topLevel = () => stage.H * 0.3;
  let water = startLevel();
  // patrol · lunge (up at the cursor) · fall (back in) · dive (out of sight, deep) · rise · fly (the leap)
  const s = { x: stage.W * 0.2, y: stage.H + 200, a: 0, sx: 1, wag: 0, phase: 0, vx: 0, vy: 0, dyn: false };
  let mode = 'patrol';
  let modeT = 0;
  let coolUntil = 2;
  let jawShut = -10; // when the jaws next slam shut
  let launch = null; // { at: [x,y], v: [vx,vy] }
  let bitAt = -10;
  let bitP = [0, 0];
  let halves = [];
  let lunges = 0;
  let short = 0;
  const splashes = []; // { at, x, y, big, seed }
  let saidAt = -10;
  let base = 'move your mouse';
  const say = (m, keep = true) => {
    stage.headline(m);
    if (keep) base = m;
    saidAt = keep ? -10 : stage.t;
  };
  stage.headline(base);
  stage.cursor.hidden = true;
  const set = (m, t) => {
    mode = m;
    modeT = t;
  };
  const splash = (t, x, big) => splashes.push({ at: t, x, y: water, big, seed: Math.floor(t * 997) });
  const surfaceY = (x, t) => water + 7 * Math.sin(x * 0.018 + t * 2.2) + 4 * Math.sin(x * 0.041 - t * 3.1);
  const nose = () => {
    if (!s.dyn) return [s.x + Math.sign(s.sx) * NOSE(), s.y];
    return [s.x + Math.cos(s.a) * NOSE(), s.y + Math.sin(s.a) * NOSE()];
  };
  const whole = () => bitAt < 0;

  stage.on('click', (x, y) => {
    if (!whole()) return;
    // bail: scoop some water out
    water = Math.min(startLevel(), water + stage.H * 0.05);
    splash(stage.t, x, 0.5);
    say('bail!', false);
  });

  function bite(t, c) {
    bitAt = t;
    bitP = c;
    halves = [
      { path: TOP_HALF, x: c[0], y: c[1], vx: -260, vy: -700, spin: -7, a: 0, wet: null },
      { path: BOTTOM_HALF, x: c[0], y: c[1], vx: 300, vy: -520, spin: 9, a: 0, wet: null },
    ];
    stage.shake(30);
    stage.bump();
    say('half a cursor.');
  }

  function step(dt, t) {
    const c = [p.x, p.y];
    const k = (rate) => 1 - Math.exp(-rate * dt);
    const mt = t - modeT;
    s.wag += dt * 7;
    const px = s.x;
    const turnTo = (target, rate) => {
      s.a += wrapAngle(target - s.a) * k(rate);
    };
    const toDyn = () => {
      if (s.dyn) return;
      s.dyn = true;
      s.a = s.sx >= 0 ? 0 : Math.PI;
    };

    // the flood: rising, until it bites (then it drains away)
    if (whole()) water = Math.max(topLevel(), water - stage.H * 0.03 * dt);
    else if (t - bitAt > 1.6) water = approach(water, startLevel(), 1.2, dt);
    const dry = c[1] < surfaceY(c[0], t) - 8;

    if (mode === 'patrol') {
      if (s.dyn) {
        s.dyn = false;
        s.sx = Math.cos(s.a) >= 0 ? 1 : -1;
        s.a = 0;
      }
      s.phase += dt * (water < topLevel() + 40 ? 1.2 : 1.75);
      const goalX = c[0] + Math.sin(s.phase) * 400 * S();
      s.x += (goalX - s.x) * k(4);
      s.y += (water + 92 * S() + Math.sin(t * 2.3) * 6 - s.y) * k(4);
      const vx = (s.x - px) / dt;
      s.sx += (clamp(vx / 220, -1, 1) - s.sx) * k(6);
      if (whole() && p.real && t > coolUntil) {
        const above = water - c[1];
        if (water <= topLevel() + 1) {
          // the water's as high as it goes: the fin slows, and sinks…
          set('dive', t);
          toDyn();
          say('…');
        } else if (above < 150 * S() + 40 || !dry) {
          // too close to the water: up it comes. it only connects if you're touching it
          set('lunge', t);
          toDyn();
          jawShut = t + 0.45;
          short = dry && above > 55 ? 90 : 0;
          lunges++;
        }
      }
    } else if (mode === 'lunge') {
      // up at the cursor, nose first
      const side = Math.cos(s.a) >= 0 ? 1 : -1;
      s.x += (c[0] - side * 40 - s.x) * k(7);
      s.y += (c[1] + NOSE() * 0.8 + short - s.y) * k(7);
      turnTo(Math.atan2(-1, 0.35 * side), 10);
      if (mt < 0.05) splash(t, s.x, 0.8);
      if (t >= jawShut) {
        const n = nose();
        if (whole() && !short && Math.hypot(n[0] - c[0], n[1] - c[1]) < 90 * S() + 30) bite(t, c);
        else say('too close.', false);
        set('fall', t);
      }
    } else if (mode === 'fall') {
      s.y += (water + 160 - s.y) * k(5);
      turnTo(Math.cos(s.a) >= 0 ? 0 : Math.PI, 6);
      if (mt > 0.6) {
        set('patrol', t);
        coolUntil = t + 2.2;
      }
    } else if (mode === 'dive') {
      // out of sight, off to one side and deep
      const side = c[0] > stage.W / 2 ? -1 : 1;
      const lx = c[0] + side * stage.W * 0.42;
      s.x += (lx + side * 160 - s.x) * k(2.2);
      s.y += (water + 700 * S() - s.y) * k(2.2);
      turnTo(side > 0 ? Math.PI - 0.6 : 0.6, 4);
      if (mt > 1.4) {
        // aim the leap so it peaks right where the cursor is
        const at = [lx, water];
        const h = Math.max(120, at[1] - c[1]);
        const vy = -Math.sqrt(2 * G * h);
        const T = -vy / G;
        const aimX = c[0] + side * NOSE();
        launch = { from: [s.x, s.y], at, v: [(aimX - at[0]) / T, vy], T };
        set('rise', t);
      }
    } else if (mode === 'rise') {
      // comes up hard towards the launch point, turning to face it
      const u = ease.in(clamp(mt / 0.45));
      s.x = launch.from[0] + (launch.at[0] - launch.from[0]) * u;
      s.y = launch.from[1] + (launch.at[1] + 60 - launch.from[1]) * u;
      turnTo(Math.atan2(launch.v[1], launch.v[0]), 10);
      if (mt >= 0.45) {
        s.x = launch.at[0];
        s.y = launch.at[1];
        s.vx = launch.v[0];
        s.vy = launch.v[1];
        jawShut = t + launch.T;
        splash(t, s.x, 1.6);
        stage.shake(12);
        set('fly', t);
      }
    } else if (mode === 'fly') {
      s.vy += G * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.a = Math.atan2(s.vy, s.vx);
      if (jawShut > 0 && t >= jawShut) {
        const n = nose();
        if (whole() && Math.hypot(n[0] - c[0], n[1] - c[1]) < 110 * S() + 30) bite(t, c);
        else say('missed.');
        jawShut = -10;
      }
      if (s.y > water + 160 && s.vy > 0) {
        splash(t, s.x - 60, 2.2);
        stage.shake(20);
        set('patrol', t);
        coolUntil = t + 3;
        if (whole()) water = Math.min(startLevel(), water + stage.H * 0.15);
      }
    }

    // the two halves: fly, fall, hit the water, drift down and fade
    for (const h of halves) {
      if (!h.wet) {
        h.vy += 2400 * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.a += h.spin * dt;
        if (h.y > surfaceY(h.x, t)) {
          h.wet = t;
          splash(t, h.x, 0.35);
        }
      } else {
        h.x += h.vx * 0.1 * dt;
        h.y += 120 * dt;
        h.a += h.spin * 0.15 * dt;
      }
    }
    // a new cursor, once the water's gone down
    if (!whole() && t - bitAt > 4.5) {
      bitAt = -10;
      halves = [];
      lunges = 0;
      coolUntil = t + 2;
      say('new cursor.');
    }
    while (splashes.length && t - splashes[0].at > 1.6) splashes.shift();

    if (saidAt > 0 && t - saidAt > 1.5) {
      stage.headline(base);
      saidAt = -10;
    }
    if (whole() && p.real && mode === 'patrol') {
      const level = (stage.H - water) / stage.H;
      if (base === 'move your mouse' || base === 'new cursor.') say('stay dry.');
      else if (level > 0.55 && base === 'stay dry.') say('higher!');
    }
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function jawAt(t) {
    if (jawShut < 0) return 0;
    return t >= jawShut - 0.35 && t < jawShut + 0.02 ? smooth(jawShut - 0.35, jawShut - 0.12, t) : 0;
  }

  function drawWater(g, t) {
    const W = stage.W;
    const surf = [];
    for (let x = -40; x <= W + 40; x += 20) surf.push([x, surfaceY(x, t)]);
    line(g, [...surf, [W + 40, stage.H + 40], [-40, stage.H + 40]], true);
    const gr = g.createLinearGradient(0, water, 0, water + 1200);
    gr.addColorStop(0, 'rgba(70,150,255,0.24)');
    gr.addColorStop(1, 'rgba(10,40,140,0.55)');
    g.fillStyle = gr;
    g.fill();
    // light lines under the surface
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(160,210,255,0.06)';
    g.lineWidth = 40;
    for (let k = 0; k < 5; k++) {
      const x0 = ((k * 380 + t * 40) % (W + 600)) - 200;
      line(g, [[x0, water + 40], [x0 - 260, water + 900]]);
      g.stroke();
    }
    // bubbles
    g.strokeStyle = 'rgba(200,230,255,0.45)';
    g.lineWidth = 1.6;
    for (let k = 0; k < 30; k++) {
      const u = ((t + k * 0.37) % 2.2) / 2.2;
      const x0 = k % 3 === 0 ? s.x + Math.sin(k * 7.1) * 60 : ((k * 0.618) % 1) * W;
      const y0 = k % 3 === 0 ? s.y : water + 200 + ((k * 0.377) % 1) * 900;
      const y = y0 - u * 420;
      if (y < water + 8) continue;
      g.beginPath();
      g.arc(x0 + Math.sin(u * 8 + k) * 10, y, 3 + (k % 5) * 1.2, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(200,230,255,0.95)';
    g.lineWidth = 3;
    line(g, surf);
    g.stroke();
    g.strokeStyle = 'rgba(160,210,255,0.25)';
    g.lineWidth = 2;
    line(g, surf.map(([x, y]) => [x, y + 9]));
    g.stroke();
    // the wake where the fin cuts the surface
    if (!s.dyn) {
      const tipX = s.x - 20 * S() * s.sx;
      const tipY = s.y - 160 * S();
      if (tipY < water - 4) {
        const back = s.sx > 0 ? -1 : 1;
        g.strokeStyle = 'rgba(230,245,255,0.8)';
        g.lineWidth = 3;
        for (let k = 0; k < 6; k++) {
          const x = tipX + back * (20 + k * 26);
          line(g, [[x, surfaceY(x, t) - 2], [x + back * 14, surfaceY(x, t) - 2 - (6 - k)]]);
          g.stroke();
        }
      }
    }
    // spray
    for (const e of splashes) {
      const u = t - e.at;
      let seed = e.seed;
      const r = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      g.fillStyle = 'rgba(215,235,255,0.85)';
      for (let j = 0; j < 26 * e.big; j++) {
        const vx = (r() - 0.5) * 900 * e.big;
        const vy = -(500 + r() * 900) * Math.sqrt(e.big);
        const rx = 3 + r() * 5;
        const ry = 4 + r() * 7;
        const x = e.x + vx * u;
        const y = e.y + vy * u + 0.5 * G * u * u;
        if (y > water + 10) continue;
        g.beginPath();
        g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      }
      const ring = clamp(u / 0.8);
      g.strokeStyle = `rgba(220,240,255,${0.7 * (1 - ring)})`;
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(e.x, e.y, (60 + 260 * ring) * e.big, 14 * e.big, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }

  function drawCursor(g, t) {
    const k = arrowScale(stage);
    const arrow = (path, x, y, a, o) => {
      g.save();
      g.globalAlpha = o;
      g.translate(x, y);
      g.rotate(a);
      g.scale(k, k);
      g.translate(-8, -14);
      g.lineJoin = 'round';
      g.lineWidth = 2.2;
      g.fillStyle = '#000';
      g.strokeStyle = '#fff';
      g.fill(path);
      g.stroke(path);
      g.restore();
    };
    if (whole()) {
      g.save();
      g.translate(p.x, p.y);
      g.scale(k, k);
      g.lineJoin = 'round';
      g.lineWidth = 2.2;
      g.fillStyle = '#000';
      g.strokeStyle = '#fff';
      g.fill(ARROW);
      g.stroke(ARROW);
      g.restore();
      return;
    }
    for (const h of halves) arrow(h.path, h.x + 8 * k, h.y + 14 * k, h.a, h.wet ? Math.max(0.25, 1 - (t - h.wet) * 0.35) : 1);
  }

  function draw(ctx, t) {
    const g = ctx.shark;
    g.strokeStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const sc = S();
    const sx = s.dyn ? 1 : Math.sign(s.sx || 1) * Math.max(0.06, Math.abs(s.sx));
    const flip = s.dyn ? (Math.cos(s.a) >= 0 ? 1 : -1) : 1;
    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.dyn ? s.a : 0);
    g.scale(sc * sx, sc * flip);
    drawShark(g, jawAt(t), s.wag);
    g.restore();
    drawWater(ctx.water, t);
    drawCursor(ctx.top, t);
    const level = Math.round(((stage.H - water) / stage.H) * 100);
    stage.stats(`water ${level}% · cursor ${whole() ? 100 : 50}%`);
  }

  return { step, draw };
}
