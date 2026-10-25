// chameleon on a branch. its eyes swivel on their own, one each. when both eyes lock
// onto the cursor, it fires its tongue. click and it changes colour.

import { dot, line } from '../kit/stage.js';
import { angleDiff, approach, clamp, ease, hash, lerp, unit } from '../kit/math.js';

export const meta = {
  file: 'chameleon.js',
  hint: 'click: new colour · go slow near it',
  layers: [{ name: 'branch' }, { name: 'body' }, { name: 'tongue' }],
  vars: { accent: 'rgba(170,255,150,0.9)' },
  ripple: 'rgba(220,255,200,0.7)',
};

// skin palettes: base, light stripes, dark dots, belly
const SKINS = [
  { name: 'leaf green', base: [70, 190, 80], stripe: [190, 240, 120], spot: [20, 90, 50], belly: [210, 240, 150] },
  { name: 'sunset', base: [240, 120, 40], stripe: [255, 210, 80], spot: [160, 40, 60], belly: [255, 220, 150] },
  { name: 'turquoise', base: [30, 190, 190], stripe: [140, 250, 230], spot: [20, 70, 140], belly: [190, 250, 240] },
  { name: 'hot pink', base: [240, 70, 170], stripe: [255, 170, 230], spot: [110, 30, 140], belly: [255, 200, 235] },
];
const rgb = (c, k = 1) => `rgb(${c.map((v) => Math.round(v * k)).join(',')})`;
const mixc = (a, b, f) => a.map((v, i) => lerp(v, b[i], f));

const S = 1.35;

export function create(stage) {
  const p = stage.pointer;
  const branchY = (x) => (stage.H > stage.W * 1.3 ? stage.H * 0.6 : stage.H * 0.72) + (x - stage.W / 2) * -0.08 + Math.sin(x * 0.006) * 14;
  const branchAng = (x) => Math.atan2(branchY(x + 10) - branchY(x - 10), 20);

  const c = {
    x: stage.W * 0.3,
    face: 1,
    turn: 1,
    sway: 0,
    eyes: [
      { a: -0.3, wander: 0, lockT: 0 },
      { a: 0.5, wander: 2, lockT: 0 },
    ],
    skin: 0,
    skinFrom: 0,
    skinAt: -10,
  };

  // tongue: idle -> aim -> out -> back
  const tongue = { mode: 'idle', t0: 0, from: [0, 0], to: [0, 0], len: 0, caught: false };
  let cooldown = 1.5;
  let eaten = 0;
  let missed = 0;
  let chewUntil = -1;
  let spit = null;

  stage.headline('move your mouse');

  stage.on('click', () => {
    if (tongue.mode !== 'idle') return;
    c.skinFrom = c.skin;
    c.skin = (c.skin + 1) % SKINS.length;
    c.skinAt = stage.t;
    stage.bump();
    stage.headline(`now it's ${SKINS[c.skin].name}`);
  });

  // where things are on the body (local units, facing +x, feet on the branch at y = 0)
  const toWorld = (lx, ly) => {
    const a = branchAng(c.x);
    const bx = c.x;
    const by = branchY(c.x) - 6;
    const x = lx * S * c.turn;
    const y = ly * S;
    return [bx + x * Math.cos(a) - y * Math.sin(a), by + x * Math.sin(a) + y * Math.cos(a)];
  };
  const mouth = () => toWorld(222 + c.sway * 4, -88);
  const eyeAt = (k) => (k === 0 ? toWorld(150 + c.sway * 4, -122) : toWorld(160 + c.sway * 4, -138));

  function step(dt, t) {
    const cur = [p.x, p.y];

    // turn round if you go behind it
    if (tongue.mode === 'idle') {
      if (p.x > c.x + 160) c.face = 1;
      else if (p.x < c.x - 160) c.face = -1;
    }
    c.turn = approach(c.turn, c.face, 6, dt);

    // creep along the branch to keep you in range, rocking like a leaf as it goes
    const want = clamp(p.x - c.face * 420, 140, stage.W - 140);
    const moving = tongue.mode === 'idle' && Math.abs(want - c.x) > 30;
    if (moving) c.x += Math.sign(want - c.x) * 110 * dt;
    c.sway = approach(c.sway, moving ? Math.sin(t * 5) : 0, 6, dt);

    // the eyes: each one wanders on its own, until you get close
    const m = mouth();
    const dist = Math.hypot(cur[0] - m[0], cur[1] - m[1]);
    let locked = 0;
    c.eyes.forEach((e, k) => {
      const ep = eyeAt(k);
      const toCur = Math.atan2(cur[1] - ep[1], cur[0] - ep[0]);
      let target;
      const interested = dist < 900 && (k === 0 || dist < 620);
      if (interested) target = toCur;
      else {
        if (t > e.wander) {
          e.look = (stage.rand() - 0.5) * Math.PI * 1.6 + (c.face > 0 ? 0 : Math.PI);
          e.wander = t + 0.6 + stage.rand() * 1.2;
        }
        target = e.look ?? 0;
      }
      e.a += clamp(angleDiff(target, e.a), -9 * dt, 9 * dt);
      if (interested && Math.abs(angleDiff(toCur, e.a)) < 0.12) locked++;
    });

    // both eyes on you, you're slow and in range: fire
    if (tongue.mode === 'idle' && t > cooldown && locked === 2 && dist < 620 && p.speed < 380) {
      tongue.mode = 'aim';
      tongue.t0 = t;
      stage.headline("it's looking at you");
    }
    if (tongue.mode === 'aim' && t - tongue.t0 > 0.35) {
      tongue.mode = 'out';
      tongue.t0 = t;
      tongue.to = [p.x + p.vx * 0.05, p.y + p.vy * 0.05];
      tongue.caught = false;
    }
    if (tongue.mode === 'out') {
      const q = (t - tongue.t0) / 0.09;
      if (q >= 1 && !tongue.caught) {
        tongue.caught = Math.hypot(p.x - tongue.to[0], p.y - tongue.to[1]) < 46;
        tongue.mode = 'back';
        tongue.t0 = t;
        if (tongue.caught) {
          stage.shake(14);
          stage.headline('yoink');
        } else {
          missed++;
          stage.headline('missed');
        }
        stage.bump();
      }
    }
    if (tongue.mode === 'back') {
      const q = (t - tongue.t0) / (tongue.caught ? 0.32 : 0.22);
      if (q >= 1) {
        tongue.mode = 'idle';
        cooldown = t + (tongue.caught ? 3.2 : 1.4);
        if (tongue.caught) {
          eaten++;
          chewUntil = t + 1.6;
          stage.cursor.hidden = true;
          stage.cursor.override = null;
        }
      }
    }
    // after chewing for a bit, it spits the cursor back out
    if (chewUntil > 0 && t > chewUntil) {
      chewUntil = -1;
      spit = { t0: t, from: mouth() };
      stage.headline('ew');
    }
    if (spit) {
      const q = clamp((t - spit.t0) / 0.4);
      stage.cursor.hidden = false;
      stage.cursor.override = { x: lerp(spit.from[0], p.x, ease.out(q)), y: lerp(spit.from[1], p.y, ease.out(q)) - Math.sin(Math.PI * q) * 140, size: 1, angle: q * 9 };
      if (q >= 1) {
        spit = null;
        stage.cursor.override = null;
        stage.headline('move your mouse');
      }
    } else if (tongue.mode === 'back' && tongue.caught) {
      stage.cursor.override = { ...tipNow(t), size: 1 };
    }
  }

  // tongue tip position right now
  function tipNow(t) {
    const m = mouth();
    if (tongue.mode === 'out') {
      const q = ease.out(clamp((t - tongue.t0) / 0.09));
      return { x: lerp(m[0], tongue.to[0], q), y: lerp(m[1], tongue.to[1], q) };
    }
    if (tongue.mode === 'back') {
      const q = ease.in(clamp((t - tongue.t0) / (tongue.caught ? 0.32 : 0.22)));
      return { x: lerp(tongue.to[0], m[0], q), y: lerp(tongue.to[1], m[1], q) };
    }
    return { x: m[0], y: m[1] };
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function skinNow(t) {
    const f = ease.inOut(clamp((t - c.skinAt) / 0.6));
    const a = SKINS[c.skinFrom];
    const b = SKINS[c.skin];
    return { base: mixc(a.base, b.base, f), stripe: mixc(a.stripe, b.stripe, f), spot: mixc(a.spot, b.spot, f), belly: mixc(a.belly, b.belly, f) };
  }

  function drawBranch(g) {
    const W = stage.W;
    g.lineCap = 'round';
    g.strokeStyle = '#2a1d14';
    g.lineWidth = 34;
    g.beginPath();
    for (let x = -200; x <= W + 200; x += 20) (x === -200 ? g.moveTo : g.lineTo).call(g, x, branchY(x) + 22);
    g.stroke();
    g.strokeStyle = '#3d2b1d';
    g.lineWidth = 6;
    g.beginPath();
    for (let x = -200; x <= W + 200; x += 20) (x === -200 ? g.moveTo : g.lineTo).call(g, x, branchY(x) + 12);
    g.stroke();
    // twigs + leaves
    for (let i = 0; i < 6; i++) {
      const x = (i + 0.5) * (W / 6) + (hash(i, 1) - 0.5) * 80;
      const y = branchY(x) + 10;
      const up = hash(i, 2) > 0.5 ? -1 : 1;
      const tip = [x + (hash(i, 3) - 0.3) * 160, y + up * (80 + hash(i, 4) * 60)];
      g.strokeStyle = '#2a1d14';
      g.lineWidth = 9;
      line(g, [[x, y], tip]);
      g.stroke();
      g.fillStyle = 'rgba(60,140,70,0.55)';
      g.beginPath();
      g.ellipse(tip[0], tip[1], 34, 14, Math.atan2(tip[1] - y, tip[0] - x), 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawBody(g, t) {
    const sk = skinNow(t);
    const P = (lx, ly) => toWorld(lx, ly);
    const sw = c.sway * 4;
    g.lineJoin = 'round';
    g.lineCap = 'round';

    // curled tail: a spiral that gets thinner
    const tail = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      if (u < 0.35) tail.push([-120 - u * 300, -40 + u * 120]);
      else {
        const k = (u - 0.35) / 0.65;
        const r = 70 * (1 - k * 0.8);
        const a = -Math.PI / 2 - k * Math.PI * 2.2;
        tail.push([-225 + Math.cos(a) * r * -1, 40 + 70 + Math.sin(a) * r]);
      }
    }
    for (let i = 1; i < tail.length; i++) {
      g.strokeStyle = rgb(sk.base, 0.85);
      g.lineWidth = lerp(30, 5, i / tail.length) * S;
      line(g, [P(...tail[i - 1]), P(...tail[i])]);
      g.stroke();
    }

    // legs (far side first, darker)
    const legT = t * 5;
    const legs = [
      [70, 1, 0.75],
      [-80, 0, 0.75],
      [80, 0, 1],
      [-70, 1, 1],
    ];
    for (const [lx, ph, shade] of legs) {
      const swing = c.sway * 18 * (ph ? 1 : -1);
      const hip = P(lx, -55);
      const knee = P(lx + 18 + swing * 0.5, -22);
      const foot = P(lx + 4 + swing, 2);
      g.strokeStyle = rgb(sk.base, 0.8 * shade);
      g.lineWidth = 15 * S;
      line(g, [hip, knee, foot]);
      g.stroke();
      // mitten feet gripping the branch
      g.fillStyle = rgb(sk.base, 0.7 * shade);
      for (const s of [-1, 1]) {
        const f = P(lx + 4 + swing + s * 12, 8);
        dot(g, f[0], f[1], 7 * S);
      }
    }

    // body + head outline (back crest bumps along the top)
    const top = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const x = lerp(-125, 110, u);
      const y = -60 - Math.sin(Math.PI * clamp((u - 0.05) / 0.9)) * 70 - (i % 2 ? 6 : 0);
      top.push([x, y]);
    }
    const head = [
      [125, -120],
      [140, -170], // casque
      [165, -150],
      [205, -118],
      [232 + sw, -96],
      [226 + sw, -80],
      [200 + sw, -64],
      [150, -44],
      [110, -38],
    ];
    const belly = [
      [60, -30],
      [-20, -26],
      [-100, -34],
      [-125, -50],
    ];
    const outline = [...top, ...head, ...belly].map(([x, y]) => P(x, y));
    g.beginPath();
    outline.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.closePath();
    const bb = P(0, -120);
    const be = P(0, -30);
    const grad = g.createLinearGradient(bb[0], bb[1], be[0], be[1]);
    grad.addColorStop(0, rgb(sk.base, 0.85));
    grad.addColorStop(0.6, rgb(sk.base));
    grad.addColorStop(1, rgb(sk.belly));
    g.fillStyle = grad;
    g.fill();
    g.save();
    g.clip();
    // stripes and spots
    g.strokeStyle = rgb(sk.stripe);
    g.lineWidth = 12 * S;
    for (let i = 0; i < 5; i++) {
      const x = -90 + i * 42;
      line(g, [P(x, -130), P(x - 20, -30)]);
      g.stroke();
    }
    g.fillStyle = rgb(sk.spot);
    for (let i = 0; i < 26; i++) {
      const q = P(-120 + hash(i, 1) * 320, -150 + hash(i, 2) * 120);
      dot(g, q[0], q[1], (3 + hash(i, 3) * 5) * S);
    }
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 2.5;
    g.beginPath();
    outline.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
    g.closePath();
    g.stroke();
    // mouth line, open while chewing
    const chew = chewUntil > 0 ? Math.max(0, Math.sin(t * 18)) * 6 : 0;
    const open = tongue.mode !== 'idle' && tongue.mode !== 'aim' ? 7 : 0;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 3;
    line(g, [P(228 + sw, -88 + open + chew), P(170, -80 - chew), P(150, -76)]);
    g.stroke();

    // eye turrets: a cone of skin with a tiny pupil on the end, each pointing its own way
    for (const k of [1, 0]) {
      const e = c.eyes[k];
      const ep = eyeAt(k);
      const r = (k === 0 ? 26 : 20) * S;
      const dirv = [Math.cos(e.a), Math.sin(e.a)];
      g.fillStyle = rgb(sk.base, k === 0 ? 1 : 0.8);
      dot(g, ep[0], ep[1], r);
      g.strokeStyle = rgb(sk.stripe);
      g.lineWidth = 2;
      for (let ring = 1; ring <= 3; ring++) {
        g.beginPath();
        g.ellipse(ep[0] + dirv[0] * r * 0.2 * ring, ep[1] + dirv[1] * r * 0.2 * ring, r * (1 - ring * 0.22), r * (1 - ring * 0.22), 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#0a0a0a';
      dot(g, ep[0] + dirv[0] * r * 0.72, ep[1] + dirv[1] * r * 0.72, r * 0.28);
      g.fillStyle = '#fff';
      dot(g, ep[0] + dirv[0] * r * 0.72 - 2, ep[1] + dirv[1] * r * 0.72 - 2, r * 0.08);
    }
  }

  function drawTongue(g, t) {
    if (tongue.mode !== 'out' && tongue.mode !== 'back') return;
    const m = mouth();
    const tip = tipNow(t);
    g.lineCap = 'round';
    g.strokeStyle = '#e8577a';
    g.lineWidth = 11;
    line(g, [m, [tip.x, tip.y]]);
    g.stroke();
    g.strokeStyle = '#ff8fa8';
    g.lineWidth = 4;
    line(g, [m, [tip.x, tip.y]]);
    g.stroke();
    g.fillStyle = '#ff6f92';
    dot(g, tip.x, tip.y, 19);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    dot(g, tip.x - 5, tip.y - 6, 6);
  }

  function draw(ctx, t) {
    drawBranch(ctx.branch);
    drawBody(ctx.body, t);
    drawTongue(ctx.tongue, t);
    stage.stats(`eaten ${eaten} · missed ${missed} · ${tongue.mode === 'aim' ? 'aiming' : 'watching'}`);
  }

  return { step, draw };
}
