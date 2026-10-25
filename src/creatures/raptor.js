// a skeleton raptor that's worked out what a cursor is for. it pokes yours with its snout
// (click), and if you hold still it takes the cursor in its jaws and uses it: selects the
// headline, drags it off the page, right-clicks the stats and deletes them, then closes
// the window. click to make it let go.

import { dot, line } from '../kit/stage.js';
import { clamp, ease, followChain, ik2 } from '../kit/math.js';
import { add, ARROW, arrowScale, facingAt, gaitInit, gaitStep, mix, nrm, perp, rot, steer, sub } from '../kit/body.js';

const BONE = '#f4eeff';
const BG = '#06070b';
const SELECT = 'rgba(80,130,255,0.5)';
const SERIF = "Fraunces, 'Iowan Old Style', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const MENU = ['Copy', 'Paste', 'Delete', 'Close window'];

export const meta = {
  file: 'raptor.js',
  hint: 'hold still · click to make it let go',
  ghost: false,
  layers: [{ name: 'void' }, { name: 'page' }, { name: 'raptor', glow: 'rgba(170,120,255,0.6)' }, { name: 'top' }],
  vars: { accent: 'rgba(200,170,255,0.95)' },
  ripple: 'rgba(255,255,255,0.75)',
};

const K = 1.3;
const N = 30; // 0 snout · 0–4 skull · 5–9 neck · 10–16 body (hips at 16) · 17–29 tail
const HIP = 16;
const SHOULDER = 11;
const segLen = (i) => (i < 5 ? 18 : i < 10 ? 12 : i < 17 ? 15 : 15 - (i - 17) * 0.4) * K;
const LEGS = [
  { at: HIP, side: -1, angle: 1.25, hip: 13 * K, reach: 40 * K, group: 0 },
  { at: HIP, side: 1, angle: 1.25, hip: 13 * K, reach: 40 * K, group: 1 },
];
const SK = [
  [0, 5],
  [10, 10],
  [34, 13],
  [58, 18],
  [74, 23],
  [82, 16],
];

export function create(stage) {
  const p = stage.pointer;
  const J = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    J[i * 2] = stage.W * 0.75 + i * 6;
    J[i * 2 + 1] = stage.H * 0.8 + i * segLen(i);
  }
  const gait = gaitInit(J, N, LEGS);
  const readout = document.querySelector('.readout');
  const chromeEls = [readout, document.querySelector('.back'), document.querySelector('.hint')];
  const pageCanvas = stage.ctx.page.canvas;

  // the window it lives in
  // (below the "all creatures" link)
  const win = () => ({ x: 24, y: 56 / stage.Z, w: stage.W - 48, h: stage.H - 56 / stage.Z - 24, bar: 74 });
  const closeBtn = () => {
    const w = win();
    return [w.x + w.w - 50, w.y + w.bar / 2];
  };
  const fs = () => Math.min(150, (stage.W * 0.86) / 15 / 0.45);
  const headY = () => stage.H * 0.4 + fs() * 0.5;
  const headW = () => fs() * 0.45 * 15;
  const readoutAt = () => {
    const r = readout.getBoundingClientRect();
    if (!r.width) return [stage.W * 0.2, stage.H * 0.85];
    return [(r.left + r.width * 0.45) / stage.Z, (r.top + r.height * 0.7) / stage.Z];
  };

  // follow (poking it) · grab · use (it has the cursor) — and the state of the page
  let mode = 'follow';
  let modeT = 0;
  let task = 0;
  let taskT = 0;
  let pokeAt = 2;
  let grabCool = 2;
  const learned = new Set();
  const clicks = []; // ripples { at, p }
  let snapAt = -10;
  let sel = null; // { from, to } selection across the headline
  let drag = null; // { from, at } headline being dragged
  let dropped = null; // { off, at } headline falling off
  let headlineGone = false;
  let menu = null; // { at, p }
  let deletedAt = -10;
  let closeAt = -10;
  let openAt = -10;
  let taps = [];
  let saidAt = -10;
  const set = (m, t) => {
    mode = m;
    modeT = t;
  };
  const snout = () => [J[0], J[1]];
  const click = (t) => {
    clicks.push({ at: t, p: snout() });
    snapAt = t;
    stage.bump();
  };
  const learn = (s) => learned.add(s);

  // what it does with your cursor, one step at a time
  const H = () => headY();
  const left = () => stage.W / 2 - headW() / 2 - 20;
  const right = () => stage.W / 2 + headW() / 2 + 20;
  const PLAN = [
    { d: 0.8, to: () => [left(), H()], end: (t) => ((sel = { from: snout()[0] }), click(t)) },
    { d: 1.3, to: () => [right(), H()], end: () => learn('select') },
    { d: 0.6, to: () => [stage.W / 2, H()], end: (t) => ((drag = { from: snout() }), click(t)) },
    {
      d: 1.2,
      to: () => [stage.W / 2 + 40, stage.H * 0.8],
      end: (t) => {
        dropped = { off: sub(snout(), drag.from), at: t };
        drag = null;
        sel = null;
        learn('drag');
      },
    },
    { d: 1.0, to: readoutAt, end: (t) => ((menu = { at: t, p: snout() }), click(t)) },
    { d: 0.6, to: () => add(menu.p, [120, 60 * 2.5 + 8]), end: (t) => ((deletedAt = t), (menu = null), learn('delete'), click(t)) },
    { d: 1.2, to: closeBtn, end: (t) => ((closeAt = t), learn('close'), click(t)) },
    { d: 0.9, to: () => [stage.W / 2, stage.H * 0.5] },
    { d: 0.45, to: () => [stage.W / 2, stage.H * 0.5], end: (t) => taps.push({ at: t, p: snout() }) },
    { d: 0.45, to: () => [stage.W / 2, stage.H * 0.5], end: (t) => taps.push({ at: t, p: snout() }) },
    { d: 2.6, to: () => [stage.W / 2, stage.H * 0.5], end: (t) => letGo(t, 'reopened.') },
  ];

  function letGo(t, msg) {
    set('follow', t);
    grabCool = t + 5;
    pokeAt = t + 2;
    stage.cursor.hidden = false;
    menu = null;
    drag = null;
    if (closeAt > 0 || headlineGone || deletedAt > 0) {
      openAt = t;
      closeAt = -10;
    }
    say(msg);
  }
  const say = (s) => {
    saidAt = stage.t;
    sayText = s;
  };
  let sayText = '';

  stage.on('click', () => {
    if (mode === 'use' || mode === 'grab') letGo(stage.t, 'let go!');
  });

  function step(dt, t) {
    const c = [p.x, p.y];
    const sn = snout();
    const d = Math.hypot(c[0] - sn[0], c[1] - sn[1]);
    let goal = c;
    let off = 70;
    let rate = 3.5;
    if (mode === 'follow') {
      // poke, poke: every poke's a click
      const poking = t >= pokeAt - 0.14 && t < pokeAt + 0.04;
      if (poking) {
        off = 0;
        rate = 12;
      }
      if (t >= pokeAt + 0.04) {
        if (d < 90) {
          clicks.push({ at: t, p: c });
          snapAt = t;
          learn('click');
          stage.bump();
        }
        pokeAt = t + (d < 200 ? 1.1 : 0.6);
      }
      if (p.real && t > grabCool && p.still > 1.0 && d < 260) {
        set('grab', t);
        stage.cursor.hidden = true;
      }
    } else if (mode === 'grab') {
      off = 0;
      rate = 10;
      if (t - modeT > 0.3) {
        set('use', t);
        task = 0;
        taskT = t;
        snapAt = t;
      }
    } else if (mode === 'use') {
      const st = PLAN[task];
      goal = st.to();
      off = 0;
      rate = 7;
      if (t - taskT >= st.d) {
        if (st.end) st.end(t);
        task++;
        taskT = t;
        if (task >= PLAN.length || mode !== 'use') task = 0;
      }
    }
    steer(J, goal, { off, rate, dt, maxTurn: 0.6, turnSpeed: 160 });
    followChain(J, N, segLen, 0.16);
    gaitStep(gait, J, N, LEGS, t, { stepAt: 24 * K, stepTime: 0.14, dt });

    if (sel) sel.to = clamp(snout()[0], sel.from, right());
    if (dropped && t - dropped.at > 0.9) {
      headlineGone = true;
      dropped = null;
    }
    while (clicks.length && t - clicks[0].at > 0.45) clicks.shift();
    taps = taps.filter((k) => t - k.at < 0.7);
    if (openAt > 0 && t - openAt > 0.45) {
      openAt = -10;
      headlineGone = false;
      deletedAt = -10;
    }

    // the stats panel: deleted (and back when the window reopens)
    const u = deletedAt > 0 ? clamp((t - deletedAt) / 0.3) : 0;
    readout.style.transformOrigin = 'left center';
    readout.style.transform = `scale(${1 + u * 0.4})`;
    readout.style.filter = u > 0 ? `blur(${u * 6}px)` : '';
    const cl = closing(t);
    readout.style.opacity = String((1 - u) * (1 - cl));
    for (const e of chromeEls.slice(1)) if (e) e.style.opacity = String(1 - cl);
    const [bx, by] = closeBtn();
    pageCanvas.style.transformOrigin = `${bx * stage.Z}px ${by * stage.Z}px`;
    pageCanvas.style.transform = cl > 0 ? `scale(${1 - 0.92 * cl})` : '';
    pageCanvas.style.opacity = String(1 - cl);
    if (saidAt > 0 && t - saidAt > 1.6) saidAt = -10;
  }
  const closing = (t) => {
    if (closeAt > 0) return ease.in(clamp((t - closeAt - 0.03) / 0.37));
    if (openAt > 0) return 1 - ease.out(clamp((t - openAt) / 0.4));
    return 0;
  };

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawPage(g, t) {
    const w = win();
    const [bx, by] = closeBtn();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(w.x, w.y, w.w, w.h, 26);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.roundRect(w.x, w.y, w.w, w.bar, [26, 26, 0, 0]);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    line(g, [[w.x, w.y + w.bar], [w.x + w.w, w.y + w.bar]]);
    g.stroke();
    ['#ff6b62', '#ffbd44', '#2fd158'].forEach((col, k) => {
      g.globalAlpha = 0.75;
      g.fillStyle = col;
      dot(g, w.x + 40 + k * 36, w.y + w.bar / 2, 10);
    });
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = `500 30px ${MONO}`;
    g.fillText('raptor.html', stage.W / 2, w.y + w.bar / 2);
    const sn = snout();
    const hot = mode === 'use' && Math.hypot(sn[0] - bx, sn[1] - by) < 120;
    const pressed = closeAt > 0 && t - closeAt < 0.12;
    g.fillStyle = pressed ? '#c4282a' : hot ? '#e5484d' : 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.roundRect(bx - 32, by - 27, 64, 54, 12);
    g.fill();
    g.strokeStyle = '#fff';
    g.globalAlpha = hot ? 1 : 0.6;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(bx - 12, by - 12);
    g.lineTo(bx + 12, by + 12);
    g.moveTo(bx + 12, by - 12);
    g.lineTo(bx - 12, by + 12);
    g.stroke();
    g.globalAlpha = 1;

    // the headline: selected, dragged off, dropped
    if (!headlineGone) {
      let off = [0, 0];
      let a = 0;
      let o = 1;
      if (drag) off = sub(snout(), drag.from);
      if (dropped) {
        const s = t - dropped.at;
        off = add(dropped.off, [0, 0.5 * 2600 * s * s]);
        a = s * 0.7;
        o = clamp(1 - s / 0.9);
      }
      g.save();
      g.globalAlpha = o;
      g.translate(stage.W / 2 + off[0], headY() + off[1]);
      g.rotate(a);
      if (sel) {
        g.fillStyle = SELECT;
        g.beginPath();
        g.roundRect(sel.from - stage.W / 2, -fs() * 0.52, Math.max(0, (sel.to ?? sel.from) - sel.from), fs() * 1.05, 6);
        g.fill();
      }
      g.fillStyle = sel || drag || dropped ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.13)';
      g.font = `italic 300 ${fs()}px ${SERIF}`;
      g.fillText('move your mouse', 0, 0);
      g.restore();
    }

    // the right-click menu
    if (menu) {
      const s = ease.back(clamp((t - menu.at) / 0.25));
      const ih = 60;
      g.save();
      g.translate(menu.p[0], menu.p[1]);
      g.scale(0.85 + 0.15 * s, 0.85 + 0.15 * s);
      g.globalAlpha = clamp(s * 2);
      g.fillStyle = '#1d1b27';
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(0, 0, 290, ih * 4 + 16, 14);
      g.fill();
      g.stroke();
      const hover = Math.floor((snout()[1] - menu.p[1] - 8) / ih);
      g.textAlign = 'left';
      g.font = `500 32px ${SANS}`;
      MENU.forEach((item, k) => {
        if (k === hover) {
          g.fillStyle = 'rgba(110,140,255,0.45)';
          g.fillRect(0, 8 + k * ih, 290, ih);
        }
        g.fillStyle = item === 'Delete' ? '#ff8a8a' : 'rgba(255,255,255,0.85)';
        g.fillText(item, 22, 8 + k * ih + ih / 2);
      });
      g.restore();
    }
  }

  function drawRaptor(g, t) {
    const P = Array.from({ length: N }, (_, i) => [J[i * 2], J[i * 2 + 1]]);
    const F = (i) => facingAt(J, i, N);
    const stroke = (pts, w, close = false) => {
      line(g, pts, close);
      g.lineWidth = w;
      g.stroke();
    };
    stroke(P.slice(HIP), 3.2);
    for (let i = HIP + 1; i < N - 1; i++) {
      const f = F(i);
      const n = perp(f);
      const w = (9 - (i - HIP) * 0.5) * K;
      stroke([add(add(P[i], n, w), f, -w * 0.8), P[i], add(add(P[i], n, -w), f, -w * 0.8)], 1.6);
    }
    LEGS.forEach((leg, li) => {
      const f = F(leg.at);
      const hip = add(P[leg.at], perp(f), leg.hip * leg.side);
      const foot = [gait.feet[li * 2], gait.feet[li * 2 + 1]];
      const ft = Math.hypot(foot[0] - hip[0], foot[1] - hip[1]) > 56 * K ? add(hip, nrm(sub(foot, hip)), 56 * K) : foot;
      const knee = ik2(hip, ft, 30 * K, 30 * K, -leg.side);
      stroke([hip, knee, ft], 4.4);
      g.fillStyle = BONE;
      dot(g, knee[0], knee[1], 5);
      for (const a of [-0.35, 0, 0.35]) stroke([ft, add(ft, rot(f, a), 14 * K)], 2.6);
      const sk = add(ft, rot(f, -leg.side * 0.9), 10 * K);
      const tip = add(sk, rot(f, -leg.side * 0.2), 8 * K);
      g.strokeStyle = '#d8c4ff';
      g.beginPath();
      g.moveTo(ft[0], ft[1]);
      g.quadraticCurveTo(sk[0], sk[1], tip[0], tip[1]);
      g.lineWidth = 3.4;
      g.stroke();
      g.strokeStyle = BONE;
    });
    {
      const f = F(HIP);
      const n = perp(f);
      line(g, [add(add(P[HIP], f, 10 * K), n, 16 * K), add(add(P[HIP], f, -12 * K), n, 12 * K), add(add(P[HIP], f, -12 * K), n, -12 * K), add(add(P[HIP], f, 10 * K), n, -16 * K)], true);
      g.fillStyle = BG;
      g.fill();
      g.lineWidth = 2.6;
      g.stroke();
    }
    stroke(P.slice(4, HIP + 1), 3.4);
    for (let i = 10; i < HIP; i++) {
      const f = F(i);
      const n = perp(f);
      const w = (10 + 12 * Math.sin((Math.PI * (i - 9)) / 7)) * K;
      for (const s of [-1, 1]) {
        const end = add(add(P[i], n, w * s), f, -w * 0.5);
        const ctl = add(P[i], n, w * 0.85 * s);
        g.beginPath();
        g.moveTo(P[i][0], P[i][1]);
        g.quadraticCurveTo(ctl[0], ctl[1], end[0], end[1]);
        g.lineWidth = 2.2;
        g.stroke();
      }
    }
    g.fillStyle = BONE;
    for (let i = 5; i < 10; i++) dot(g, P[i][0], P[i][1], 4);
    for (const s of [-1, 1]) {
      const f = F(SHOULDER);
      const n = perp(f);
      const sh = add(P[SHOULDER], n, 10 * K * s);
      const el = add(add(sh, n, 12 * K * s), f, -2 * K);
      const wr = add(add(el, f, 13 * K), n, -2 * K * s);
      stroke([sh, el, wr], 2.8);
      for (const a of [-0.4, 0, 0.4]) {
        const c1 = add(wr, rot(f, a + s * 0.2), 9 * K);
        stroke([wr, c1, add(c1, rot(f, a + s * 0.9), 4 * K)], 1.8);
      }
    }
    const d = nrm(sub(P[0], P[4]));
    const n = perp(d);
    const snap = t >= snapAt - 0.02 && t < snapAt + 0.12 ? 1 : 0;
    const pt = (fb, s) => add(add(P[0], d, -fb * K), n, s * K);
    line(g, [...SK.map(([fb, s]) => pt(fb, s)), ...[...SK].reverse().map(([fb, s]) => pt(fb, -s))], true);
    g.fillStyle = BG;
    g.fill();
    g.lineWidth = 3;
    g.stroke();
    const da = Math.atan2(d[1], d[0]);
    for (const s of [-1, 1]) {
      const fe = pt(36, s * 7);
      g.beginPath();
      g.ellipse(fe[0], fe[1], 11 * K, 3.4 * K, da, 0, Math.PI * 2);
      g.lineWidth = 1.8;
      g.stroke();
      const e = pt(64, s * 13);
      g.beginPath();
      g.arc(e[0], e[1], 7.5 * K, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.lineWidth = 2.6;
      g.stroke();
      g.fillStyle = '#ffcf5a';
      dot(g, e[0], e[1], 4.4 * K);
      g.beginPath();
      g.ellipse(e[0], e[1], 1.1 * K, 3.6 * K, da, 0, Math.PI * 2);
      g.fillStyle = '#1a1000';
      g.fill();
      for (let k = 0; k < 9; k++) stroke([pt(5 + k * 6.5, s * (8 + k * 0.7)), pt(6 + k * 6.5, s * (12 + k * 0.7 + snap * 4))], 1.6);
    }
  }

  function draw(ctx, t) {
    const cl = closing(t);
    const v = ctx.void;
    if (cl > 0) {
      v.fillStyle = `rgba(0,0,0,${cl})`;
      v.fillRect(-10, -10, stage.W + 20, stage.H + 20);
    }
    drawPage(ctx.page, t);
    // leaning in at the glass: it looms bigger for each tap
    const g = ctx.raptor;
    g.strokeStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const sn = snout();
    let lean = 0;
    for (const k of taps) {
      const u = t - k.at + 0.12;
      if (u > 0 && u < 0.37) lean = Math.max(lean, Math.sin((Math.PI * u) / 0.37));
    }
    const looms = (closeAt > 0 ? clamp((t - closeAt - 0.6) / 0.8) * 0.12 : 0) + lean * 0.22;
    g.save();
    g.translate(sn[0], sn[1]);
    g.scale(1 + looms, 1 + looms);
    g.translate(-sn[0], -sn[1]);
    drawRaptor(g, t);
    g.restore();

    // the cursor in its jaws, its clicks, and the taps on the glass
    const top = ctx.top;
    if (mode === 'use' || mode === 'grab') {
      const k = arrowScale(stage) * 1.8;
      const d = nrm([J[0] - J[8], J[1] - J[9]]);
      const a = Math.atan2(d[1], d[0]) - Math.atan2(-26, -10);
      const at = mode === 'grab' ? mix([p.x, p.y], sn, ease.inOut(clamp((t - modeT) / 0.3))) : sn;
      top.save();
      top.translate(at[0], at[1]);
      top.rotate(mode === 'grab' ? a * clamp((t - modeT) / 0.3) : a);
      top.scale(k, k);
      top.lineJoin = 'round';
      top.lineWidth = 2.2;
      top.fillStyle = '#000';
      top.strokeStyle = '#fff';
      top.fill(ARROW);
      top.stroke(ARROW);
      top.restore();
    }
    for (const k of clicks) {
      const u = (t - k.at) / 0.45;
      top.strokeStyle = 'rgba(255,255,255,0.8)';
      top.lineWidth = 4 * (1 - u);
      top.beginPath();
      top.arc(k.p[0], k.p[1], 12 + 60 * u, 0, Math.PI * 2);
      top.stroke();
    }
    for (const k of taps) {
      const u = (t - k.at) / 0.7;
      for (const dl of [0, 0.18]) {
        const vv = clamp((u - dl) / (1 - dl));
        top.strokeStyle = 'rgba(255,255,255,0.7)';
        top.lineWidth = 6 * (1 - vv);
        top.beginPath();
        top.arc(k.p[0], k.p[1], 20 + 180 * vv, 0, Math.PI * 2);
        top.stroke();
      }
      top.globalAlpha = 1 - u;
      top.lineWidth = 3;
      for (let j = 0; j < 6; j++) {
        const ang = j * 1.05 + k.at;
        line(top, [add(k.p, [Math.cos(ang), Math.sin(ang)], 14), add(k.p, [Math.cos(ang), Math.sin(ang)], 40)]);
        top.stroke();
      }
      top.globalAlpha = 1;
    }
    top.textAlign = 'center';
    top.textBaseline = 'middle';
    if (closeAt > 0 && mode === 'use' && task >= PLAN.length - 1) {
      top.globalAlpha = clamp((t - taskT) / 0.3) * 0.6;
      top.fillStyle = '#fff';
      top.font = `italic 300 ${Math.min(110, stage.W / 9)}px ${SERIF}`;
      top.fillText('your tabs next.', stage.W / 2, stage.H * 0.76);
      top.globalAlpha = 1;
    }
    if (saidAt > 0) {
      top.globalAlpha = 0.55 * (1 - clamp((t - saidAt - 1.2) / 0.4));
      top.fillStyle = '#fff';
      top.font = `italic 300 ${Math.min(90, stage.W / 10)}px ${SERIF}`;
      top.fillText(sayText, stage.W / 2, stage.H * 0.62);
      top.globalAlpha = 1;
    }
    stage.stats(`learned: ${learned.size ? [...learned].join(', ') : 'nothing yet'}`);
  }

  return { step, draw };
}
