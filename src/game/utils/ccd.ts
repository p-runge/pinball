/**
 * Continuous Collision Detection (CCD) for a moving circle vs a convex polygon.
 *
 * Instead of capping ball speed or using many sub-steps to prevent tunnelling,
 * we predict the ball's full displacement each physics step, detect the earliest
 * wall contact using a swept-circle SAT test, and – when a hit is found –
 * teleport the ball to the contact surface and apply a proper elastic reflection.
 *
 * This eliminates:
 *   - Tunnelling (ball passing through walls at high speed)
 *   - Wall-sticking (ball oscillating near a wall because the velocity cap was
 *     fighting Matter.js's own collision resolution)
 */

export interface CcdHit {
  /** Fraction of the displacement at which the circle first contacts the surface. */
  readonly t: number;
  /** Contact normal — points FROM the surface TOWARD the approaching ball. */
  readonly nx: number;
  readonly ny: number;
}

function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { x: number; y: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) return { x: ax, y: ay };

  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq)
  );
  return { x: ax + abx * t, y: ay + aby * t };
}

/**
 * Swept-circle vs convex-polygon test using the Separating Axis Theorem on
 * edge normals.
 *
 * Moves a circle of `radius` from (cx, cy) by (dx, dy) and returns the
 * earliest contact fraction t ∈ (EPSILON, 1] together with the outward contact
 * normal.  Returns null if:
 *   - no contact occurs within this step
 *   - the circle is already touching or overlapping the polygon (t ≤ EPSILON),
 *     so that Matter.js can continue resolving those contacts undisturbed.
 */
export function sweptCircleVsConvex(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  radius: number,
  verts: ReadonlyArray<{ x: number; y: number }>
): CcdHit | null {
  const n = verts.length;
  if (n < 3) return null;

  let tFirst = 0;
  let tLast = 1;
  let contactNx = 0;
  let contactNy = 0;

  for (let i = 0; i < n; i++) {
    const v0 = verts[i];
    const v1 = verts[(i + 1) % n];
    const ex = v1.x - v0.x;
    const ey = v1.y - v0.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;

    // One perpendicular of the edge — sign doesn't matter; we derive the
    // contact normal direction from the ball's approach side below.
    const nx = ey / len;
    const ny = -ex / len;

    // Project all polygon vertices onto this axis → slab [polyMin, polyMax].
    let polyMin = Infinity;
    let polyMax = -Infinity;
    for (let j = 0; j < n; j++) {
      const p = verts[j].x * nx + verts[j].y * ny;
      if (p < polyMin) polyMin = p;
      if (p > polyMax) polyMax = p;
    }

    // The circle center must stay in [polyMin − radius, polyMax + radius]
    // to be "in contact" along this axis.
    const lo = polyMin - radius;
    const hi = polyMax + radius;

    const cProj = cx * nx + cy * ny; // circle center projection at t = 0
    const cVel = dx * nx + dy * ny; // rate of change along this axis

    let tEnter: number;
    let tLeave: number;

    if (Math.abs(cVel) < 1e-9) {
      if (cProj < lo || cProj > hi) return null; // parallel and already separated
      tEnter = 0;
      tLeave = 1;
    } else {
      const t1 = (lo - cProj) / cVel;
      const t2 = (hi - cProj) / cVel;
      tEnter = Math.min(t1, t2);
      tLeave = Math.max(t1, t2);
    }

    if (tEnter > tFirst) {
      tFirst = tEnter;
      // Contact normal: points from the polygon surface toward the ball.
      // If cVel > 0 the ball enters from the lo (−n) side → flip n.
      // If cVel < 0 the ball enters from the hi (+n) side → keep n.
      if (cVel > 0) {
        contactNx = -nx;
        contactNy = -ny;
      } else {
        contactNx = nx;
        contactNy = ny;
      }
    }

    tLast = Math.min(tLast, tLeave);
    if (tFirst > tLast) return null; // a separating axis was found
  }

  // Ignore contacts where the ball is already touching / overlapping —
  // let Matter.js resolve those with its own position/velocity solver.
  const EPSILON = 0.002;
  if (tFirst < EPSILON || tFirst > 1) return null;

  const hitCx = cx + dx * tFirst;
  const hitCy = cy + dy * tFirst;

  let refinedNx = contactNx;
  let refinedNy = contactNy;
  let bestDistSq = Infinity;

  for (let i = 0; i < n; i++) {
    const v0 = verts[i];
    const v1 = verts[(i + 1) % n];
    const closest = closestPointOnSegment(hitCx, hitCy, v0.x, v0.y, v1.x, v1.y);
    const offX = hitCx - closest.x;
    const offY = hitCy - closest.y;
    const distSq = offX * offX + offY * offY;

    if (distSq > 1e-12 && distSq < bestDistSq) {
      const dist = Math.sqrt(distSq);
      refinedNx = offX / dist;
      refinedNy = offY / dist;
      bestDistSq = distSq;
    }
  }

  return { t: tFirst, nx: refinedNx, ny: refinedNy };
}

/**
 * CCD test for a convex polygon rotating about a fixed pivot vs a static circle.
 *
 * Sweeps the polygon from `fromAngle` to `toAngle` and binary-searches for the
 * earliest fractional step time t ∈ (0, 1] at which a polygon edge first comes
 * within `cr` of the circle center `(cx, cy)`.
 *
 * Returns null when:
 *   - no contact occurs during the sweep
 *   - the circle is already overlapping at `fromAngle` (let Matter resolve it)
 *
 * The returned normal points FROM the polygon surface TOWARD the circle center.
 */
export function sweptConvexVsCircle(
  cx: number,
  cy: number,
  cr: number,
  pivotX: number,
  pivotY: number,
  fromAngle: number,
  toAngle: number,
  localVerts: ReadonlyArray<{ x: number; y: number }>
): { t: number; nx: number; ny: number } | null {
  if (Math.abs(toAngle - fromAngle) < 1e-7) return null;

  const n = localVerts.length;
  if (n < 3) return null;

  /** Closest squared distance from (cx,cy) to the polygon at the given angle,
   *  plus the closest edge point for normal computation. */
  function closestEdgeDist(angle: number): {
    distSq: number;
    epx: number;
    epy: number;
  } {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    let best = Infinity;
    let bx = 0;
    let by = 0;
    for (let i = 0; i < n; i++) {
      const lv0 = localVerts[i];
      const lv1 = localVerts[(i + 1) % n];
      const w0x = pivotX + lv0.x * cosA - lv0.y * sinA;
      const w0y = pivotY + lv0.x * sinA + lv0.y * cosA;
      const w1x = pivotX + lv1.x * cosA - lv1.y * sinA;
      const w1y = pivotY + lv1.x * sinA + lv1.y * cosA;
      const cp = closestPointOnSegment(cx, cy, w0x, w0y, w1x, w1y);
      const dx = cx - cp.x;
      const dy = cy - cp.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < best) {
        best = dSq;
        bx = cp.x;
        by = cp.y;
      }
    }
    return { distSq: best, epx: bx, epy: by };
  }

  const crSq = cr * cr;

  // No contact if still clear at end of sweep.
  if (closestEdgeDist(toAngle).distSq >= crSq) return null;
  // Already overlapping at start — let Matter handle it.
  if (closestEdgeDist(fromAngle).distSq < crSq) return null;

  // Binary search for the first angle where overlap begins.
  let lo = 0.0;
  let hi = 1.0;
  for (let iter = 0; iter < 16; iter++) {
    const mid = (lo + hi) * 0.5;
    const angle = fromAngle + (toAngle - fromAngle) * mid;
    if (closestEdgeDist(angle).distSq < crSq) hi = mid;
    else lo = mid;
  }

  const tContact = hi;
  const contactAngle = fromAngle + (toAngle - fromAngle) * tContact;
  const { epx, epy, distSq } = closestEdgeDist(contactAngle);
  const dist = Math.sqrt(distSq);
  const len = dist > 1e-6 ? dist : 1e-6;

  return {
    t: tContact,
    nx: (cx - epx) / len,
    ny: (cy - epy) / len,
  };
}
