// little maths toolbox shared by every creature

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, f) => a + (b - a) * f;

export const ease = {
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  back: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
};

export const unit = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

// frame-rate independent "move towards"
export const approach = (pos, target, rate, dt) => pos + (target - pos) * (1 - Math.exp(-rate * dt));

// shortest signed angle from b to a
export const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// stable pseudo random number for an index (so things don't flicker frame to frame)
export const hash = (i, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * follow-the-leader chain stored flat as [x0,y0,x1,y1,...]
 * joint 0 is the head, you move it yourself. every other joint gets dragged
 * to `seg` px behind the one in front, and can't bend more than maxBend radians.
 */
export function followChain(J, count, seg, maxBend = Infinity, first = 1) {
  for (let i = Math.max(1, first); i < count; i++) {
    let [dx, dy] = unit(J[i * 2] - J[(i - 1) * 2], J[i * 2 + 1] - J[(i - 1) * 2 + 1]);
    if (i >= 2 && maxBend < Math.PI) {
      const [px, py] = unit(J[(i - 1) * 2] - J[(i - 2) * 2], J[(i - 1) * 2 + 1] - J[(i - 2) * 2 + 1]);
      const ang = Math.atan2(px * dy - py * dx, px * dx + py * dy);
      if (Math.abs(ang) > maxBend) {
        const a = Math.atan2(py, px) + Math.sign(ang) * maxBend;
        dx = Math.cos(a);
        dy = Math.sin(a);
      }
    }
    const s = typeof seg === 'number' ? seg : seg(i);
    J[i * 2] = J[(i - 1) * 2] + dx * s;
    J[i * 2 + 1] = J[(i - 1) * 2 + 1] + dy * s;
  }
}

export const jointAt = (J, i) => [J[i * 2], J[i * 2 + 1]];

// which way the chain faces at joint i (towards the head)
export const chainDir = (J, i, count) => {
  const a = Math.max(0, i - 1);
  const b = Math.min(count - 1, i + 1);
  return unit(J[a * 2] - J[b * 2], J[a * 2 + 1] - J[b * 2 + 1]);
};

/**
 * two bone IK. returns the knee for a limb from root to end with bone lengths l1 + l2.
 * bend = +1 / -1 picks the side it folds to
 */
export function ik2(root, end, l1, l2, bend) {
  const dx = end[0] - root[0];
  const dy = end[1] - root[1];
  const d = Math.max(1e-3, Math.min(Math.hypot(dx, dy), l1 + l2 - 1e-3));
  const base = Math.atan2(dy, dx);
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(clamp(cos, -1, 1));
  const ang = base - Math.sign(bend || 1) * a;
  return [root[0] + Math.cos(ang) * l1, root[1] + Math.sin(ang) * l1];
}

// knee that bows away from `body` (spider / centipede legs look wrong otherwise)
export function outerKnee(root, end, l1, l2, body) {
  const k1 = ik2(root, end, l1, l2, 1);
  const k2 = ik2(root, end, l1, l2, -1);
  const d = (k) => (k[0] - body[0]) ** 2 + (k[1] - body[1]) ** 2;
  return d(k1) > d(k2) ? k1 : k2;
}

export const rotate = (p, c, a) => {
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
};

// distance fallen `s` seconds after letting go, bouncing on the floor `distance` below
export function fall(s, distance, { gravity = 5200, bounce = 0.3, minBounce = 6 } = {}) {
  if (s <= 0 || distance <= 0) return 0;
  const tHit = Math.sqrt((2 * distance) / gravity);
  if (s < tHit) return 0.5 * gravity * s * s;
  let v = gravity * tHit * bounce;
  let t0 = tHit;
  for (;;) {
    const dur = (2 * v) / gravity;
    const height = (v * v) / (2 * gravity);
    if (height < minBounce) return distance;
    if (s < t0 + dur) {
      const u = s - t0;
      return distance - (v * u - 0.5 * gravity * u * u);
    }
    t0 += dur;
    v *= bounce;
  }
}
