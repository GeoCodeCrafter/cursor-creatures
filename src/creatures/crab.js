// a skeleton hermit crab that has outgrown its shell. it follows your cursor, house
// hunting. click a letter in the headline and it'll fetch it and try it on (it never
// fits). hold still and it sizes up your cursor, grabs it, turns it round and backs
// right into it. then it's your cursor: it walks wherever you point.

import { dot, line } from '../kit/stage.js';
import { clamp, ease, followChain, ik2 } from '../kit/math.js';
import { add, ARROW, arrowScale, facingAt, gaitInit, gaitLift, gaitStep, mix, nrm, perp, rot, steer, sub } from '../kit/body.js';

const BONE = '#fff1e8';
const BG = '#06070b';
const LETTER = 'rgba(255,236,226,0.92)';
const SERIF = "Fraunces, 'Iowan Old Style', Georgia, serif";
const HEADLINE = 'move your mouse';
const VERDICT = { o: 'too drafty', m: 'too heavy', u: 'upside down?', v: 'too pointy', s: 'too slippery', y: 'too thin', e: 'too thin', r: 'too thin' };

export const meta = {
  file: 'crab.js',
  hint: 'click a letter · hold still',
  ghost: false,
  layers: [{ name: 'page' }, { name: 'crab', glow: 'rgba(255,125,80,0.6)' }],
  vars: { accent: 'rgba(255,170,140,0.95)' },
  ripple: 'rgba(255,255,255,0.75)',
};

const K = 2;
const N = 6; // 0 front of the shell-less body · 1–2 thorax · 3–5 the soft abdomen
const segLen = (i) => [16, 16, 14, 12, 10][Math.min(4, i)] * K;
const LEGS = [
  { at: 1, side: -1, angle: 1.2, hip: 13 * K, reach: 34 * K, group: 0 },
  { at: 1, side: 1, angle: 1.2, hip: 13 * K, reach: 34 * K, group: 1 },
  { at: 2, side: -1, angle: 1.8, hip: 13 * K, reach: 36 * K, group: 1 },
  { at: 2, side: 1, angle: 1.8, hip: 13 * K, reach: 36 * K, group: 0 },
];
const TAPS = [0.25, 0.55, 0.85];

export function create(stage) {
  const p = stage.pointer;
  const J = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    J[i * 2] = stage.W * 0.5;
    J[i * 2 + 1] = stage.H * 0.78 + i * segLen(i);
  }
  const gait = gaitInit(J, N, LEGS);

  // the headline, laid out in fixed boxes so letters can be taken
  const fs = () => Math.min(150, (stage.W * 0.9) / HEADLINE.length / 0.473);
  const box = () => fs() * 0.473;
  const headY = () => stage.H * 0.4 + fs() * 0.5;
  const letterAt = (i) => [stage.W / 2 - (HEADLINE.length * box()) / 2 + box() * i + box() / 2, headY()];
  const taken = new Map(); // letter index -> time it comes back

  // follow · fetch (going for a letter) · try (wearing it) · measure · movein · wear · moveout
  let mode = 'follow';
  let modeT = 0;
  let status = 'too small';
  let target = -1; // the letter it's after
  let worn = null; // { ch, i, at } the letter on its back
  const falling = []; // letters sliding off { ch, p, v, a, at }
  let grabP = [0, 0];
  let wearAt = -10;
  let clicks = []; // ripples of its claw clicks
  let snapAt = -10;
  let babyAt = -10;
  let popAt = 0.8;
  const oldShell = () => [stage.W * 0.14, stage.H * 0.86];
  const set = (m, t) => {
    mode = m;
    modeT = t;
  };
  stage.cursor.hidden = false;

  const frame = () => {
    const P = Array.from({ length: N }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
    const f = facingAt(J, 1, N);
    return { P, f, n: perp(f) };
  };
  const backAt = () => {
    const { P, f } = frame();
    return { p: add(P[4], f, -6 * K), f };
  };
  const clawTip = () => {
    const { P, f, n } = frame();
    return add(add(P[0], f, 44 * K), n, 14 * K);
  };

  stage.on('click', (x, y) => {
    const t = stage.t;
    if (mode === 'wear') {
      snapAt = t;
      clicks.push({ at: t, p: clawTip() });
      return;
    }
    if (mode !== 'follow' && mode !== 'try') return;
    // did you click a letter?
    const b = box();
    for (let i = 0; i < HEADLINE.length; i++) {
      if (HEADLINE[i] === ' ' || taken.has(i)) continue;
      const q = letterAt(i);
      if (Math.abs(x - q[0]) < b / 2 && Math.abs(y - q[1]) < fs() * 0.45) {
        if (worn) dropLetter(t);
        target = i;
        set('fetch', t);
        status = `fetching '${HEADLINE[i]}'`;
        return;
      }
    }
  });
  stage.on('dblclick', () => {
    if (mode === 'wear') moveOut(stage.t);
  });

  function dropLetter(t) {
    const { p: at, f } = backAt();
    falling.push({ ch: worn.ch, p: at, v: [140 + Math.random() * 160, -60], a: Math.atan2(f[1], f[0]) + Math.PI / 2, at: t });
    taken.set(worn.i, t + 6);
    worn = null;
  }
  function moveOut(t) {
    set('moveout', t);
    status = 'moving out';
  }

  function step(dt, t) {
    const c = [p.x, p.y];
    const mt = t - modeT;
    const head = [J[0], J[1]];
    let goal = c;
    let off = 170;
    let rate = 3.4;
    if (mode === 'follow') {
      if (t > popAt + 0.3 && status === 'too small') status = 'house hunting';
      // hold still near it and it sizes your cursor up
      if (p.real && p.still > 1.0 && Math.hypot(c[0] - head[0], c[1] - head[1]) < 320) {
        set('measure', t);
        status = 'trying: cursor';
      }
    } else if (mode === 'fetch') {
      goal = add(letterAt(target), [0, fs() * 0.5]);
      off = 0;
      rate = 3;
      if (Math.hypot(goal[0] - head[0], goal[1] - head[1]) < 60) {
        worn = { ch: HEADLINE[target], i: target, at: t };
        taken.set(target, Infinity);
        set('try', t);
        status = `trying: '${worn.ch}'`;
      }
    } else if (mode === 'try') {
      if (mt > 1.6 && worn) {
        status = VERDICT[worn.ch] || 'too thin';
        dropLetter(t);
      }
      if (mt > 2.4) set('follow', t);
    } else if (mode === 'measure') {
      off = 128;
      rate = 2.2;
      if (p.still < 0.05) {
        set('follow', t);
        status = 'hey.';
      } else if (mt > 1.0) {
        set('movein', t);
        grabP = c;
        stage.cursor.hidden = true;
        status = 'perfect.';
      }
    } else if (mode === 'movein') {
      off = 128;
      rate = 0.5;
      if (mt > 0.6) {
        set('wear', t);
        wearAt = t;
        if (babyAt < 0) babyAt = t + 1.2;
        status = 'moved in';
      }
    } else if (mode === 'wear') {
      // it's your cursor now: it walks wherever you point
      off = 0;
      rate = 1.6;
      if (mt > 12) moveOut(t);
    } else if (mode === 'moveout') {
      off = 0;
      rate = 0;
      if (mt > 0.5) {
        set('follow', t);
        stage.cursor.hidden = false;
        status = 'house hunting';
      }
    }
    if (rate > 0) steer(J, goal, { off, rate, dt, maxTurn: 0.7, turnSpeed: 130 });
    followChain(J, N, segLen, 0.35);
    gaitStep(gait, J, N, LEGS, t, { stepAt: 16 * K, stepTime: 0.09, dt });
    for (const [i, back] of taken) if (t > back + 0.6) taken.delete(i);
    clicks = clicks.filter((k) => t - k.at < 0.45);
    while (falling.length && t - falling[0].at > 0.9) falling.shift();
  }

  // what's on its back right now, and where the cursor is
  function cursorPose(t) {
    const k = arrowScale(stage);
    const { p: back, f } = backAt();
    const end = Math.atan2(-f[1], -f[0]) - Math.atan2(-26, -10);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (mode === 'movein') {
      const u = ease.inOut(clamp((t - modeT) / 0.6));
      return { at: mix(grabP, back, u), a: u * wrap(end), s: k * (1 + 1.8 * u) };
    }
    if (mode === 'wear') {
      const s = t - wearAt;
      const settle = 1 + 0.08 * Math.sin(s * 40) * Math.exp(-s * 8);
      return { at: back, a: wrap(end), s: k * 2.8 * settle };
    }
    if (mode === 'moveout') {
      const u = ease.inOut(clamp((t - modeT) / 0.5));
      return { at: mix(back, [p.x + 9 * k, p.y + 17 * k], u), a: (1 - u) * wrap(end), s: k * (2.8 - 1.8 * u) };
    }
    return null;
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawPage(g, t) {
    // the headline, with the letters it took missing ("home." once it's moved in)
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.font = `italic 300 ${fs()}px ${SERIF}`;
    if (mode === 'wear' || mode === 'movein') {
      const s = clamp((t - modeT) / 0.3);
      g.globalAlpha = mode === 'wear' ? 1 : 1 - s;
      if (mode === 'wear') {
        g.save();
        g.translate(stage.W / 2, headY());
        g.scale(0.9 + 0.1 * ease.back(clamp((t - wearAt) / 0.45)), 0.9 + 0.1 * ease.back(clamp((t - wearAt) / 0.45)));
        g.fillText('home.', 0, 0);
        g.restore();
        g.globalAlpha = 1;
        return;
      }
    }
    for (let i = 0; i < HEADLINE.length; i++) {
      const back = taken.get(i);
      if (back !== undefined && t < back) continue;
      const q = letterAt(i);
      const fade = back !== undefined ? clamp((t - back) / 0.6) : 1;
      g.globalAlpha = (mode === 'movein' ? 1 - clamp((t - modeT) / 0.3) : 1) * fade;
      g.fillText(HEADLINE[i], q[0], q[1]);
    }
    g.globalAlpha = 1;
  }

  function drawShell(g, at, r, a) {
    g.save();
    g.translate(at[0], at[1]);
    g.rotate(a);
    g.beginPath();
    g.ellipse(0, 0, r * 1.05, r * 0.85, 0, 0, Math.PI * 2);
    g.fillStyle = BG;
    g.fill();
    g.lineWidth = 2.6;
    g.stroke();
    g.beginPath();
    for (let k = 0; k <= 60; k++) {
      const u = k / 60;
      const ang = u * Math.PI * 4.2;
      const rr = r * (0.12 + 0.88 * u);
      g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.8);
    }
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }

  function drawPincer(g, wrist, dir, size, open, side) {
    const n = perp(dir);
    const palmEnd = add(wrist, dir, size);
    const fixed = add(add(palmEnd, dir, size * 0.75), n, -side * size * 0.12);
    const hinge = add(palmEnd, n, side * size * 0.28);
    const dact = add(hinge, rot(dir, side * (0.15 + open * 0.7)), size * 0.82);
    const ctr = mix(wrist, palmEnd, 0.55);
    g.beginPath();
    g.ellipse(ctr[0], ctr[1], size * 0.7, size * 0.42, Math.atan2(dir[1], dir[0]), 0, Math.PI * 2);
    g.fillStyle = BG;
    g.fill();
    g.lineWidth = 2.8;
    g.stroke();
    const base = add(palmEnd, n, -side * size * 0.3);
    g.lineWidth = 4;
    line(g, [base, fixed]);
    g.stroke();
    line(g, [hinge, dact]);
    g.stroke();
    g.lineWidth = 1.6;
    for (const u of [0.3, 0.55]) {
      const a = mix(base, fixed, u);
      line(g, [a, add(a, n, side * size * 0.12)]);
      g.stroke();
    }
  }

  function drawCrab(g, t) {
    const { P, f, n } = frame();
    const c = [p.x, p.y];
    const housed = mode === 'wear' || mode === 'moveout' || (mode === 'movein' && t - modeT > 0.5);
    LEGS.forEach((leg, li) => {
      const lf = facingAt(J, leg.at, N);
      const hip = add(P[leg.at], perp(lf), leg.hip * leg.side);
      const foot = [gait.feet[li * 2], gait.feet[li * 2 + 1]];
      const knee = ik2(hip, foot, 24 * K, 24 * K, leg.side * (leg.at === 1 ? -1 : 1));
      const tip = add(foot, nrm(sub(foot, knee)), 9 * K);
      g.strokeStyle = 'rgba(255,140,100,0.25)';
      g.lineWidth = 7;
      line(g, [hip, knee, foot]);
      g.stroke();
      g.strokeStyle = BONE;
      g.lineWidth = 3.2;
      g.stroke();
      g.lineWidth = 2;
      line(g, [foot, tip]);
      g.stroke();
      g.beginPath();
      g.arc(knee[0], knee[1], 4.5, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.lineWidth = 2.2;
      g.stroke();
      g.fillStyle = BONE;
      dot(g, foot[0], foot[1], 3 + 2 * gaitLift(gait, t, li));
    });
    // the soft abdomen, curled (hidden once it's in the cursor)
    if (!housed && t > popAt) {
      const A = [P[2], P[3], P[4], P[5]];
      const back = nrm(sub(P[5], P[4]));
      for (let k = 1; k <= 14; k++) {
        const a = k * 0.42 + Math.sin(t * 6) * 0.08;
        const rr = 18 * K * (1 - k / 18);
        A.push(add(add(P[5], back, rr * Math.sin(a) * 0.9), perp(back), rr * (1 - Math.cos(a))));
      }
      g.strokeStyle = 'rgba(255,140,110,0.22)';
      g.lineWidth = 10 * K;
      line(g, A);
      g.stroke();
      g.strokeStyle = BONE;
      g.lineWidth = 2.4;
      g.stroke();
      g.lineWidth = 1.6;
      for (let k = 1; k < A.length - 2; k += 2) {
        const d = nrm(sub(A[k + 1], A[k - 1]));
        line(g, [add(A[k], perp(d), 6 * K), add(A[k], perp(d), -6 * K)]);
        g.stroke();
      }
    }
    // carapace
    const sh = (i, s, wd) => add(P[i], perp(facingAt(J, i, N)), wd * s * K);
    line(g, [add(P[0], f, 8 * K), sh(0, 1, 18), sh(1, 1, 22), sh(2, 1, 19), add(P[2], f, -8 * K), sh(2, -1, 19), sh(1, -1, 22), sh(0, -1, 18)], true);
    g.fillStyle = BG;
    g.fill();
    g.lineWidth = 3;
    g.stroke();
    g.beginPath();
    g.moveTo(...sh(0, -1, 12));
    g.quadraticCurveTo(P[1][0], P[1][1], ...sh(0, 1, 12));
    g.lineWidth = 1.6;
    g.stroke();
    g.globalAlpha = 0.7;
    g.lineWidth = 1.4;
    line(g, [P[1], add(P[2], f, -6 * K)]);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = BONE;
    for (const [i, s, wd] of [
      [1, -1, 12],
      [1, 1, 12],
      [2, -1, 10],
      [2, 1, 10],
      [0, -1, 8],
      [0, 1, 8],
    ]) {
      const d = sh(i, s, wd);
      dot(g, d[0], d[1], 2.4);
    }
    // antennae
    for (const s of [-1, 1]) {
      const root = add(add(P[0], f, 6 * K), n, s * 4 * K);
      const A = [root];
      let d = nrm(add(f, n, s * 0.5));
      let q = root;
      for (let k = 0; k < 8; k++) {
        d = rot(d, s * (0.05 + 0.06 * Math.sin(t * 5 + k * 0.7 + s)));
        q = add(q, d, 12 * K);
        A.push(q);
      }
      g.lineWidth = 1.4;
      line(g, A);
      g.stroke();
    }
    // eyes on stalks, watching the cursor
    const look = mode === 'fetch' ? letterAt(target) : c;
    for (const s of [-1, 1]) {
      const root = add(add(P[0], f, 5 * K), n, s * 7 * K);
      const dir = nrm(mix(nrm(add(f, n, s * 0.45)), nrm(sub(look, root)), 0.35));
      const e = add(root, dir, 20 * K);
      g.lineWidth = 2.6;
      line(g, [root, e]);
      g.stroke();
      g.beginPath();
      g.arc(e[0], e[1], 6 * K, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.lineWidth = 2.4;
      g.stroke();
      const q = add(e, nrm(sub(look, e)), 2.5 * K);
      g.fillStyle = '#ffb08a';
      dot(g, q[0], q[1], 2.6 * K);
    }
    // claws: the big one on the right, a small one on the left
    const mt = t - modeT;
    const reach = (s) => {
      if (mode === 'fetch' && target >= 0) {
        const q = letterAt(target);
        if (Math.hypot(q[0] - P[0][0], q[1] - P[0][1]) < 160) return q;
      }
      if (mode === 'movein' && s > 0) return cursorPose(t).at;
      if (mode === 'measure' && s < 0) for (const k of TAPS) if (mt >= k - 0.12 && mt < k + 0.06) return c;
      return null;
    };
    for (const s of [-1, 1]) {
      const big = s > 0 ? 1.35 : 0.8;
      const shoulder = add(add(P[0], f, -2 * K), n, s * 15 * K);
      const tgt = reach(s);
      const rest = add(add(shoulder, f, 34 * K * big), n, s * 6 * K);
      const goal = tgt ? add(tgt, nrm(sub(shoulder, tgt)), 14 * K * big) : rest;
      const lim = 42 * K * big;
      const gg = Math.hypot(goal[0] - shoulder[0], goal[1] - shoulder[1]) > lim ? add(shoulder, nrm(sub(goal, shoulder)), lim) : goal;
      const elbow = ik2(shoulder, gg, 22 * K * big, 22 * K * big, s);
      g.lineWidth = 3.4;
      line(g, [shoulder, elbow, gg]);
      g.stroke();
      g.fillStyle = BONE;
      dot(g, elbow[0], elbow[1], 3.8);
      const snap = s > 0 && t - snapAt < 0.18 ? 1 - (t - snapAt) / 0.18 : 0;
      const open = tgt ? 0.6 : Math.max(snap, 0.15 + 0.12 * Math.sin(t * 3 + s));
      drawPincer(g, gg, nrm(sub(gg, elbow)), 16 * K * big, open, s);
    }
  }

  function drawBack(g, t) {
    const { p: back, f } = backAt();
    const fa = Math.atan2(f[1], f[0]);
    // the old shell: popped off at the start, rolls away, and waits
    const u = ease.out(clamp((t - popAt) / 0.9));
    const at = t < popAt ? back : mix(popFrom ?? back, oldShell(), u);
    if (t >= popAt && !popFrom) popFrom = back;
    drawShell(g, at, 14 * K, u * 7 + (t < popAt ? fa : 0));
    if (t >= popAt && t - popAt < 0.4) {
      // POP
      const s = (t - popAt) / 0.4;
      g.globalAlpha = 1 - s;
      g.lineWidth = 3;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const q = add(popFrom, [Math.cos(a), Math.sin(a)], 30 + 70 * s);
        line(g, [q, add(q, [Math.cos(a), Math.sin(a)], 18)]);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // a baby crab moves into the old shell
    if (babyAt > 0 && t > babyAt) drawBaby(g, t);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `italic 300 ${fs()}px ${SERIF}`;
    g.fillStyle = LETTER;
    const letter = (ch, q, a, o = 1) => {
      g.save();
      g.globalAlpha = Math.max(0, o);
      g.translate(q[0], q[1]);
      g.rotate(a);
      g.fillText(ch, 0, 0);
      g.restore();
    };
    if (worn) {
      const s = clamp((t - worn.at) / 0.35);
      const from = letterAt(worn.i);
      const q = mix(from, back, ease.inOut(s));
      letter(worn.ch, [q[0], q[1] - Math.sin(Math.PI * s) * 80], s * (fa + Math.PI / 2));
    }
    for (const l of falling) {
      const s = t - l.at;
      letter(l.ch, add(l.p, [l.v[0] * s, l.v[1] * s + 900 * s * s]), l.a + s * 5, 1 - s / 0.9);
    }
    // the cursor: in its claws, turned round, and then home
    const pose = cursorPose(t);
    if (pose) {
      g.save();
      g.translate(pose.at[0], pose.at[1]);
      g.rotate(pose.a);
      g.scale(pose.s, pose.s);
      g.translate(-9, -17);
      g.lineJoin = 'round';
      g.lineWidth = 2.2;
      g.fillStyle = '#000';
      g.strokeStyle = '#fff';
      g.fill(ARROW);
      g.stroke(ARROW);
      g.restore();
      g.strokeStyle = BONE;
    }
    // its clicks, once it's wearing the cursor
    for (const k of clicks) {
      const s = (t - k.at) / 0.45;
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 4 * (1 - s);
      g.beginPath();
      g.arc(k.p[0], k.p[1], 10 + 50 * s, 0, Math.PI * 2);
      g.stroke();
    }
    // the measuring taps
    if (mode === 'measure')
      for (const k of TAPS) {
        const s = (t - modeT - k) / 0.4;
        if (s < 0 || s > 1) continue;
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.lineWidth = 3 * (1 - s);
        g.beginPath();
        g.arc(p.x, p.y, 8 + 40 * s, 0, Math.PI * 2);
        g.stroke();
      }
    g.strokeStyle = BONE;
  }
  let popFrom = null;

  function drawBaby(g, t) {
    const u = ease.out(clamp((t - babyAt) / 1));
    const at = mix([-80, oldShell()[1] + 80], add(oldShell(), [0, -8]), u);
    const wave = t > babyAt + 1.3 ? Math.sin((t - babyAt) * 10) * 0.6 : 0;
    g.save();
    g.translate(at[0], at[1]);
    g.scale(0.9, 0.9);
    g.lineWidth = 2.2;
    for (const s of [-1, 1])
      for (const k of [0, 1]) {
        line(g, [[0, 0], [s * (26 + k * 6), -6 + k * 18 + Math.sin(t * 30 + k) * 3 * (1 - u)]]);
        g.stroke();
      }
    g.lineWidth = 2;
    line(g, [[-6, -14], [-10, -30]]);
    g.stroke();
    line(g, [[6, -14], [10, -30]]);
    g.stroke();
    for (const x of [-10, 10]) {
      g.beginPath();
      g.arc(x, -32, 4, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.stroke();
    }
    g.save();
    g.translate(14, -16);
    g.rotate((-40 + wave * 60) * (Math.PI / 180));
    g.lineWidth = 2.4;
    line(g, [[0, 0], [16, -18]]);
    g.stroke();
    g.beginPath();
    g.ellipse(20, -22, 7, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.stroke();
    g.restore();
    g.beginPath();
    g.ellipse(0, -10, 14, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2.4;
    g.stroke();
    g.restore();
  }

  function draw(ctx, t) {
    drawPage(ctx.page, t);
    const g = ctx.crab;
    g.strokeStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    drawCrab(g, t);
    drawBack(g, t);
    stage.stats(`home: ${status}`);
  }

  return { step, draw };
}
