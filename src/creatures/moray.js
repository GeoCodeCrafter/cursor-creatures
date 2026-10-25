// a skeleton moray eel that lives in a hole torn in the page. it lunges at your cursor
// whenever it comes too close, and a ring marks how far it can reach (it grows every time
// it tries). stay outside the ring and you're safe. until you're not: morays have a second
// set of jaws in their throat. click to poke it.

import { dot, line } from '../kit/stage.js';
import { clamp, ease } from '../kit/math.js';
import { add, ARROW, arrowScale, mix, nrm, perp, rot, smooth, sub } from '../kit/body.js';

const BONE = 'hsl(268, 70%, 86%)';
const BONE_DIM = 'hsl(268, 40%, 66%)';
const EYE = 'hsl(72, 100%, 60%)';
const FLESH = 'hsl(350, 75%, 66%)';
const BG = '#06070b';
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const COND = "'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif";

export const meta = {
  file: 'moray.js',
  hint: 'stay outside the ring · click to poke it',
  ghost: false,
  layers: [{ name: 'page' }, { name: 'eel', glow: 'rgba(160,90,255,0.45)', blur: 12 }, { name: 'rim' }, { name: 'top' }],
  vars: { accent: 'rgba(255,216,77,0.95)' },
  ripple: 'rgba(220,190,255,0.8)',
};

const K = 1.4;
const HEAD = [
  [0, 8],
  [8, 16],
  [24, 22],
  [50, 27],
  [80, 31],
  [105, 32],
  [118, 30],
];
const REACH0 = 300;

export function create(stage) {
  const p = stage.pointer;
  stage.cursor.hidden = true;
  const HOLE = () => [stage.W / 2, stage.H * 0.64];
  const HOLE_R = 100;
  const maxReach = () => Math.min(560, stage.H * 0.64 - 130, stage.W * 0.45);

  // the hole's ragged edge, and cracks in the page round it
  let seed = 4;
  const rr = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const holeShape = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a) * 0.9, 1 + (i % 2 ? 0.1 : -0.08) * (0.6 + rr()) + 0.06 * Math.sin(a * 3)];
  });
  const cracks = Array.from({ length: 9 }, (_, i) => {
    let a = (i / 9) * Math.PI * 2 + rr() * 0.5;
    let q = [Math.cos(a) * HOLE_R * 1.05, Math.sin(a) * 0.9 * HOLE_R * 1.05];
    const P = [q];
    for (let k = 0; k < 5; k++) {
      a += (rr() - 0.5) * 0.7;
      q = add(q, [Math.cos(a), Math.sin(a)], 14 + rr() * 20);
      P.push(q);
    }
    return P;
  });
  const ringBits = Array.from({ length: 56 }, () => ({ out: 300 + rr() * 500, spin: (rr() - 0.5) * 8 }));

  const head = { x: stage.W / 2 + 60, y: stage.H * 0.62 - 100, lx: 0.5, ly: -0.8 };
  // rest · lunge · reach (the second jaws) · chew (it has your cursor) · spit
  let mode = 'rest';
  let modeT = 0;
  let target = [0, 0];
  let reach = REACH0;
  let grewAt = -10;
  let coolUntil = 1;
  let caught = null; // 'bite' | 'jaws'
  let jawTo = [0, 0];
  let brokeAt = -10;
  let lunges = 0;
  const set = (m, t) => {
    mode = m;
    modeT = t;
  };
  const toward = (q, r) => {
    const h = HOLE();
    const v = sub(q, h);
    const d = Math.hypot(v[0], v[1]);
    return d > r ? add(h, v, r / d) : q;
  };

  stage.on('click', (x, y) => {
    if (mode !== 'rest') return;
    const h = HOLE();
    if (Math.hypot(x - h[0], y - h[1]) < reach * 1.4) lunge(stage.t, toward([x, y], reach));
  });
  function lunge(t, to) {
    set('lunge', t);
    target = to;
    lunges++;
  }

  function step(dt, t) {
    const c = [p.x, p.y];
    const h = HOLE();
    const dc = Math.hypot(c[0] - h[0], c[1] - h[1]);
    const mt = t - modeT;
    // which way it's looking: at the cursor, lazily (at the jaws' target on the big one)
    const want = nrm(sub(mode === 'reach' ? jawTo : c, h));
    const kk = 1 - Math.exp(-4 * dt);
    head.lx += (want[0] - head.lx) * kk;
    head.ly += (want[1] - head.ly) * kk;
    const look = nrm([head.lx, head.ly]);
    const rest = add(h, look, HOLE_R + 120);
    let goal = rest;
    let rate = 5;

    if (mode === 'rest') {
      if (p.real && t > coolUntil && dc < reach) lunge(t, toward(c, reach));
      else if (p.real && t > coolUntil + 1 && p.still > 1.5 && dc < reach + 500 && lunges >= 1) {
        set('reach', t);
        jawTo = c;
      }
    } else if (mode === 'lunge') {
      if (mt < 0.18) {
        goal = add(h, look, HOLE_R + 80);
        rate = 10;
      } else if (mt < 0.51) {
        goal = target;
        rate = 26;
      }
      if (mt >= 0.36 && mt - dt < 0.36) {
        stage.shake(8);
        if (Math.hypot(head.x - c[0], head.y - c[1]) < 70) {
          caught = 'bite';
          set('chew', t);
        } else {
          // missed. it'll remember how far that was
          const nr = Math.min(maxReach(), reach + 55);
          if (nr > reach) {
            reach = nr;
            grewAt = t;
          }
        }
      }
      if (mt > 0.51 && mode === 'lunge') {
        set('rest', t);
        coolUntil = t + 0.8;
      }
    } else if (mode === 'reach') {
      // out to the ring and it holds there, mouth wide…
      const ringPt = add(h, nrm(sub(jawTo, h)), reach);
      if (mt < 0.17) {
        goal = add(h, look, HOLE_R + 80);
        rate = 10;
      } else if (mt < 1.04) {
        goal = ringPt;
        rate = 22;
      } else goal = h;
      if (mt > 0.35 && mt < 0.49) jawTo = c; // …and the second jaws come for you
      if (mt >= 0.49 && brokeAt < modeT) {
        brokeAt = t;
        caught = 'jaws';
        stage.shake(14);
        stage.bump();
      }
      if (mt > 1.6) set('chew', t);
    } else if (mode === 'chew') {
      const s = mt;
      goal = s < 0.4 ? h : s < 0.7 ? add(h, look, 90) : rest;
      rate = s < 0.4 ? 14 : s < 0.7 ? 4 : 5;
      if (s > 3) {
        set('spit', t);
      }
    } else if (mode === 'spit') {
      if (mt > 0.4) {
        set('rest', t);
        caught = null;
        coolUntil = t + 1.5;
        if (brokeAt > 0) {
          reach = REACH0;
          brokeAt = -10;
          lunges = 0;
        }
      }
    }
    const a = 1 - Math.exp(-rate * dt);
    head.x += (goal[0] - head.x) * a;
    head.y += (goal[1] - head.y) * a;
  }

  // ── posing ────────────────────────────────────────────────────────────────
  const headPose = (t) => {
    const q = [head.x, head.y];
    const out = sub(q, HOLE());
    const d = Math.hypot(out[0], out[1]);
    const dir = nrm(mix(d > 1 ? nrm(out) : nrm([head.lx, head.ly]), nrm([head.lx, head.ly]), 0.35));
    const mt = t - modeT;
    // the mouth: breathing (it gapes to breathe), wide on a strike, shut on the snap
    let gape = 0.22 + 0.2 * Math.sin(t * 4.3);
    if (mode === 'lunge') gape = mt < 0.36 ? Math.max(gape, smooth(0.16, 0.28, mt)) : 0.05 + 0.4 * smooth(0.36, 0.56, mt);
    if (mode === 'reach') gape = mt < 1.0 ? Math.max(gape, smooth(0.15, 0.35, mt) * 1.25) : 0.05;
    if (mode === 'chew') gape = mt < 0.7 ? 0.05 : 0.3 + 0.25 * Math.abs(Math.sin(t * 7));
    if (mode === 'spit') gape = 1.1 * Math.sin(Math.PI * clamp(mt / 0.4));
    return { p: q, dir, gape, out: d };
  };
  const innerJaw = (t, hp) => {
    if (mode !== 'reach') return 0;
    const mt = t - modeT;
    const full = Math.hypot(jawTo[0] - hp[0], jawTo[1] - hp[1]) + 10;
    if (mt >= 0.35 && mt < 0.49) return full * ease.out((mt - 0.35) / 0.14);
    if (mt >= 0.49 && mt < 0.69) return full;
    if (mt >= 0.69 && mt < 0.91) return full * (1 - ease.in((mt - 0.69) / 0.22));
    return 0;
  };

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawPage(g, t) {
    const h = HOLE();
    // the ring: how far it can reach
    const bump = t > grewAt + 0.1 ? Math.max(0, 1 - (t - grewAt - 0.1) / 0.4) : 0;
    const since = brokeAt > 0 ? t - brokeAt : -1;
    const n = ringBits.length;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + Math.PI / n;
      let p0 = add(h, [Math.cos(a0), Math.sin(a0)], reach);
      let p1 = add(h, [Math.cos(a1), Math.sin(a1)], reach);
      let op = 0.55 + 0.45 * bump;
      if (since >= 0) {
        const b = ringBits[i];
        const m = mix(p0, p1, 0.5);
        const cc = add(m, [Math.cos(a0), Math.sin(a0)], b.out * since);
        p0 = add(cc, rot(sub(p0, m), b.spin * since));
        p1 = add(cc, rot(sub(p1, m), b.spin * since));
        op *= Math.max(0, 1 - since / 0.9);
      } else if (mode === 'rest' && t - modeT < 0.6 && lunges === 0) op *= clamp((t - modeT) / 0.6);
      if (op <= 0) continue;
      g.globalAlpha = op;
      g.strokeStyle = bump > 0.05 ? '#ffd84d' : 'rgba(255,255,255,0.85)';
      g.lineWidth = 4 + 3 * bump;
      line(g, [p0, p1]);
      g.stroke();
    }
    g.globalAlpha = 1;
    // the label over it
    const after = since >= 0.4;
    const ty = Math.max(after ? 170 : 150, h[1] - reach - 70);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.globalAlpha = since >= 0 && !after ? Math.max(0, 1 - since / 0.4) : 1;
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = `600 ${Math.min(30, stage.W / 34)}px ${MONO}`;
    g.fillText('IT CAN REACH', h[0], ty - 62);
    g.save();
    g.translate(h[0], ty);
    g.scale(1 + 0.15 * bump, 1 + 0.15 * bump);
    g.fillStyle = after ? '#ff5470' : bump > 0.05 ? '#ffd84d' : '#fff';
    g.font = `800 ${Math.min(72, stage.W / 14)}px ${COND}`;
    g.fillText(after ? 'everywhere.' : `${Math.round(reach)} px`, 0, 0);
    g.restore();
    g.globalAlpha = 1;
    // the hole, and the cracks round it
    const holePts = holeShape.map(([cx, cy, k]) => add(h, [cx, cy], HOLE_R * k));
    const gr = g.createRadialGradient(h[0], h[1], 0, h[0], h[1], HOLE_R * 1.1);
    gr.addColorStop(0, '#000');
    gr.addColorStop(1, '#000');
    line(g, holePts, true);
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = 'hsla(268, 50%, 75%, 0.35)';
    g.lineWidth = 2;
    for (const cr of cracks) {
      line(g, cr.map((q) => add(h, q)));
      g.stroke();
    }
    // bubbles from the hole when it breathes
    g.strokeStyle = 'hsla(268, 70%, 85%, 0.5)';
    g.lineWidth = 1.6;
    for (let k = 0; k < 6; k++) {
      const a = (t + k * 0.35) % 2;
      const x = h[0] + Math.sin(k * 7.3) * 60 + Math.sin(a * 5 + k) * 10;
      const y = h[1] - 40 - a * (110 + (k % 3) * 25);
      g.globalAlpha = 1 - a / 2;
      g.beginPath();
      g.arc(x, y, 3 + (k % 4) * 1.5 + a * 2, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawRim(g) {
    // the lip of the hole, over the eel's body where it goes in
    const h = HOLE();
    const holePts = holeShape.map(([cx, cy, k]) => add(h, [cx, cy], HOLE_R * k));
    const gr = g.createRadialGradient(h[0], h[1], 0, h[0], h[1], HOLE_R * 1.1);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.9)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    line(g, holePts, true);
    g.fillStyle = gr;
    g.fill();
    g.save();
    g.shadowColor = 'hsla(268, 90%, 60%, 0.8)';
    g.shadowBlur = 10;
    g.strokeStyle = 'hsla(268, 80%, 70%, 0.55)';
    g.lineWidth = 3;
    g.stroke();
    g.restore();
    holePts.forEach((q, i) => {
      if (i % 3) return;
      const o = nrm(sub(q, h));
      line(g, [add(q, perp(o), -9), add(q, o, 14 + (i % 2) * 8), add(q, perp(o), 9)], true);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = 'hsla(268, 60%, 75%, 0.5)';
      g.lineWidth = 1.6;
      g.stroke();
    });
  }

  function drawMoray(g, t) {
    const hd = headPose(t);
    const d = hd.dir;
    const n = perp(d);
    const lift = 1 + 0.16 * Math.min(1, hd.gape);
    const HEAD_LEN = 118 * K;
    const h = HOLE();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const stroke = (pts, col, w) => {
      line(g, pts);
      g.strokeStyle = col;
      g.lineWidth = w;
      g.stroke();
    };
    // the body: from deep in the hole out to the back of the head
    const radial = nrm(hd.out > 1 ? sub(hd.p, h) : d);
    const neck = add(hd.p, d, -HEAD_LEN * 0.92);
    const wig = Math.sin(t * 3.1) * 26;
    const P0 = add(h, radial, -80);
    const P1 = add(h, radial, 40);
    const P2 = add(add(neck, d, -90), n, wig);
    const body = [];
    for (let k = 0; k <= 30; k++) {
      const u = k / 30;
      const v = 1 - u;
      body.push([0, 1].map((j) => v * v * v * P0[j] + 3 * v * v * u * P1[j] + 3 * v * u * u * P2[j] + u * u * u * neck[j]));
    }
    const W = 30 * K;
    const fr = (k) => nrm(sub(body[Math.min(body.length - 1, k + 1)], body[Math.max(0, k - 1)]));
    for (const s of [-1, 1]) stroke(body.map((q, k) => add(q, perp(fr(k)), s * W * (0.9 + 0.1 * (k / 30)))), BONE_DIM, 2);
    body.forEach((q, k) => {
      if (k % 2) return;
      const f = fr(k);
      const m = perp(f);
      for (const s of [-1, 1]) {
        const e = add(add(q, m, s * W * 0.78), f, -8);
        const c = add(q, m, s * W * 0.5);
        g.beginPath();
        g.moveTo(q[0], q[1]);
        g.quadraticCurveTo(c[0], c[1], e[0], e[1]);
        g.strokeStyle = BONE;
        g.lineWidth = 2.2;
        g.stroke();
      }
    });
    stroke(body, BONE, 3.6);
    g.setLineDash([3, 4]);
    stroke(body.map((q, k) => add(q, perp(fr(k)), Math.sin(k * 1.3 + t * 9) * 6)), BONE_DIM, 1.4);
    g.setLineDash([]);
    // the head: long, blunt; gaping, it lifts at you and shows its teeth
    const hp = add(hd.p, d, 6 * Math.min(1, hd.gape));
    const pt = (fb, s) => add(add(hp, d, -fb * K * lift), n, s * K * lift);
    const outline = (fs) => [...fs.map(([fb, s]) => pt(fb, s)), ...[...fs].reverse().map(([fb, s]) => pt(fb, -s))];
    if (hd.gape > 0.03) {
      const gp = Math.min(1.3, hd.gape);
      const jaw = HEAD.slice(0, 5).map(([fb, s]) => [fb, s + 12 * gp]);
      line(g, outline([...jaw, [92, 30]]), true);
      g.fillStyle = '#2a0612';
      g.fill();
      g.strokeStyle = FLESH;
      g.lineWidth = 2.4;
      g.stroke();
      g.fillStyle = '#fff';
      for (let k = 0; k < 9; k++) {
        const fb = 6 + k * 8.5;
        for (const s of [-1, 1]) {
          const w = (HEAD[Math.min(4, Math.floor(fb / 20))][1] + 12 * gp) * s;
          line(g, [pt(fb - 2.5, w), pt(fb + 3, w - s * (7 + 3 * gp)), pt(fb + 2.5, w)], true);
          g.fill();
        }
      }
    }
    line(g, outline(HEAD), true);
    g.fillStyle = BG;
    g.fill();
    for (const s of [-1, 1]) stroke([...HEAD.map(([fb, w]) => pt(fb, w * s)), pt(HEAD_LEN / K + 4, 28 * s)], BONE, 3.2);
    stroke([pt(0, -8), pt(-2, 0), pt(0, 8)], BONE, 3.2);
    for (const s of [-1, 1]) {
      const e = pt(30, 17 * s);
      g.beginPath();
      g.arc(e[0], e[1], 6.5 * K, 0, Math.PI * 2);
      g.fillStyle = BG;
      g.fill();
      g.strokeStyle = BONE;
      g.lineWidth = 2.2;
      g.stroke();
      g.fillStyle = EYE;
      dot(g, e[0] + d[0] * 2, e[1] + d[1] * 2, 3.4 * K);
      const a = pt(3, 7 * s);
      stroke([a, add(a, rot(d, s * 0.25), 11 * K)], BONE, 3);
      const gl = pt(100, 26 * s);
      g.beginPath();
      g.ellipse(gl[0], gl[1], 6, 3, Math.atan2(d[1], d[0]), 0, Math.PI * 2);
      g.fillStyle = '#000';
      g.fill();
      g.strokeStyle = BONE_DIM;
      g.lineWidth = 1.4;
      g.stroke();
      stroke([pt(6, 12 * s), pt(40, 21 * s), pt(84, 26 * s)], BONE_DIM, 1.6);
    }
    stroke([pt(14, 0), pt(110, 0)], BONE_DIM, 1.4);

    // the second jaws: out of its throat on a long, fleshy stalk
    const e = innerJaw(t, hd.p);
    let jawTip = null;
    if (e > 4) {
      const dirJ = nrm(sub(jawTo, hd.p));
      const base = add(hd.p, d, -30);
      const tip = add(hd.p, dirJ, e);
      jawTip = tip;
      const m = perp(dirJ);
      const len = Math.hypot(tip[0] - base[0], tip[1] - base[1]);
      g.globalAlpha = 0.35;
      stroke([base, tip], FLESH, 30);
      g.globalAlpha = 1;
      stroke([base, tip], FLESH, 3);
      for (let k = 1; k * 22 < len - 30; k++) {
        const cc = add(base, dirJ, k * 22);
        stroke([add(cc, m, -16), add(cc, m, 16)], FLESH, 2.4);
      }
      const has = t - modeT >= 0.49;
      const open = has ? 0.15 : 1;
      for (const s of [-1, 1]) {
        const root = add(tip, m, s * 16);
        const mid = add(add(root, dirJ, 42), m, s * (30 * open + 6));
        const hook = add(add(mid, dirJ, 32), m, -s * (16 + 10 * open));
        stroke([add(tip, dirJ, -30), root, mid, hook], FLESH, 9);
        for (let k = 0; k < 5; k++) {
          const q = mix(root, mid, 0.15 + k * 0.2);
          stroke([q, add(q, m, -s * 14)], '#fff', 2.6);
        }
      }
      g.beginPath();
      g.arc(tip[0], tip[1], 16, 0, Math.PI * 2);
      g.fillStyle = '#2a0612';
      g.fill();
      g.strokeStyle = FLESH;
      g.lineWidth = 3;
      g.stroke();
    }
    return { hd, jawTip };
  }

  function drawCursor(g, t, hd, jawTip) {
    const k = arrowScale(stage) * 1.2;
    let at = [p.x, p.y];
    let a = 0;
    let o = 1;
    const mt = t - modeT;
    if (mode === 'reach' && caught === 'jaws') {
      if (!jawTip) return;
      at = add(jawTip, [-10, -14]);
      a = mt * 2;
    } else if (mode === 'chew' || (mode === 'reach' && caught)) {
      if (mode === 'chew' && mt < 0.7) {
        // dragged down the hole with it
        at = add(hd.p, hd.dir, -8);
        o = 1 - clamp((mt - 0.2) / 0.2) * (mt < 0.5 ? 1 : 0);
        if (mt > 0.4) return;
      } else {
        // the tail end of it, twitching in its jaws
        at = add(hd.p, hd.dir, -8);
        a = Math.atan2(-hd.dir[0], hd.dir[1]) + Math.sin(t * 30) * 0.14;
      }
    } else if (mode === 'spit') {
      at = mix(add(hd.p, hd.dir, 10), [p.x, p.y], ease.out(clamp(mt / 0.4)));
      a = (1 - mt / 0.4) * 6;
    }
    g.save();
    g.globalAlpha = o;
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
    const { hd, jawTip } = drawMoray(ctx.eel, t);
    drawRim(ctx.rim);
    // inside the hole the cursor goes under the rim; out here it's on top
    const inside = mode === 'chew' && t - modeT < 0.7;
    drawCursor(inside ? ctx.eel : ctx.top, t, hd, jawTip);
    stage.stats(mode === 'chew' ? 'chewing' : mode === 'reach' ? 'second jaws' : `lunges ${lunges}`);
  }

  return { step, draw };
}
