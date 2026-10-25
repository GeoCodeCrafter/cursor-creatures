// a skeleton pistol shrimp. its claw snaps shut so fast it fires a bubble that pops louder
// than a gunshot: a flash, a shockwave through the page, a reading on the sound meter.
// it keeps its distance and shoots your cursor. click to call the shot somewhere else.
// hold still and it charges up the big one, which blows the whole page away.

import { dot, line } from '../kit/stage.js';
import { clamp, followChain, ik2 } from '../kit/math.js';
import { add, ARROW, arrowScale, facingAt, gaitInit, gaitLift, gaitStep, mix, nrm, perp, rot, scale, smooth, steer, sub } from '../kit/body.js';

const BG = '#06070b';
const SHOCK = '#bff6ff';
const SERIF = "Fraunces, 'Iowan Old Style', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const COND = "'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif";

export const meta = {
  file: 'pistol.js',
  hint: 'click to call the shot · hold still for the big one',
  ghost: false,
  layers: [{ name: 'page' }, { name: 'shrimp', glow: 'rgba(255,120,60,0.45)', blur: 10 }, { name: 'meter' }, { name: 'shots', glow: 'rgba(160,235,255,0.8)', blur: 10 }, { name: 'top' }],
  vars: { accent: 'rgba(255,200,140,0.95)' },
  ripple: 'rgba(200,245,255,0.8)',
};

const K = 1.4;
const N = 13; // 0 rostrum · 0–3 carapace · 4–9 abdomen · 10–12 tail fan
const segLen = (i) => (i < 4 ? 21 : i < 10 ? 19 : 14) * K;
const BIG = -1; // the big claw is on its right
const RANGE = 330;
const LEGS = [2, 3, 4].flatMap((at, k) => [-1, 1].map((side) => ({ at, side, angle: [1.15, 1.6, 2.05][k], hip: 13 * K, reach: 28 * K, group: (k + (side > 0 ? 1 : 0)) % 2 })));
const width = (i) => [15, 23, 27, 29, 30, 31, 30, 28, 25, 21, 17, 13, 10][i] * K;
const hue = (i) => 14 + (i / (N - 1)) * 26;
const bone = (i, l = 76) => `hsl(${hue(i)}, 100%, ${l}%)`;
const CLAW = (l = 72) => `hsl(38, 100%, ${l}%)`;
const FLIGHT = 0.08;
const COCK = 0.32;
const BEAT = 60 / 96;
const MARKS = [
  [120, 'concert'],
  [160, 'gunshot'],
  [180, 'rocket'],
];
const LOUDER = [
  [0, ''],
  [120, 'louder than a concert'],
  [160, 'louder than a gunshot'],
  [180, 'louder than a rocket launch'],
  [200, 'off the chart.'],
];
const SEGS = 40;
const segColor = (db) => (db < 150 ? '#49f28b' : db < 175 ? '#ffc94a' : '#ff4d5e');

export function create(stage) {
  const p = stage.pointer;
  const dotsEl = document.querySelector('.dots');
  if (dotsEl) dotsEl.style.display = 'none';
  stage.cursor.hidden = true;

  const J = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    J[i * 2] = stage.W * 0.3 - i * segLen(i) * 0.55;
    J[i * 2 + 1] = stage.H * 0.75 + i * segLen(i) * 0.83;
  }
  const gait = gaitInit(J, N, LEGS);

  const meterBox = () => {
    const w = Math.min(810, stage.W * 0.8);
    return { x: stage.W / 2 - w / 2, y: Math.max(230, stage.H * 0.24), w, h: 56 };
  };
  const dbX = (db) => {
    const m = meterBox();
    return m.x + ((db - 100) / 100) * m.w;
  };
  const fs = () => Math.min(150, stage.W / 7);
  const headY = () => stage.H * 0.45 + fs() * 0.5;

  // shots: { fire (bubble leaves), at (pops), from, to, db, big }
  const shots = [];
  let nextAt = 2;
  let called = null; // a point you clicked: the next shot goes there
  let windAt = -10;
  let finalAt = -10;
  let restoreAt = -10;
  let streak = 0;
  let record = 0;
  let meterHit = null; // { p, at }
  let knock = { at: -10, d: [0, -1], spin: 0 };
  let headline = 'quiet please.';
  let headlineAt = -10;
  const letters = []; // { ch, gone: { at, v, va } | null, back }

  const setHeadline = (s, t) => {
    headline = s;
    headlineAt = t;
    letters.length = 0;
    for (const ch of s) letters.push({ ch, gone: null, back: 0 });
  };
  setHeadline('quiet please.', -10);

  const clawAt = (open) => {
    const f = facingAt(J, 1, N);
    const s = scale(perp(f), BIG);
    const root = add([J[2], J[3]], s, 12 * K);
    const wrist = add(root, nrm(add(scale(f, 0.75), s, 0.65)), 18 * K);
    const dir = nrm(add(f, s, -0.1));
    const side = scale(perp(dir), BIG);
    const palm = add(wrist, dir, 4 * K);
    const front = add(palm, dir, 62 * K);
    const hinge = add(front, side, 14 * K);
    const dd = rot(dir, BIG * (-0.12 + open * 1.6));
    return { root, wrist, palm, front, hinge, tip: add(hinge, dd, 30 * K), muzzle: add(front, dir, 12 * K), dir, side };
  };
  // the shot it's cocking for, and whether any shot is still on its way
  const pending = () => shots.find((s) => s.fire > stage.t);
  const busy = () => shots.some((s) => !s.popped);
  const cockAt = (t) => {
    const s = pending();
    if (s) {
      const len = s.big ? s.fire - windAt : COCK;
      if (t >= s.fire - len) return Math.min(1, (t - (s.fire - len)) / (len * (s.big ? 0.5 : 0.7)));
    }
    if (finalAt > 0 && t > finalAt + 2.4) return Math.min(1, (t - finalAt - 2.4) / 0.25);
    return 0;
  };

  function schedule(t, to, big = false) {
    const fire = t + (big ? 1.25 : COCK);
    const db = big ? 218 : Math.min(199, 142 + streak * 6 + Math.random() * 3);
    shots.push({ fire, at: fire + FLIGHT, from: null, to, db, big, popped: false });
  }

  stage.on('click', (x, y) => {
    if (finalAt > 0 && stage.t - finalAt < 4) return;
    called = [x, y];
  });

  function step(dt, t) {
    const c = [p.x, p.y];
    const k = arrowScale(stage);
    const blown = finalAt > 0 && t - finalAt < 4;
    // queue the next shot: on the beat, at the cursor (or where you clicked)
    if (!busy() && !blown) {
      if (p.real && p.still > 1.4 && windAt < 0 && t > restoreAt + 3 && Math.hypot(c[0] - J[0], c[1] - J[1]) < 900) {
        windAt = t;
        schedule(t, add(c, [9 * k, 14 * k]), true);
        if (headline === 'quiet please.') setHeadline('QUIET.', t);
      } else if (called) {
        schedule(t, called);
        called = null;
      } else if (t >= nextAt && Math.hypot(c[0] - J[0], c[1] - J[1]) < 1100) {
        schedule(t, add(c, [9 * k, 14 * k]));
        nextAt = t + BEAT * 2;
      }
    }
    const next = pending();
    let goal = c;
    let off = RANGE + 30;
    let rate = 2.6;
    if (next && t > next.fire - (next.big ? 1.5 : 0.5)) {
      goal = next.to;
      off = next.big ? 400 : RANGE;
      rate = next.big ? 1.2 : 3.2;
    }
    if (blown) rate = 0.05;
    // it keeps its distance: closer than it likes, it backs off
    const d = Math.hypot(goal[0] - J[0], goal[1] - J[1]);
    const f = facingAt(J, 0, N);
    let back = d < off - 30 ? Math.min(160, (off - 30 - d) * 3) * dt : 0;
    // recoil: each snap kicks it back too
    for (const s of shots)
      if (!s.from && t >= s.fire) {
        s.from = clawAt(0).muzzle;
        back += s.big ? 60 : 18;
      }
    if (back > 0)
      for (let i = 0; i < N; i++) {
        J[i * 2] -= f[0] * back;
        J[i * 2 + 1] -= f[1] * back;
      }
    // never backs itself off the page
    const m = 60;
    const fix = [Math.max(0, m - Math.min(...Array.from({ length: N }, (_, i) => J[i * 2]))) - Math.max(0, Math.max(...Array.from({ length: N }, (_, i) => J[i * 2])) - stage.W + m), Math.max(0, m - Math.min(...Array.from({ length: N }, (_, i) => J[i * 2 + 1]))) - Math.max(0, Math.max(...Array.from({ length: N }, (_, i) => J[i * 2 + 1])) - stage.H + m)];
    if (fix[0] || fix[1])
      for (let i = 0; i < N; i++) {
        J[i * 2] += fix[0] * 0.2;
        J[i * 2 + 1] += fix[1] * 0.2;
      }
    steer(J, goal, { off, rate, dt, maxTurn: 0.5, turnSpeed: d > off ? 110 : 50 });
    followChain(J, N, segLen, 0.1);
    gaitStep(gait, J, N, LEGS, t, { stepAt: 20 * K, stepTime: 0.08, dt });

    // pops
    for (const s of shots) {
      if (s.popped || t < s.at) continue;
      s.popped = true;
      record = Math.max(record, s.db);
      stage.bump();
      const hit = Math.hypot(c[0] + 9 * k - s.to[0], c[1] + 14 * k - s.to[1]) < 70;
      if (s.big) {
        finalAt = t;
        windAt = -10;
        stage.shake(40);
        knock = { at: t, d: nrm(sub(c, [J[0], J[1]])), spin: 14 };
        for (const l of letters) l.gone = { at: t, v: [(Math.random() - 0.5) * 1400, -600 - Math.random() * 900], va: (Math.random() - 0.5) * 20 };
      } else {
        stage.shake(hit ? 12 : 6);
        if (hit) {
          streak++;
          knock = { at: t, d: nrm(sub(c, s.from)), spin: (Math.random() < 0.5 ? -1 : 1) * 5 };
        } else streak = Math.max(0, streak - 1);
        const m = meterBox();
        if (s.to[0] > m.x - 20 && s.to[0] < m.x + m.w + 20 && Math.abs(s.to[1] - (m.y + m.h / 2)) < 60) meterHit = { p: s.to, at: t };
        // a direct hit on the headline blows letters off
        letterPositions().forEach((q, i) => {
          const l = letters[i];
          if (!l || l.gone || l.ch === ' ') return;
          const dd = Math.hypot(q[0] - s.to[0], q[1] - s.to[1]);
          if (dd < 150) {
            const u = nrm(sub(q, s.to));
            l.gone = { at: t, v: [u[0] * 900, u[1] * 500 - 700], va: (Math.random() - 0.5) * 16 };
            l.back = t + 5;
          }
        });
      }
    }
    while (shots.length && t - shots[0].at > 3) shots.shift();
    // letters come back
    for (const l of letters) if (l.gone && l.back && t > l.back) l.gone = null;
    // after the big one: ringing ears, then the page comes back
    if (finalAt > 0) {
      const s = t - finalAt;
      if (s > 0.85 && headline !== 'what?' && s < 3.5) setHeadline('what?', t);
      if (s > 4 && restoreAt < finalAt) {
        restoreAt = t;
        setHeadline('quiet please.', t);
        meterHit = null;
        record = 0;
        streak = 0;
        nextAt = t + 1;
      }
      if (s > 4.6) finalAt = -10;
    }
  }

  // where each letter of the headline sits
  let measured = null;
  const letterPositions = () => {
    if (!measured || measured.text !== headline || measured.fs !== fs()) {
      const g = stage.ctx.page;
      g.font = `italic 300 ${fs()}px ${SERIF}`;
      const ws = [...headline].map((ch) => g.measureText(ch).width);
      const total = ws.reduce((a, b) => a + b, 0);
      let x = stage.W / 2 - total / 2;
      measured = { text: headline, fs: fs(), xs: ws.map((w) => ((x += w), x - w / 2)) };
    }
    return measured.xs.map((x) => [x, headY()]);
  };

  // the shockwaves: how they've shoved a point (offset, glow, and blown away by the big one)
  const shove = (q, t) => {
    let dx = 0;
    let dy = 0;
    let glow = 0;
    let gone = 0;
    for (const s of shots) {
      const a = t - s.at;
      if (a < 0) continue;
      const v = sub(q, s.to);
      const d = Math.hypot(v[0], v[1]) || 1;
      const speed = s.big ? 2400 : 1500;
      const age = a - d / speed;
      if (age < 0) continue;
      const u = [v[0] / d, v[1] / d];
      if (s.big) {
        if (restoreAt > s.at) continue;
        const fly = 1400 * age + 2200 * age * age;
        dx += u[0] * fly;
        dy += u[1] * fly;
        gone = Math.max(gone, clamp(age / 0.45));
        glow = Math.max(glow, 1 - clamp(age / 0.2));
        continue;
      }
      const reach = 420;
      const amp = 24 * Math.exp(-d / reach);
      const kk = Math.exp(-age * 7) * Math.sin(age * 30);
      dx += u[0] * amp * kk;
      dy += u[1] * amp * kk;
      glow = Math.max(glow, Math.abs(kk) * Math.exp(-d / reach) * 1.4);
    }
    return { d: [dx, dy], glow: clamp(glow), gone };
  };

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawPage(g, t) {
    const back = restoreAt > 0 ? clamp((t - restoreAt) / 0.6) : 1;
    for (let y = 24; y < stage.H; y += 48)
      for (let x = 24; x < stage.W; x += 48) {
        const s = shove([x, y], t);
        if (s.gone >= 1) continue;
        g.globalAlpha = (1 - s.gone) * back;
        g.fillStyle = s.glow > 0.05 ? `rgba(200,245,255,${0.09 + 0.6 * s.glow})` : 'rgba(255,255,255,0.09)';
        dot(g, x + s.d[0], y + s.d[1], 2.4 + 2 * s.glow);
      }
    g.globalAlpha = 1;
    // the headline, letter by letter
    g.font = `italic 300 ${fs()}px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const pop = headlineAt > 0 ? clamp((t - headlineAt) / 0.3) : 1;
    letterPositions().forEach((q, i) => {
      const l = letters[i];
      if (!l) return;
      let pos = q;
      let a = 0;
      let alpha = 0.24;
      if (l.gone) {
        const s = t - l.gone.at;
        pos = add(q, [l.gone.v[0] * s, l.gone.v[1] * s + 0.5 * 3000 * s * s]);
        a = l.gone.va * s;
        alpha = Math.max(0, 0.5 - s * 0.6);
        if (alpha <= 0) return;
      } else {
        const sh = headline === 'what?' ? { d: [0, 0] } : shove(q, t);
        pos = add(q, sh.d);
        if (l.back) alpha *= clamp((t - l.back) / 0.5);
      }
      g.save();
      g.translate(pos[0], pos[1]);
      g.rotate(a);
      g.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);
      g.fillStyle = `rgba(255,255,255,${alpha * clamp(pop * 1.5)})`;
      g.fillText(l.ch, 0, 0);
      g.restore();
    });
  }

  function drawMeter(g, t) {
    const m = meterBox();
    const last = [...shots].reverse().find((s) => s.popped);
    const floor = 104 + 4 * Math.abs(Math.sin(t * 23) * Math.sin(t * 7.1));
    const lvl = !last ? floor : last.big && t - last.at < 4 ? last.db : Math.max(floor, 100 + (last.db - 100) * Math.exp(-(t - last.at) / 0.3));
    const blown = last && last.big && t - last.at < 4;
    const jolt = blown ? Math.exp(-(t - last.at) * 5) : 0;
    const bump = last ? Math.max(0, 1 - (t - last.at) / 0.3) : 0;
    g.save();
    g.translate(Math.sin(t * 61) * 18 * jolt, Math.sin(t * 47 + 1) * 14 * jolt);
    // the reading
    const shown = last && t - last.at < 4 ? Math.round(last.db) : null;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.save();
    g.translate(m.x, m.y - 26);
    g.scale(1 + 0.1 * bump, 1 + 0.1 * bump);
    g.font = `800 ${Math.min(120, stage.W / 9)}px ${COND}`;
    g.fillStyle = shown && shown >= 160 ? (shown >= 180 ? '#ff4d5e' : '#ffc94a') : '#fff';
    if (blown) {
      g.shadowColor = 'rgba(255,77,94,0.9)';
      g.shadowBlur = 30;
    }
    const num = shown ? String(shown) : '—';
    g.fillText(num, 0, 0);
    const nw = g.measureText(num).width;
    g.font = `700 ${Math.min(52, stage.W / 20)}px ${COND}`;
    g.fillText('dB', nw + 10, 0);
    g.shadowBlur = 0;
    const label = [...LOUDER].reverse().find(([db]) => record >= db)?.[1] ?? '';
    g.font = `600 ${Math.min(34, stage.W / 30)}px system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.textAlign = 'right';
    g.fillText(label, m.w, -10);
    g.restore();
    // the bar
    g.fillStyle = '#0c0f15';
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(m.x, m.y, m.w, m.h, 14);
    g.fill();
    g.stroke();
    const segW = (m.w - 12) / SEGS;
    const total = blown ? SEGS + Math.round(26 * clamp((t - last.at) / 0.25)) : SEGS;
    for (let k = 0; k < total; k++) {
      const db = 100 + ((k + 0.5) / SEGS) * 100;
      const lit = db <= lvl || k >= SEGS;
      const x = m.x + 6 + k * segW;
      const dead = meterHit && Math.abs(x - meterHit.p[0]) < 40 && Math.sin(t * 40 + k) > -0.2;
      const wob = k >= SEGS ? Math.sin(t * 50 + k * 1.3) * 6 : 0;
      g.globalAlpha = k >= SEGS ? 0.6 + 0.4 * Math.sin(t * 30 + k) : 1;
      g.fillStyle = lit && !dead ? segColor(Math.min(db, 199)) : 'rgba(255,255,255,0.07)';
      g.beginPath();
      g.roundRect(x, m.y + 8 + wob, segW - 4, m.h - 16, 3);
      g.fill();
    }
    g.globalAlpha = 1;
    if (last && !blown && t - last.at < 4) {
      g.fillStyle = '#fff';
      g.fillRect(dbX(last.db) - 3, m.y - 10, 6, m.h + 20);
    }
    g.textAlign = 'center';
    g.font = `500 ${Math.min(28, stage.W / 36)}px ${MONO}`;
    for (const [db, name] of MARKS) {
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 3;
      line(g, [[dbX(db), m.y + m.h + 4], [dbX(db), m.y + m.h + 20]]);
      g.stroke();
      g.fillStyle = record >= db ? '#fff' : 'rgba(255,255,255,0.45)';
      g.fillText(name, dbX(db), m.y + m.h + 52);
    }
    // cracks where a shot went through it
    if (meterHit) {
      g.strokeStyle = 'rgba(235,248,255,0.85)';
      g.lineWidth = 2;
      let seed = 77;
      const r = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const grow = clamp((t - meterHit.at) / 0.1);
      for (let i = 0; i < 7; i++) {
        let a = (i / 7) * Math.PI * 2 + r();
        let q = meterHit.p;
        const P = [q];
        for (let k = 0; k < 5; k++) {
          a += (r() - 0.5) * 0.6;
          q = add(q, [Math.cos(a), Math.sin(a)], (16 + r() * 14) * grow);
          P.push(q);
        }
        line(g, P);
        g.stroke();
      }
    }
    g.restore();
  }

  function drawShrimp(g, t) {
    const P = Array.from({ length: N }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
    const F = (i) => facingAt(J, i, N);
    const side = (i, s, w = width(i)) => add(P[i], perp(F(i)), w * s);
    const open = cockAt(t);
    const next = pending();
    const charge = next && next.big ? smooth(windAt, next.fire - 0.1, t) : 0;
    const poly = (pts, stroke, w, close = true, fill = BG) => {
      line(g, pts, close);
      if (close && fill) {
        g.fillStyle = fill;
        g.fill();
      }
      g.strokeStyle = stroke;
      g.lineWidth = w;
      g.stroke();
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    LEGS.forEach((leg, li) => {
      const f = F(leg.at);
      const hip = add(P[leg.at], perp(f), leg.hip * leg.side);
      const foot = [gait.feet[li * 2], gait.feet[li * 2 + 1]];
      const knee = ik2(hip, foot, 18 * K, 18 * K, leg.side);
      poly([hip, knee, foot], bone(leg.at, 74), 2.4, false);
      g.fillStyle = bone(leg.at, 78);
      dot(g, knee[0], knee[1], 2.6);
      dot(g, foot[0], foot[1], 2.6 + 1.6 * gaitLift(gait, t, li));
    });
    for (let i = 4; i <= 8; i++)
      for (const s of [-1, 1]) {
        const a = side(i, s, width(i) * 0.95);
        poly([a, add(add(a, perp(F(i)), s * 9 * K * (0.8 + 0.4 * Math.sin(t * 14 - i))), F(i), -5 * K)], bone(i, 72), 1.6, false);
      }
    for (const s of [-1, 1]) {
      const f = F(11);
      const root = side(11, s, width(11) * 0.6);
      const dir = nrm(add(scale(f, -0.8), perp(f), s * 0.6));
      const ctr = mix(root, add(root, dir, 34 * K), 0.5);
      g.beginPath();
      g.ellipse(ctr[0], ctr[1], 18 * K, 7.5 * K, Math.atan2(dir[1], dir[0]), 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = bone(12);
      g.lineWidth = 2.2;
      g.stroke();
    }
    poly([side(10, -1), side(11, -1, width(11)), add(P[12], F(12), -16 * K), side(11, 1, width(11)), side(10, 1)], bone(12), 2.6);
    for (let i = 9; i >= 4; i--) {
      poly([side(i, -1), side(i + 1, -1, width(i + 1) * 0.96), side(i + 1, 1, width(i + 1) * 0.96), side(i, 1)], bone(i), 2.6);
      const mm = mix(P[i], P[i + 1], 0.45);
      poly([add(mm, perp(F(i)), -width(i) * 0.7), add(mm, perp(F(i)), width(i) * 0.7)], bone(i, 68), 1.2, false);
      g.fillStyle = bone(i);
      dot(g, mm[0], mm[1], 3);
    }
    const f0 = F(0);
    for (const s of [-1, 1])
      for (const long of [true, false]) {
        const root = add(add(P[0], f0, 4 * K), perp(f0), s * (long ? 7 : 4) * K);
        const A = [root];
        let dir = nrm(add(f0, perp(f0), s * (long ? 0.55 : 0.2)));
        let q = root;
        for (let k = 0; k < (long ? 12 : 5); k++) {
          dir = rot(dir, s * (long ? 0.05 : 0.08) + 0.05 * Math.sin(t * 3.5 + k * 0.5 + s));
          q = add(q, dir, (long ? 19 : 11) * K);
          A.push(q);
        }
        poly(A, bone(0, 82), long ? 1.6 : 2, false);
      }
    {
      const s = -BIG;
      const f = F(1);
      const root = add(P[1], perp(f), s * 11 * K);
      const elbow = add(root, nrm(add(f, perp(f), s * 0.5)), 20 * K);
      const hand = add(elbow, nrm(add(f, perp(f), s * 0.05)), 18 * K);
      poly([root, elbow, hand], bone(1, 80), 2.6, false);
      for (const o of [-0.25, 0.25]) poly([hand, add(hand, rot(f, o), 9 * K)], bone(1, 82), 2.4, false);
    }
    poly([add(P[0], f0, 10 * K), side(0, 1), side(1, 1), side(2, 1), side(3, 1), side(4, 1), side(4, -1), side(3, -1), side(2, -1), side(1, -1), side(0, -1)], bone(1), 3);
    poly(P.slice(0, 5), bone(1, 66), 1.4, false);
    for (const s of [-1, 1]) {
      const e = add(add(P[0], f0, -2 * K), perp(f0), s * 7 * K);
      g.beginPath();
      g.arc(e[0], e[1], 7 * K, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = bone(0, 82);
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = bone(0, 88);
      dot(g, e[0] + f0[0] * 2, e[1] + f0[1] * 2, 3 * K);
    }
    // the big claw
    const c = clawAt(open);
    const glow = Math.max(open * 0.5, charge);
    const pulse = charge > 0 ? 0.5 + 0.5 * Math.sin(t * (20 + 30 * charge)) : 0;
    poly([c.root, c.wrist, c.palm], CLAW(80), 5, false);
    g.fillStyle = CLAW(82);
    dot(g, c.wrist[0], c.wrist[1], 5);
    const ctr = mix(c.wrist, c.front, 0.52);
    g.beginPath();
    g.ellipse(ctr[0], ctr[1], 35 * K, 19 * K, Math.atan2(c.dir[1], c.dir[0]), 0, Math.PI * 2);
    g.fillStyle = glow > 0.02 ? `hsla(${38 - 20 * charge}, 100%, ${60 + 15 * pulse}%, ${0.15 + 0.6 * glow})` : BG;
    g.fill();
    g.strokeStyle = CLAW(84);
    g.lineWidth = 3.4;
    g.stroke();
    poly([add(add(c.front, c.dir, -4 * K), c.side, -12 * K), add(add(c.front, c.side, -4 * K), c.dir, 16 * K), add(c.front, c.side, 4 * K)], CLAW(84), 3);
    const dPerp = scale(perp(nrm(sub(c.tip, c.hinge))), BIG);
    poly([add(c.hinge, dPerp, 9 * K), add(mix(c.hinge, c.tip, 0.6), dPerp, 9 * K), c.tip, add(mix(c.hinge, c.tip, 0.5), dPerp, -6 * K), add(c.hinge, dPerp, -7 * K)], CLAW(86), 3, true, open > 0.95 ? CLAW(60) : BG);
    g.fillStyle = CLAW(88);
    dot(g, c.hinge[0], c.hinge[1], 4);
    if (charge > 0) {
      g.strokeStyle = SHOCK;
      g.lineWidth = 1.6;
      for (let k = 0; k < 14; k++) {
        const ph = (t * (1.2 + charge) + k * 0.37) % 1;
        const a = k * 2.4;
        const q = add(c.muzzle, [Math.cos(a), Math.sin(a)], (1 - ph) * (90 + 60 * ((k * 0.61) % 1)) * K * 0.6);
        g.globalAlpha = ph * charge;
        g.beginPath();
        g.arc(q[0], q[1], 2 + 4 * ph, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // smoke off the claw after the big one
    if (finalAt > 0 && t - finalAt > 1.4) {
      g.fillStyle = 'rgba(225,230,240,0.18)';
      for (let k = 0; k < 22; k++) {
        const a = t - (finalAt + 1.4 + k * 0.07);
        if (a < 0 || a > 1.4) continue;
        const q = add(c.muzzle, [Math.sin(a * 4 + k * 0.4) * 30 * a + 20 * a, -130 * a]);
        g.globalAlpha = 1 - a / 1.4;
        dot(g, q[0], q[1], 10 + 26 * a);
      }
      g.globalAlpha = 1;
    }
  }

  function drawShots(g, t) {
    g.lineCap = 'round';
    for (const s of shots) {
      if (!s.from || t < s.fire) continue;
      const M = s.from;
      const T = s.to;
      const big = s.big ? 2.6 : 1;
      if (t < s.at) {
        const u = (t - s.fire) / FLIGHT;
        const q = mix(M, T, u);
        g.globalAlpha = 0.85;
        g.strokeStyle = '#fff';
        g.lineWidth = 10 * big;
        line(g, [mix(M, T, Math.max(0, u - 0.6)), q]);
        g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(200,245,255,0.35)';
        g.beginPath();
        g.arc(q[0], q[1], 12 * big, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 3;
        g.stroke();
        g.globalAlpha = 1 - u;
        g.fillStyle = '#fff';
        dot(g, M[0], M[1], 26 * big * (1 - u));
        g.globalAlpha = 1;
        continue;
      }
      const a = t - s.at;
      if (a < 0.16) {
        g.globalAlpha = 1 - a / 0.16;
        g.strokeStyle = SHOCK;
        g.lineWidth = 4 * big;
        line(g, [M, T]);
        g.stroke();
      }
      if (a < 0.14) {
        g.globalAlpha = 1 - a / 0.14;
        g.fillStyle = '#fff';
        dot(g, T[0], T[1], (14 + 70 * clamp(a / 0.05)) * big);
      }
      if (s.big && a < 0.3) {
        const kk = 1 - a / 0.3;
        g.globalAlpha = kk;
        g.fillStyle = '#fff6c8';
        dot(g, T[0], T[1], 80 * kk + 20);
        g.strokeStyle = '#ffe27a';
        g.lineWidth = 8;
        for (let j = 0; j < 16; j++) {
          const ang = (j / 16) * Math.PI * 2 + a * 3;
          line(g, [add(T, [Math.cos(ang), Math.sin(ang)], 110 * kk + 30), add(T, [Math.cos(ang), Math.sin(ang)], (220 + (j % 2) * 90) * kk + 40)]);
          g.stroke();
        }
      }
      const R = (s.big ? 2400 : 1500) * a;
      const fade = s.big ? 1 - clamp(R / 2300) : 1 - clamp(R / 460);
      if (fade > 0) {
        g.globalAlpha = fade;
        g.strokeStyle = SHOCK;
        g.lineWidth = (s.big ? 14 : 6) * (0.4 + 0.6 * fade);
        g.beginPath();
        g.arc(T[0], T[1], R, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = fade * 0.6;
        g.lineWidth = (s.big ? 6 : 2.5) * fade;
        g.beginPath();
        g.arc(T[0], T[1], R * 0.72, 0, Math.PI * 2);
        g.stroke();
      }
      if (a < 0.6) {
        g.globalAlpha = 1 - a / 0.6;
        g.strokeStyle = SHOCK;
        g.lineWidth = 1.6;
        for (let j = 0; j < 8; j++) {
          const ang = j * 0.785 + s.at;
          const sp = 60 + ((j * 0.37 + s.at) % 1) * 120;
          g.beginPath();
          g.arc(T[0] + Math.cos(ang) * sp * a, T[1] + Math.sin(ang) * sp * a - 60 * a, (3 + (j % 3) * 2) * big, 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
  }

  // the cursor, drawn here so it can be knocked about (and blown clean off the page)
  function drawCursor(g, t) {
    const k = arrowScale(stage);
    let at = [p.x, p.y];
    let a = 0;
    const u = (t - knock.at) / 0.45;
    if (finalAt > 0 && t - finalAt < 4) {
      const s = t - finalAt;
      if (s < 0.6) {
        at = add(at, knock.d, 2600 * s);
        a = knock.spin * s;
      } else if (s < 1.6) return;
      else {
        // falls back down from where it was blown to
        const f = clamp((s - 1.6) / 0.5);
        at = [p.x, -60 + (p.y + 60) * f * f];
        a = (1 - f) * 2;
      }
    } else if (u >= 0 && u < 1) {
      at = add(at, knock.d, 70 * Math.sin(Math.PI * u) * (1 - u * 0.3));
      a = knock.spin * u * (1 - u);
    }
    g.save();
    g.translate(at[0], at[1]);
    g.rotate(a);
    g.scale(k, k);
    g.lineJoin = 'round';
    g.lineWidth = 2.2;
    g.fillStyle = '#000';
    g.strokeStyle = '#fff';
    g.fill(ARROW);
    g.stroke(ARROW);
    g.restore();
  }

  function draw(ctx, t) {
    drawPage(ctx.page, t);
    drawShrimp(ctx.shrimp, t);
    drawMeter(ctx.meter, t);
    drawShots(ctx.shots, t);
    drawCursor(ctx.top, t);
    stage.stats(`record ${record ? Math.round(record) : '—'} dB · streak ${streak}`);
  }

  return { step, draw };
}
