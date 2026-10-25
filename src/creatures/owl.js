// a skeleton owl on a branch. its head always points at your cursor, so take your cursor
// round it: 180°, 270° (an owl's limit), 360°, and keep going. the neck winds up like a
// rubber band. stop, or wind it too far, and it lets go: the head spins back like a
// propeller and the owl takes off. click it for a hoot.

import { dot, line } from '../kit/stage.js';
import { clamp, ease } from '../kit/math.js';
import { add, mix, nrm, rot, sub } from '../kit/body.js';

const BONE = '#fff5dc';
const BG = '#06070b';
const D2R = Math.PI / 180;
const S = 1;

export const meta = {
  file: 'owl.js',
  hint: 'circle it · click for a hoot',
  layers: [{ name: 'owl', glow: 'rgba(255,185,60,0.6)' }, { name: 'text' }],
  vars: { accent: 'rgba(255,205,110,0.95)' },
  ripple: 'rgba(255,230,180,0.8)',
};

const P = (d) => new Path2D(d);
const TUFTS = P('M-58 -78 L-92 -132 L-74 -84 M58 -78 L92 -132 L74 -84');
const FACE = P('M0 -98 C60 -104 108 -62 106 -14 C104 30 72 66 30 80 L0 92 L-30 80 C-72 66 -104 30 -106 -14 C-108 -62 -60 -104 0 -98 Z');
const BROW = P('M-86 -40 C-50 -70 50 -70 86 -40');
const BEAK = P('M-12 26 L12 26 L6 54 L0 66 L-4 56 Z');
const FURCULA = P('M-58 -96 Q-10 -60 0 -36 Q10 -60 58 -96');
const KEEL = P('M0 -36 L-26 40 L0 118 L26 40 Z');
const PELVIS = P('M-46 118 Q0 96 46 118 L34 140 Q0 128 -34 140 Z');
const VANE = P('M0 -34 C14 -20 14 14 0 34 C-14 14 -14 -20 0 -34 Z');
const QUILL = P('M0 -40 L0 38 M0 -22 L10 -30 M0 -22 L-10 -30 M0 -10 L10 -18 M0 -10 L-10 -18 M0 2 L10 -6 M0 2 L-10 -6 M0 14 L10 6 M0 14 L-10 6');

export function create(stage) {
  const p = stage.pointer;
  stage.ghost.style.top = '8%';
  const perch = () => [stage.W / 2, stage.H * 0.46 + 190 * S];
  const branchY = () => perch()[1] + 186 * S;

  // perch · unwind (spinning back, then lifting off) · gone · peek · back (flying in)
  let mode = 'back';
  let modeT = -1;
  let chest = [-400, stage.H * 0.9];
  let from = chest.slice();
  let spread = 1;
  let raw = 0;
  let prev = null;
  let theta = 0;
  let vel = 0;
  let max = 0;
  let resync = false;
  let landedAt = -10;
  let leftAt = -10;
  let blinkAt = -10;
  let hootAt = -10;
  const trail = [];
  const feathers = [];
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
  const pivotOf = (c) => [c[0], c[1] - 190 * S];
  const angleTo = (q) => Math.atan2(p.x - q[0], -(p.y - q[1])) / D2R;
  const pop = (t, n, burst = false) => {
    for (let k = 0; k < n; k++)
      feathers.push({ at: t + (burst ? k * 0.05 : 0), from: add(chest, [(Math.random() - 0.5) * 260, (Math.random() - 0.5) * 240]), vx: (Math.random() - 0.5) * 700, a: Math.random() * 360 });
  };
  const letGo = (t) => {
    set('unwind', t);
    vel = 0;
    pop(t, 12, true);
    stage.shake(14);
    say('unwinding…');
  };

  stage.on('click', (x, y) => {
    const t = stage.t;
    if (mode !== 'perch') return;
    if (Math.abs(theta) > 300) return letGo(t);
    blinkAt = t;
    hootAt = t;
    say('hoo.');
  });

  function step(dt, t) {
    const mt = t - modeT;
    const home = perch();
    if (mode === 'back') {
      // swoops in from the side, wings out, and lands
      const u = clamp(mt / 1.4);
      chest = mix(from, home, ease.inOut(u));
      chest[1] -= Math.sin(Math.PI * u) * 120;
      spread = u < 0.8 ? 1 : 1 - ease.inOut((u - 0.8) / 0.2);
      if (u >= 1) {
        set('perch', t);
        landedAt = t;
        spread = 0;
      }
    } else if (mode === 'perch') {
      chest = home;
    } else if (mode === 'unwind') {
      if (mt > 0.5) {
        const u = clamp((mt - 0.5) / 1.6);
        chest = [home[0] + 70 * u, home[1] - (home[1] + 900) * ease.in(u)];
        spread = ease.out(clamp((mt - 0.35) / 0.35));
      }
      if (mt > 2.1) {
        set('gone', t);
        leftAt = t;
        say('');
      }
    } else if (mode === 'gone') {
      if (mt > 0.9) {
        set('peek', t);
        say('hoo?');
      }
    } else if (mode === 'peek') {
      if (mt > 2) {
        set('back', t);
        resync = true;
        from = [stage.W + 400, stage.H * 0.2];
        say('it came back.');
      }
    }

    // the head chases the cursor's angle round the top of the neck, unwrapped:
    // every lap is another full turn of the neck
    const pivot = pivotOf(chest);
    const a = angleTo(pivot);
    if (prev === null) {
      prev = a;
      raw = a;
      theta = a;
    }
    let d = a - prev;
    d = ((d + 540) % 360) - 180;
    prev = a;
    raw += d;
    if (mode === 'perch' || mode === 'back') {
      if (resync) {
        raw = theta + ((((a - theta) % 360) + 540) % 360) - 180;
        resync = false;
      }
      theta += (raw - theta) * (1 - Math.exp(-14 * dt));
      vel = 0;
      const turns = Math.abs(theta);
      // feathers pop off as it winds up
      const band = Math.floor(turns / 90);
      if (turns > 540 && band > max) pop(t, 1);
      max = Math.max(max, band);
      if (turns < 540) max = Math.min(max, band);
      if (mode === 'perch') {
        if (turns > 1440) letGo(t);
        else if (turns > 400 && p.still > 1.1) letGo(t);
      }
    } else if (mode === 'unwind') {
      // a torsion spring letting go: fast, past zero, and back
      vel += (-3.3 * theta - 1.3 * vel) * dt;
      theta += vel * dt;
    } else {
      theta += (-90 - theta) * (1 - Math.exp(-10 * dt));
      raw = theta;
      prev = a;
    }
    trail.unshift(theta);
    trail.length = Math.min(trail.length, 6);
    while (feathers.length && t - feathers[0].at > 1.8 && feathers[0].at > 0) feathers.shift();

    if (mode === 'perch' && saidAt < 0) {
      const turns = Math.abs(theta);
      const h = turns > 900 ? 'oh no.' : turns > 540 ? "won't stop." : turns > 270 ? 'max: 270°' : t - landedAt > 1 && p.real ? 'it follows.' : 'move your mouse';
      stage.headline(h);
    }
    if (saidAt > 0 && t - saidAt > 2) saidAt = -10;
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  function drawHead(g, at, deg, blink, alpha = 1) {
    const l = rot(nrm(sub([p.x, p.y], at)), -deg * D2R);
    g.save();
    g.globalAlpha = alpha;
    g.translate(at[0], at[1]);
    g.rotate(deg * D2R);
    g.scale(S, S);
    g.lineWidth = 2.4;
    g.stroke(TUFTS);
    g.fillStyle = BG;
    g.fill(FACE);
    g.lineWidth = 3.4;
    g.stroke(FACE);
    g.globalAlpha = alpha * 0.6;
    g.lineWidth = 1.6;
    g.stroke(BROW);
    g.globalAlpha = alpha;
    for (const cx of [-46, 46]) {
      for (let k = 0; k < 14; k++) {
        const a0 = (k / 14) * Math.PI * 2;
        const a1 = a0 + (Math.PI * 2) / 14 - 0.06;
        line(g, [
          [cx + Math.cos(a0) * 33, -8 + Math.sin(a0) * 33],
          [cx + Math.cos(a0) * 45, -8 + Math.sin(a0) * 45],
          [cx + Math.cos(a1) * 45, -8 + Math.sin(a1) * 45],
          [cx + Math.cos(a1) * 33, -8 + Math.sin(a1) * 33],
        ], true);
        g.fillStyle = BG;
        g.fill();
        g.lineWidth = 1.6;
        g.stroke();
      }
      if (blink) {
        g.strokeStyle = '#ffc23a';
        g.lineWidth = 4;
        line(g, [[cx - 26, -8], [cx + 26, -8]]);
        g.stroke();
        g.strokeStyle = BONE;
      } else {
        g.beginPath();
        g.arc(cx, -8, 30, 0, Math.PI * 2);
        g.fillStyle = '#ffb21e';
        g.fill();
        g.strokeStyle = '#ffe08a';
        g.lineWidth = 2;
        g.stroke();
        g.strokeStyle = BONE;
        g.fillStyle = '#140c00';
        dot(g, cx + l[0] * 10, -8 + l[1] * 10, 15);
        g.fillStyle = '#fff';
        dot(g, cx + l[0] * 10 - 5, -8 + l[1] * 10 - 6, 4);
      }
    }
    g.fillStyle = BG;
    g.fill(BEAK);
    g.lineWidth = 2.6;
    g.stroke(BEAK);
    g.restore();
  }

  function drawBody(g, c, t, wobble) {
    const flap = Math.sin(t * 13) * 60 * spread;
    g.save();
    g.translate(c[0], c[1]);
    g.rotate(wobble * D2R);
    g.scale(S, S);
    g.fillStyle = BONE;
    for (const s of [-1, 1]) {
      const sh = [s * 58, -88];
      const el = mix([s * 88, 20], [s * 200, -120 + flap * 0.5], spread);
      const wr = mix([s * 80, 76], [s * 330, -110 + flap], spread);
      const tip = mix([s * 62, 196], [s * 470, -90 + flap * 1.6], spread);
      line(g, [sh, el, wr, tip]);
      g.lineWidth = 4;
      g.stroke();
      dot(g, el[0], el[1], 5);
      dot(g, wr[0], wr[1], 5);
      g.globalAlpha = 0.85;
      g.lineWidth = 1.4;
      for (let k = 0; k < 9; k++) {
        const u = k / 8;
        const root = u < 0.5 ? mix(el, wr, u * 2) : mix(wr, tip, (u - 0.5) * 2);
        const len = (60 + 60 * u) * (0.7 + 0.3 * spread);
        const dir = nrm(mix([s * 0.15, 1], [s * (0.2 + u * 0.6), 1 - u * 0.2], spread));
        line(g, [root, add(root, dir, len)]);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.lineWidth = 3;
    g.stroke(FURCULA);
    g.fillStyle = BG;
    g.fill(KEEL);
    g.stroke(KEEL);
    g.lineWidth = 1.8;
    line(g, [[0, -36], [0, 118]]);
    g.stroke();
    g.lineWidth = 2.2;
    for (let k = 0; k < 5; k++) {
      const y = -50 + k * 30;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 18, y);
        g.quadraticCurveTo(s * 70, y + 4, s * 66, y + 42);
        g.stroke();
      }
    }
    g.fill(PELVIS);
    g.lineWidth = 2.4;
    g.stroke(PELVIS);
    for (const s of [-1, 1]) {
      const hip = [s * 26, 136];
      const ankle = [s * 32, 168 + 14 * spread];
      line(g, [hip, ankle]);
      g.lineWidth = 3.4;
      g.stroke();
      g.lineWidth = 2.2;
      for (const k of [-1, 0, 1]) {
        const curl = 1 - spread;
        const toe = add(ankle, [k * 13 + s * 4, 14 + 6 * curl]);
        const claw = add(toe, [k * 4, 10 * curl + 4]);
        g.beginPath();
        g.moveTo(ankle[0], ankle[1]);
        g.lineTo(toe[0], toe[1]);
        g.quadraticCurveTo(toe[0] + k * 6, toe[1] + 8, claw[0], claw[1]);
        g.stroke();
      }
    }
    g.restore();
  }

  function drawNeck(g, base, top, deg) {
    const turns = Math.abs(deg) / 360;
    const w = 30 * S * (1 + 0.12 * Math.min(4, turns));
    g.lineWidth = 2.4;
    for (let i = 0; i < 7; i++) {
      const q = mix(base, top, i / 6);
      g.save();
      g.translate(q[0], q[1]);
      g.rotate(deg * (i / 6) * D2R);
      g.beginPath();
      g.roundRect(-w / 2, -8, w, 16, 6);
      g.fillStyle = BG;
      g.fill();
      g.stroke();
      g.restore();
    }
    // the winding: two stripes per full turn, slanted the way it's twisted
    const stripes = Math.floor(turns * 2);
    g.strokeStyle = '#ffb21e';
    g.lineWidth = 3.4;
    for (let k = 0; k < stripes; k++) {
      const q = mix(base, top, (k + 0.5) / Math.max(1, stripes));
      const sl = Math.sign(deg) * 14;
      line(g, [[q[0] - w * 0.62, q[1] + sl], [q[0] + w * 0.62, q[1] - sl]]);
      g.stroke();
    }
    g.strokeStyle = BONE;
  }

  function drawBranch(g, t) {
    const y = branchY();
    const k1 = t - landedAt;
    const k2 = mode === 'unwind' ? t - modeT - 0.6 : -1;
    const sway = (k1 > 0 ? Math.sin(k1 * 18) * 8 * Math.exp(-k1 * 3) : 0) + (k2 > 0 ? Math.sin(k2 * 16) * 7 * Math.exp(-k2 * 2.5) : 0);
    const x0 = stage.W / 2 - 520;
    const x1 = stage.W / 2 + 520;
    g.strokeStyle = 'rgba(255,235,200,0.75)';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(Math.min(x0, 30), y + 14);
    g.quadraticCurveTo(stage.W / 2, y - 6 + sway, Math.max(x1, stage.W - 30), y + 4);
    g.stroke();
    g.lineWidth = 4;
    const cx = stage.W / 2;
    for (const [a, b] of [
      [[cx - 320, y + 8], [cx - 380, y - 50]],
      [[cx - 368, y - 34], [cx - 400, y - 60]],
      [[cx + 280, y + 2], [cx + 350, y - 46]],
      [[cx + 410, y + 4], [cx + 460, y + 40]],
    ]) {
      line(g, [a, b]);
      g.stroke();
    }
    g.strokeStyle = BONE;
  }

  function draw(ctx, t) {
    const g = ctx.owl;
    g.strokeStyle = BONE;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    drawBranch(g, t);
    const shown = mode !== 'gone' && mode !== 'peek';
    const pivot = pivotOf(chest);
    const blink = t - blinkAt < 0.15 || t % 4.7 < 0.12;
    if (shown) {
      const spinning = mode === 'unwind';
      const wobble = spinning ? Math.sin(t * 22) * 10 * (1 - clamp((t - modeT) / 2)) : 0;
      // a little hop on the hoot
      const hop = t - hootAt < 0.3 ? Math.sin((Math.PI * (t - hootAt)) / 0.3) * 14 : 0;
      drawBody(g, add(chest, [0, -hop * 0.3]), t, wobble);
      drawNeck(g, add(chest, [0, -100 * S - hop * 0.3]), add(pivot, [0, -hop]), theta);
      if (spinning)
        [1, 3, 5].forEach((k, j) => {
          if (trail[k] !== undefined) drawHead(g, add(pivot, rot([0, -86 * S], trail[k] * D2R)), trail[k], false, 0.22 - j * 0.06);
        });
      drawHead(g, add(add(pivot, [0, -hop]), rot([0, -86 * S], theta * D2R)), theta, blink);
    }
    if (mode === 'peek') {
      // its head pops back in from the edge, sideways
      const u = ease.out(clamp((t - modeT) / 0.55)) * (1 - ease.inOut(clamp((t - modeT - 1.6) / 0.4)));
      const at = [stage.W + 250 - 420 * u, perch()[1] - 190 * S];
      g.globalAlpha = 0.4;
      g.lineWidth = 20;
      line(g, [[at[0] + 90 * S, at[1]], [stage.W + 400, at[1]]]);
      g.stroke();
      g.globalAlpha = 1;
      drawHead(g, at, -90, blink);
    }
    // feathers: a few pop as it winds, a burst as it lets go, one drifts down after
    for (const f of feathers) {
      const u = t - f.at;
      if (u < 0 || u > 1.8) continue;
      const q = add(f.from, [f.vx * u * Math.exp(-u), -260 * u + 160 * u * u]);
      feather(g, q, f.a + u * 200, 1.2, 1 - u / 1.8);
    }
    if (mode === 'gone' || mode === 'peek' || (mode === 'back' && t - modeT < 1)) {
      const u = t - leftAt;
      feather(g, [stage.W * 0.55 + Math.sin(u * 2.4) * 70, stage.H * 0.2 + u * 220], Math.sin(u * 2.4) * 35, 1.5, 1 - clamp((u - 3) / 1));
    }

    // the neck counter: the whole story in one number
    const tg = ctx.text;
    const turns = Math.abs(Math.round(theta));
    tg.textAlign = 'center';
    tg.font = `700 72px 'JetBrains Mono', ui-monospace, Menlo, monospace`;
    tg.fillStyle = turns > 270 ? '#ffb21e' : 'rgba(255,225,160,0.95)';
    tg.shadowColor = 'rgba(255,170,40,0.6)';
    tg.shadowBlur = 18;
    tg.fillText(`neck ${Math.round(theta)}°`, stage.W / 2, branchY() + 110);
    tg.shadowBlur = 0;
    const status = mode === 'peek' ? 'hoo?' : mode === 'gone' ? 'gone' : mode === 'back' ? 'flying' : mode === 'unwind' ? (t - modeT > 0.6 ? 'airborne' : 'unwinding') : turns > 500 ? 'way too far' : turns > 270 ? 'too far' : 'tracking';
    stage.stats(status);
  }
  function feather(g, at, a, s, o) {
    g.save();
    g.globalAlpha = Math.max(0, o);
    g.translate(at[0], at[1]);
    g.rotate(a * D2R);
    g.scale(s, s);
    g.fillStyle = 'rgba(255,230,180,0.12)';
    g.fill(VANE);
    g.lineWidth = 1.4;
    g.stroke(VANE);
    g.lineWidth = 1.2;
    g.stroke(QUILL);
    g.restore();
  }

  return { step, draw };
}
