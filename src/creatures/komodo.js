// a skeleton komodo dragon. it bites your cursor once and then just strolls after it,
// waiting for the venom to work: the venom makes your cursor lag. its frame rate drops
// and drops (it stutters, leaves ghosts, rubber-bands) until it can barely move, and then
// the dragon swallows it, and the lag with it. click for antidote.

import { dot, line } from '../kit/stage.js';
import { clamp, followChain, ik2 } from '../kit/math.js';
import { add, ARROW, arrowScale, facingAt, gaitInit, gaitStep, mix, nrm, perp, rot, smooth, steer, sub } from '../kit/body.js';

const BONE = 'hsl(38, 60%, 80%)';
const BONE_DIM = 'hsl(38, 40%, 62%)';
const TONGUE = 'hsl(44, 100%, 58%)';
const BG = '#06070b';
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const COND = "'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif";

export const meta = {
  file: 'komodo.js',
  hint: 'it bites once · click for antidote',
  layers: [{ name: 'hud' }, { name: 'dragon', glow: 'rgba(190,170,80,0.4)', blur: 12 }, { name: 'top' }],
  vars: { accent: 'rgba(255,225,77,0.95)' },
  ripple: 'rgba(170,230,90,0.8)',
};

const K = 1.6;
const N = 32; // 0 snout · 0–4 skull · 5–8 neck · 9–16 body (shoulders 9, hips 16) · 17–31 tail
const SHOULDER = 9;
const HIP = 16;
const segLen = (i) => (i < 5 ? 17 : i < 9 ? 12 : i < 17 ? 17 : 15 - (i - 17) * 0.45) * K;
const LEGS = [
  { at: SHOULDER, side: -1, angle: 1.05, hip: 17 * K, reach: 30 * K, group: 0 },
  { at: SHOULDER, side: 1, angle: 1.05, hip: 17 * K, reach: 30 * K, group: 1 },
  { at: HIP, side: -1, angle: 2.0, hip: 18 * K, reach: 33 * K, group: 1 },
  { at: HIP, side: 1, angle: 2.0, hip: 18 * K, reach: 33 * K, group: 0 },
];
const SKULL = [
  [0, 6],
  [4, 10],
  [16, 12],
  [32, 13],
  [46, 17],
  [58, 21],
  [68, 20],
  [76, 12],
];
const width = (i) => (i < 9 ? 0 : i <= HIP ? 38 * Math.sin((Math.PI * (i - 7.2)) / 10.6) + 8 : Math.max(4, 20 - (i - HIP) * 1.1)) * K;
// the venom's course: frame rates, and how long each lasts
const STEPS = [60, 48, 30, 12, 5, 1];
const HOLD = [0.12, 2.2, 2.2, 2.2, 2.2, 1.6];
const fpsColor = (f) => (f >= 45 ? '#7dff8a' : f >= 25 ? '#ffe14d' : f >= 10 ? '#ffa24d' : '#ff4d5e');

export function create(stage) {
  const p = stage.pointer;
  stage.cursor.hidden = true;
  const J = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    J[i * 2] = stage.W * 0.25 - i * segLen(i) * 0.45;
    J[i * 2 + 1] = stage.H * 0.85 + i * segLen(i) * 0.89;
  }
  const gait = gaitInit(J, N, LEGS);
  let phase = 0;

  // stalk (not bitten yet) · lunge · poisoned (it follows and waits) · gulp · inside (it has the cursor)
  let mode = 'stalk';
  let modeT = 0;
  let lungeAt = 4;
  let level = 0; // index into STEPS
  let levelAt = 0;
  let biteAt = -10;
  let biteP = [0, 0];
  let gulpAt = -10;
  let coughAt = -10;
  let shown = [0, 0]; // where the cursor is being drawn (it only updates on its own frames)
  let nextFrame = 0;
  const hist = []; // past shown frames (for the ghosts)
  const trail = []; // where the real pointer has been (for the rubber-banding)
  let tear = false;
  const fpsLog = [];
  let snap = null; // the dragon as last drawn, once it lags
  let nextSnap = 0;
  let saidAt = -10;
  const say = (s) => {
    stage.headline(s);
    saidAt = stage.t;
  };
  stage.headline('move your mouse');
  const set = (m, t) => {
    mode = m;
    modeT = t;
  };
  const fps = () => (mode === 'gulp' || mode === 'inside' ? 0 : mode === 'poisoned' ? STEPS[level] : 60);
  const dragonFps = () => (mode === 'inside' && stage.t - gulpAt > 1.6 ? 3 : 60);

  stage.on('click', () => {
    const t = stage.t;
    if (mode === 'inside' || mode === 'gulp') return cough(t);
    if (mode === 'poisoned' && level > 1) {
      level--;
      levelAt = t;
      say('antidote.');
    }
  });
  function cough(t) {
    coughAt = t;
    set('stalk', t);
    lungeAt = t + 5;
    level = 0;
    snap = null;
    say('hack.');
  }

  function step(dt, t) {
    const c = [p.x, p.y];
    phase += dt * 2.4;
    const sway = Math.sin(phase) * 22;
    const sn = [J[0], J[1]];
    const d = Math.hypot(c[0] - sn[0], c[1] - sn[1]);
    const mt = t - modeT;
    trail.push({ t, p: c });
    while (trail.length && t - trail[0].t > 1) trail.shift();

    if (mode === 'stalk') {
      steer(J, c, { rate: 1.4, dt, off: 250, wig: sway, maxTurn: 0.35, turnSpeed: 90 });
      if ((t > lungeAt || (p.still > 1 && p.real)) && d < 420 && t - coughAt > 2) set('lunge', t);
    } else if (mode === 'lunge') {
      steer(J, c, { rate: 6, dt, off: 0, maxTurn: 0.4 });
      if (d < 50) {
        biteAt = t;
        biteP = c;
        set('poisoned', t);
        level = 0;
        levelAt = t;
        stage.shake(14);
        stage.bump();
        say('run.');
      } else if (mt > 0.6) {
        set('stalk', t);
        lungeAt = t + 3 + Math.random() * 3;
        say('missed.');
      }
    } else if (mode === 'poisoned') {
      // it can wait: it just follows, at a distance, until the venom's done its work
      if (level < STEPS.length - 1 && t - levelAt > HOLD[level]) {
        level++;
        levelAt = t;
        stage.bump();
        if (STEPS[level] === 30) say('run faster.');
        if (STEPS[level] === 5) say('r   u   n');
        if (STEPS[level] === 1) say('');
      }
      if (STEPS[level] === 1 && t - levelAt > HOLD[level]) {
        steer(J, shown, { rate: 9, dt, off: 0, maxTurn: 0.4 });
        if (Math.hypot(shown[0] - J[0], shown[1] - J[1]) < 30) {
          gulpAt = t;
          set('gulp', t);
          stage.shake(16);
        }
      } else if (STEPS[level] === 1) steer(J, shown, { rate: 1.4, dt, off: 170, wig: sway * 0.5, maxTurn: 0.35, turnSpeed: 80 });
      else steer(J, c, { rate: 1.25, dt, off: 250, wig: sway, maxTurn: 0.35, turnSpeed: 90 });
    } else if (mode === 'gulp') {
      if (mt > 0.6) {
        set('inside', t);
        say('gulp.');
      }
    } else if (mode === 'inside') {
      steer(J, c, { rate: 1.2, dt, off: 300, wig: sway, maxTurn: 0.3, turnSpeed: 70 });
      if (mt > 1.4 && mt < 1.5) say('lag.');
      if (mt > 9) cough(t);
    }
    followChain(J, N, segLen, 0.14);
    gaitStep(gait, J, N, LEGS, t, { stepAt: 22 * K, stepTime: 0.2, dt });

    // the cursor, shown on its own (falling) frame rate
    const f = fps();
    if (f >= 60) {
      shown = c;
      hist.length = 0;
      tear = false;
    } else if (f > 0 && t >= nextFrame) {
      hist.unshift(shown);
      hist.length = Math.min(hist.length, 6);
      // rubber-banding: sometimes it snaps back to where you were
      const old = trail[0]?.p;
      shown = f <= 5 && Math.random() < 0.3 && old ? old : c;
      tear = f <= 12 && Math.random() < 0.6;
      nextFrame = t + 1 / f;
    }
    // and once it's eaten the lag, so does the dragon
    if (dragonFps() < 60) {
      if (!snap || t >= nextSnap) {
        snap = { J: J.slice(), feet: gait.feet.slice(), t };
        nextSnap = t + 1 / dragonFps();
      }
    } else snap = null;
    fpsLog.push({ t, v: mode === 'inside' && dragonFps() < 60 ? dragonFps() : f });
    while (fpsLog.length && t - fpsLog[0].t > 4) fpsLog.shift();

    if (saidAt > 0 && t - saidAt > 2.2 && mode === 'stalk') {
      stage.headline('move your mouse');
      saidAt = -10;
    }
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  const jawAt = (t) => {
    if (mode === 'lunge') return smooth(modeT, modeT + 0.22, t);
    if (mode === 'poisoned' && t - biteAt < 0.1) return 1 - (t - biteAt) / 0.1;
    if (mode === 'poisoned' && STEPS[level] === 1 && t - levelAt > HOLD[level] - 0.4) return smooth(levelAt + HOLD[level] - 0.4, levelAt + HOLD[level] - 0.05, t);
    if (mode === 'gulp') {
      const s = t - gulpAt;
      return s < 0.12 ? 0 : s < 0.24 ? 0.35 * smooth(0.12, 0.18, s) : s < 0.34 ? 0 : s < 0.46 ? 0.35 * smooth(0.34, 0.4, s) : 0;
    }
    if (t - coughAt < 0.35) return Math.sin((Math.PI * (t - coughAt)) / 0.35);
    return 0;
  };

  function drawDragon(g, t) {
    const JJ = snap ? snap.J : J;
    const feet = snap ? snap.feet : gait.feet;
    const td = snap ? snap.t : t;
    const P = Array.from({ length: N }, (_, i) => [JJ[i * 2], JJ[i * 2 + 1]]);
    const F = (i) => facingAt(JJ, i, N);
    const stroke = (pts, col, w, close = false) => {
      line(g, pts, close);
      g.strokeStyle = col;
      g.lineWidth = w;
      g.stroke();
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    LEGS.forEach((leg, li) => {
      const f = F(leg.at);
      const hip = add(P[leg.at], perp(f), leg.hip * leg.side);
      const raw = [feet[li * 2], feet[li * 2 + 1]];
      const foot = Math.hypot(raw[0] - hip[0], raw[1] - hip[1]) > 40 * K ? add(hip, nrm(sub(raw, hip)), 40 * K) : raw;
      const knee = ik2(hip, foot, 21 * K, 21 * K, leg.side * (leg.at === SHOULDER ? -1 : 1));
      stroke([hip, knee, foot], BONE, 5);
      g.fillStyle = BONE;
      dot(g, knee[0], knee[1], 5);
      const fd = nrm(sub(foot, knee));
      for (let k = -2; k <= 2; k++) {
        const dir = rot(fd, k * 0.38);
        const toe = add(foot, dir, 10 * K);
        stroke([foot, toe, add(add(toe, dir, 5 * K), perp(dir), 2.5 * K * leg.side)], BONE, 2.4);
      }
    });
    stroke(P.slice(4), BONE, 4);
    for (let i = 10; i < HIP; i++) {
      const f = F(i);
      const n = perp(f);
      const w = width(i);
      for (const s of [-1, 1]) {
        const end = add(add(P[i], n, w * s), f, -w * 0.45);
        const ctl = add(P[i], n, w * 0.85 * s);
        g.beginPath();
        g.moveTo(P[i][0], P[i][1]);
        g.quadraticCurveTo(ctl[0], ctl[1], end[0], end[1]);
        g.strokeStyle = BONE;
        g.lineWidth = 3.4;
        g.stroke();
      }
    }
    for (let i = 5; i < N - 2; i++) {
      const f = F(i);
      const n = perp(f);
      const w = i < 9 ? 9 * K : i <= HIP ? width(i) * 0.55 : Math.max(3, width(i) * 0.6);
      g.fillStyle = BONE_DIM;
      for (const s of [-1, 1]) {
        const q = add(P[i], n, w * s);
        dot(g, q[0], q[1], 2.2);
      }
      g.save();
      g.translate(P[i][0], P[i][1]);
      g.rotate(Math.atan2(f[1], f[0]));
      g.beginPath();
      g.roundRect(-4, -3, 8, 6, 2);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = BONE;
      g.lineWidth = 1.6;
      g.stroke();
      g.restore();
    }
    // the skull: long and narrow; opening its jaws, the head lifts at you
    const d = nrm(sub(P[0], P[4]));
    const n = perp(d);
    const jaw = jawAt(td);
    const lift = 1 + 0.24 * jaw;
    const h = add(P[0], d, 10 * K * jaw);
    const pt = (fb, s) => add(add(h, d, -fb * K * lift), n, s * K * lift);
    const outline = (fs) => [...fs.map(([fb, s]) => pt(fb, s)), ...[...fs].reverse().map(([fb, s]) => pt(fb, -s))];
    if (jaw > 0.02) {
      g.globalAlpha = jaw;
      line(g, outline(SKULL.map(([fb, s]) => [fb, s + 8 * jaw])), true);
      g.fillStyle = '#3d0b08';
      g.fill();
      stroke(outline(SKULL.map(([fb, s]) => [fb, s + 8 * jaw])), '#ff8a6a', 2, true);
      g.globalAlpha = 1;
    }
    const ph = (td + 0.5) % 1.15;
    const tg = jaw < 0.05 && mode !== 'gulp' && ph < 0.36 ? Math.sin((ph / 0.36) * Math.PI) : 0;
    if (tg > 0.02) {
      const len = 36 * K * tg;
      const wig = Math.sin(t * 50) * 3 * K;
      const a = pt(0, 0);
      const b = add(add(a, d, len), n, wig);
      stroke([a, b, add(add(b, d, 9 * K), n, 5 * K)], TONGUE, 3.4);
      stroke([b, add(add(b, d, 9 * K), n, -5 * K)], TONGUE, 3.4);
    }
    line(g, outline(SKULL), true);
    g.fillStyle = BG;
    g.fill();
    stroke(outline(SKULL), BONE, 3.4, true);
    for (const s of [-1, 1]) {
      const e = pt(50, 13 * s);
      g.beginPath();
      g.arc(e[0], e[1], 6.5 * K * lift, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = BONE;
      g.lineWidth = 2.6;
      g.stroke();
      g.fillStyle = 'hsl(46, 100%, 62%)';
      dot(g, e[0] + d[0] * 2, e[1] + d[1] * 2, 2.6 * K * lift);
      g.fillStyle = BONE;
      const no = pt(6, 5 * s);
      dot(g, no[0], no[1], 2.2 * K);
      stroke([pt(8, 10 * s), pt(56, 19 * s)], BONE_DIM, 1.6);
    }
    // the swallowed cursor: a lump going down its throat, then inside its ribs
    if (mode === 'gulp' || mode === 'inside') {
      const u = smooth(0.02, 1.2, t - gulpAt);
      const j = 1 + 11 * u;
      const i0 = Math.floor(j);
      const q = mix(P[i0], P[Math.min(N - 1, i0 + 1)], j - i0);
      const f = F(Math.round(j));
      const a = Math.atan2(-f[0], f[1]);
      const k = arrowScale(stage) * 1.4;
      if (u < 0.75) {
        g.save();
        g.setLineDash([6, 5]);
        g.beginPath();
        g.ellipse(q[0], q[1], 26 * K, 18 * K, Math.atan2(f[1], f[0]), 0, Math.PI * 2);
        g.strokeStyle = BONE;
        g.lineWidth = 2.4;
        g.stroke();
        g.restore();
      }
      // still lagging in there: it twitches on its own frames
      const jig = Math.sin(Math.floor(t * 2) * 12.9898) * 0.5;
      g.save();
      g.globalAlpha = 0.92;
      g.translate(q[0] + jig * 6, q[1]);
      g.rotate(a + jig * 0.17);
      g.scale(k, k);
      g.translate(-8, -16);
      g.fillStyle = 'rgba(200,235,150,0.85)';
      g.strokeStyle = '#000';
      g.lineWidth = 2.2;
      g.fill(ARROW);
      g.stroke(ARROW);
      g.restore();
    }
  }

  function drawCursor(g, t) {
    // the venom at the bite: a puff of green
    const a = t - biteAt;
    if (a >= 0 && a < 0.6) {
      g.fillStyle = 'rgba(170,230,90,0.85)';
      for (let k = 0; k < 16; k++) {
        const ang = k * 2.4;
        const sp = 120 + ((k * 0.618) % 1) * 320;
        dot(g, biteP[0] + Math.cos(ang) * sp * a, biteP[1] + Math.sin(ang) * sp * a + 200 * a * a, (4 + (k % 4) * 2) * (1 - a / 0.6));
      }
      g.strokeStyle = 'rgba(170,230,90,0.7)';
      g.lineWidth = 4;
      g.globalAlpha = 1 - clamp(a / 0.3);
      g.beginPath();
      g.arc(biteP[0], biteP[1], 30 + 160 * clamp(a / 0.3), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    const f = fps();
    if (f === 0) {
      // coughed back up
      return;
    }
    const k = arrowScale(stage) * 1.2;
    const venom = mode === 'poisoned' ? clamp((t - biteAt) / 2.5) : 0;
    const fill = `rgb(${Math.round(255 - 60 * venom)}, ${Math.round(255 - 20 * venom)}, ${Math.round(255 - 110 * venom)})`;
    const arrow = (q, alpha, torn) => {
      const slices = torn ? [0, 11, 22] : [null];
      slices.forEach((y0, i) => {
        g.save();
        g.globalAlpha = alpha;
        g.translate(q[0] + (torn ? Math.sin(t * 97 + i * 7) * 9 : 0), q[1]);
        g.scale(k, k);
        if (y0 !== null) {
          g.beginPath();
          g.rect(-4, y0, 30, 11);
          g.clip();
        }
        g.lineJoin = 'round';
        g.lineWidth = 2.2;
        g.fillStyle = mode === 'poisoned' ? fill : '#000';
        g.strokeStyle = mode === 'poisoned' ? '#000' : '#fff';
        g.fill(ARROW);
        g.stroke(ARROW);
        if (mode === 'poisoned') {
          g.fillStyle = '#2c4a12';
          dot(g, 3, 13, 1.6);
          dot(g, 9, 17, 1.6);
        }
        g.restore();
      });
    };
    const ghosts = f >= 45 ? 0 : f >= 25 ? 3 : f >= 10 ? 6 : 4;
    for (let i = Math.min(ghosts, hist.length) - 1; i >= 0; i--) arrow(hist[i], 0.42 * Math.pow(0.75, i), false);
    let at = shown;
    if (t - coughAt < 0.4) at = mix([J[0], J[1]], [p.x, p.y], (t - coughAt) / 0.4);
    arrow(at, 1, tear);
  }

  function drawHud(g, t) {
    const inside = mode === 'inside' && t - gulpAt > 1.6;
    const f = inside ? dragonFps() : fps();
    const x0 = Math.max(40, stage.W * 0.06);
    const y0 = Math.max(130, stage.H * 0.14);
    const bump = Math.max(0, 1 - (t - Math.max(levelAt, gulpAt)) / 0.3);
    const col = mode === 'gulp' || (mode === 'inside' && !inside) ? '#ff4d5e' : fpsColor(f);
    const blink = f <= 1 && Math.floor(t * 4) % 2 === 1;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = `600 ${Math.min(30, stage.W / 34)}px ${MONO}`;
    g.fillText(inside ? 'DRAGON' : 'CURSOR', x0, y0);
    g.save();
    g.translate(x0, y0 + 104);
    g.scale(1 + 0.12 * bump, 1 + 0.12 * bump);
    g.globalAlpha = blink ? 0.35 : 1;
    g.fillStyle = col;
    const size = Math.min(110, stage.W / 9);
    g.font = `800 ${size}px ${COND}`;
    g.fillText(String(Math.round(f)), 0, 0);
    const w = g.measureText(String(Math.round(f))).width;
    g.font = `700 ${size * 0.45}px ${COND}`;
    g.fillText('fps', w + 10, 0);
    g.restore();
    // a little graph of the last 4 seconds
    const G = { x: x0 + Math.min(300, stage.W * 0.3), y: y0 - 10, w: Math.min(360, stage.W * 0.4), h: 110 };
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(G.x, G.y, G.w, G.h, 10);
    g.fill();
    g.stroke();
    g.setLineDash([6, 6]);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    for (const v of [60, 30]) {
      line(g, [[G.x, G.y + G.h - (v / 60) * G.h], [G.x + G.w, G.y + G.h - (v / 60) * G.h]]);
      g.stroke();
    }
    g.setLineDash([]);
    g.strokeStyle = col;
    g.lineWidth = 4;
    g.beginPath();
    fpsLog.forEach((e, i) => {
      const x = G.x + (1 - (t - e.t) / 4) * G.w;
      const y = G.y + G.h - (e.v / 60) * G.h;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }

  function draw(ctx, t) {
    drawHud(ctx.hud, t);
    drawDragon(ctx.dragon, t);
    drawCursor(ctx.top, t);
    stage.stats(mode === 'inside' ? 'cursor: inside the dragon' : mode === 'poisoned' ? `venom: ${Math.round((level / (STEPS.length - 1)) * 100)}%` : 'venom: none yet');
  }

  return { step, draw };
}
