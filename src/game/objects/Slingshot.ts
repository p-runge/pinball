import Phaser from "phaser";
import { addBodiesFromSvgPath } from "../utils/svgPhysics";

export type SlingshotSide = "left" | "right";

const SLINGSHOT_KICK = 15;

/** Maximum ball speed after a slingshot kick (px/step). Prevents runaway loops. */
const MAX_BALL_SPEED = 40;

/**
 * Radius of the inscribed corner arcs at every vertex.
 * Larger = smoother corners, but shortens the active face.
 */
const CORNER_R = 10;

const WALL_T = 4;

type Vec2 = { x: number; y: number };

type CollisionEvent = {
  pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
};

/**
 * Compute the inscribed-circle arc that rounds the corner at vertex V,
 * where the two adjacent edges run V←prev and V→next.
 *
 * Returns:
 *   tIn   — tangent point on the incoming edge (V←prev side, close to V)
 *   tOut  — tangent point on the outgoing edge (V→next side, close to V)
 *   cx/cy — arc centre
 *   startAngle / endAngle — Phaser arc angles (radians, screen-y-down)
 *   anticlockwise — Phaser arc direction flag (true = CCW in screen space)
 *   svgSweep — SVG arc sweep-flag (0 = CCW, 1 = CW in screen space)
 */
function inscribedArc(
  V: Vec2,
  prev: Vec2,
  next: Vec2,
  r: number
): {
  tIn: Vec2;
  tOut: Vec2;
  cx: number;
  cy: number;
  startAngle: number;
  endAngle: number;
  anticlockwise: boolean;
  svgSweep: 0 | 1;
} {
  // Unit vectors pointing AWAY from V along each edge
  const len1 = Math.hypot(prev.x - V.x, prev.y - V.y);
  const len2 = Math.hypot(next.x - V.x, next.y - V.y);
  const u1 = { x: (prev.x - V.x) / len1, y: (prev.y - V.y) / len1 }; // V → prev
  const u2 = { x: (next.x - V.x) / len2, y: (next.y - V.y) / len2 }; // V → next

  // Interior angle at V
  const cosA = u1.x * u2.x + u1.y * u2.y;
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));

  // Distance from V to tangent points along each edge
  const dt = r / Math.tan(alpha / 2);
  // Distance from V to circle centre along the bisector
  const dc = r / Math.sin(alpha / 2);

  // Bisector (into the polygon interior)
  const bRawX = u1.x + u2.x;
  const bRawY = u1.y + u2.y;
  const bLen = Math.hypot(bRawX, bRawY);
  const bx = bRawX / bLen;
  const by = bRawY / bLen;

  const cx = V.x + bx * dc;
  const cy = V.y + by * dc;

  const tIn = { x: V.x + u1.x * dt, y: V.y + u1.y * dt };
  const tOut = { x: V.x + u2.x * dt, y: V.y + u2.y * dt };

  const startAngle = Math.atan2(tIn.y - cy, tIn.x - cx);
  const endAngle = Math.atan2(tOut.y - cy, tOut.x - cx);

  // Choose the shorter arc (always < π for a convex corner)
  const norm = (a: number) =>
    ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const cwSweep =
    (norm(endAngle) - norm(startAngle) + 2 * Math.PI) % (2 * Math.PI);
  const ccwSweep =
    (norm(startAngle) - norm(endAngle) + 2 * Math.PI) % (2 * Math.PI);
  const anticlockwise = ccwSweep < cwSweep;
  const svgSweep: 0 | 1 = anticlockwise ? 0 : 1;

  return { tIn, tOut, cx, cy, startAngle, endAngle, anticlockwise, svgSweep };
}

/**
 * A triangular "slingshot" bumper — the kind found on real pinball tables
 * just above the flipper gutters.
 *
 * All three corners are rounded with inscribed-circle arcs of radius CORNER_R.
 * Only the straight middle portion of the hypotenuse (the ACTIVE FACE) fires
 * the kick; the corner arcs and the outer edges are plain passive walls.
 *
 * @param x           World x of vertex A — the bottom-outer corner.
 * @param y           World y of vertex A.
 * @param side        "left" → opens rightward; "right" → opens leftward.
 * @param w           Horizontal width (how far the triangle protrudes inward).
 * @param h           Outer wall height (upward extent of vertex B).
 * @param bottomAngle Tilt of the bottom edge CA from horizontal (radians, positive
 *                    = slopes downward going inward).  Pass Math.PI/6 to align
 *                    with the 30° flipper rest angle.  Defaults to 0.
 * @param onHit       Optional callback fired when the active face is struck.
 */
export class Slingshot extends Phaser.GameObjects.Container {
  private readonly activeFaceBody: MatterJS.BodyType;
  private readonly segBodies: MatterJS.BodyType[];
  private readonly onHit: (() => void) | undefined;
  private readonly activeNx: number;
  private readonly activeNy: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    side: SlingshotSide,
    w: number,
    h: number,
    bottomAngle = 0,
    onHit?: () => void
  ) {
    super(scene, x, y);
    this.onHit = onHit;

    const dir = side === "left" ? 1 : -1;
    const r = CORNER_R;

    // Triangle vertices
    // A = outer bottom corner (the anchor, at the channel wall)
    // B = outer top corner  (directly above A)
    // C = inner bottom corner (protrudes inward; drops by w·tan(bottomAngle))
    const A: Vec2 = { x, y };
    const B: Vec2 = { x, y: y - h };
    const C: Vec2 = { x: x + dir * w, y: y + w * Math.tan(bottomAngle) };

    // Active face normal: outward perpendicular of hypotenuse B→C
    // Rotate BC direction 90° toward the playfield interior.
    const BCx = C.x - B.x;
    const BCy = C.y - B.y;
    const BClen = Math.hypot(BCx, BCy);
    // For left slingshot BC goes right+down → CW 90° gives right+up ✓
    // General: rotate (BCx, BCy) by dir·90° CW in screen = (dir·BCy, -dir·BCx)/len
    this.activeNx = (dir * BCy) / BClen;
    this.activeNy = (-dir * BCx) / BClen;

    // ── Corner arcs (all three vertices) ─────────────────────────────────────
    // inscribedArc(V, prev, next) — prev and next are the adjacent vertices in
    // the polygon traversal order A→B→C→A.
    const arcB = inscribedArc(B, A, C, r); // corner B: between AB and BC
    const arcC = inscribedArc(C, B, A, r); // corner C: between BC and CA
    const arcA = inscribedArc(A, C, B, r); // corner A: between CA and AB

    // ── Visual ────────────────────────────────────────────────────────────────
    const lx = (wx: number) => wx - x;
    const ly = (wy: number) => wy - y;
    const g = scene.add.graphics();

    // Filled body: start at tIn of corner A (= end of CA edge near A), trace CW
    g.fillStyle(0x546e7a, 1);
    g.beginPath();
    g.moveTo(lx(arcA.tIn.x), ly(arcA.tIn.y)); // start: end of CA near A
    g.arc(
      lx(arcA.cx),
      ly(arcA.cy),
      r,
      arcA.startAngle,
      arcA.endAngle,
      arcA.anticlockwise
    );
    g.lineTo(lx(arcB.tIn.x), ly(arcB.tIn.y)); // straight AB to arc B start
    g.arc(
      lx(arcB.cx),
      ly(arcB.cy),
      r,
      arcB.startAngle,
      arcB.endAngle,
      arcB.anticlockwise
    );
    g.lineTo(lx(arcC.tIn.x), ly(arcC.tIn.y)); // straight active face to arc C start
    g.arc(
      lx(arcC.cx),
      ly(arcC.cy),
      r,
      arcC.startAngle,
      arcC.endAngle,
      arcC.anticlockwise
    );
    g.closePath();
    g.fillPath();

    // Passive outer edges — subtle stroke
    g.lineStyle(2, 0x78909c, 1);
    g.beginPath();
    g.moveTo(lx(arcA.tOut.x), ly(arcA.tOut.y)); // AB wall
    g.lineTo(lx(arcB.tIn.x), ly(arcB.tIn.y));
    g.strokePath();
    g.beginPath();
    g.moveTo(lx(arcC.tOut.x), ly(arcC.tOut.y)); // CA wall
    g.lineTo(lx(arcA.tIn.x), ly(arcA.tIn.y));
    g.strokePath();

    // Active face — bright accent
    g.lineStyle(4, 0xff8f00, 1);
    g.beginPath();
    g.moveTo(lx(arcB.tOut.x), ly(arcB.tOut.y));
    g.lineTo(lx(arcC.tIn.x), ly(arcC.tIn.y));
    g.strokePath();

    this.add(g);
    scene.add.existing(this);

    // ── Physics ───────────────────────────────────────────────────────────────
    const makeSeg = (p1: Vec2, p2: Vec2, label = "wall") =>
      scene.matter.add.rectangle(
        (p1.x + p2.x) / 2,
        (p1.y + p2.y) / 2,
        Math.hypot(p2.x - p1.x, p2.y - p1.y),
        WALL_T,
        {
          isStatic: true,
          angle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
          label,
          friction: 0,
          restitution: 0.4,
        }
      );

    const svgArc = (from: Vec2, to: Vec2, sweep: 0 | 1) =>
      `M${from.x},${from.y} A${r},${r} 0 0,${sweep} ${to.x},${to.y}`;

    // AB wall
    const bodyAB = makeSeg(arcA.tOut, arcB.tIn);

    // Corner B arc (passive)
    addBodiesFromSvgPath(scene, svgArc(arcB.tIn, arcB.tOut, arcB.svgSweep));

    // Active face (only trigger for the kick)
    this.activeFaceBody = makeSeg(arcB.tOut, arcC.tIn, "slingshot");

    // Corner C arc (passive)
    addBodiesFromSvgPath(scene, svgArc(arcC.tIn, arcC.tOut, arcC.svgSweep));

    // CA wall
    const bodyCA = makeSeg(arcC.tOut, arcA.tIn);

    // Corner A arc (passive)
    addBodiesFromSvgPath(scene, svgArc(arcA.tIn, arcA.tOut, arcA.svgSweep));

    this.segBodies = [bodyAB, this.activeFaceBody, bodyCA];

    const world = scene.matter.world;
    world.on("collisionstart", this.onCollisionStart, this);
    this.once("destroy", () => {
      world.off("collisionstart", this.onCollisionStart, this);
      for (const body of this.segBodies) {
        world.remove(body);
      }
    });
  }

  private onCollisionStart(event: CollisionEvent): void {
    for (const { bodyA, bodyB } of event.pairs) {
      if (bodyA === this.activeFaceBody && bodyB.label === "ball") {
        this.kick(bodyB);
      } else if (bodyB === this.activeFaceBody && bodyA.label === "ball") {
        this.kick(bodyA);
      }
    }
  }

  private kick(ballBody: MatterJS.BodyType): void {
    const vx = ballBody.velocity.x;
    const vy = ballBody.velocity.y;

    // Project current velocity onto the outward normal.
    // vn is negative when the ball is moving INTO the slingshot face.
    const vn = vx * this.activeNx + vy * this.activeNy;

    // Reflect the normal component (elastic bounce) and add the kick on top.
    // Result: outgoing normal speed = -vn + KICK  (always positive since vn ≤ 0)
    const impulse = -2 * vn + SLINGSHOT_KICK;
    let newVx = vx + this.activeNx * impulse;
    let newVy = vy + this.activeNy * impulse;

    // Cap speed to prevent runaway energy buildup in edge-case loop scenarios.
    const speed = Math.hypot(newVx, newVy);
    if (speed > MAX_BALL_SPEED) {
      const scale = MAX_BALL_SPEED / speed;
      newVx *= scale;
      newVy *= scale;
    }

    this.scene.matter.body.setVelocity(ballBody, { x: newVx, y: newVy });
    this.onHit?.();
  }
}
