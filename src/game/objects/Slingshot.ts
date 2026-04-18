import Phaser from "phaser";
import { addBodiesFromSvgPath } from "../utils/svgPhysics";

export type SlingshotSide = "left" | "right";

/**
 * How hard the slingshot kicks the ball when the active face is hit.
 * px per Matter normalised-velocity step (same unit as BUMPER_KICK).
 */
const SLINGSHOT_KICK = 15;

/**
 * Radius of the inscribed corner arcs at the top (B) and inner-bottom (C)
 * vertices.  Larger = smoother corners but shorter active face.
 */
const CORNER_R = 10;

/** Physics wall thickness — must match the constant in svgPhysics.ts. */
const WALL_T = 4;

type CollisionEvent = {
  pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
};

/**
 * A triangular "slingshot" bumper — the kind found on real pinball tables
 * just above the flipper gutters.
 *
 * The hypotenuse is split into three parts:
 *   • a small passive arc at vertex B (top-outer corner)
 *   • the straight middle section  ← ACTIVE FACE (triggers kick)
 *   • a small passive arc at vertex C (bottom-inner corner)
 *
 * Only the straight active face fires the kick; grazes against either arc
 * corner are treated as ordinary wall bounces.
 *
 * Corner geometry: each arc is the inscribed circle of radius CORNER_R that
 * is simultaneously tangent to both edges meeting at that vertex.  The
 * tangent points are computed analytically so the physics and visual align
 * exactly.
 *
 * @param x    World x of vertex A — the bottom-outer corner (at the wall).
 * @param y    World y of vertex A.
 * @param side "left" → triangle opens rightward; "right" → opens leftward.
 * @param w    Horizontal width (how far the triangle protrudes inward).
 * @param h    Vertical height (how far it extends upward).
 * @param onHit  Optional callback fired when the active face is struck.
 */
export class Slingshot extends Phaser.GameObjects.Container {
  /** The straight central portion of the hypotenuse — the only body that fires the kick. */
  private readonly activeFaceBody: MatterJS.BodyType;
  /** All directly-created segment bodies (for cleanup). */
  private readonly segBodies: MatterJS.BodyType[];
  private readonly onHit: (() => void) | undefined;

  /** Outward normal of the active face, pointing into the playfield. */
  private readonly activeNx: number;
  private readonly activeNy: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    side: SlingshotSide,
    w: number,
    h: number,
    onHit?: () => void
  ) {
    super(scene, x, y);
    this.onHit = onHit;

    const dir = side === "left" ? 1 : -1; // +1 protrudes right, -1 protrudes left
    const len = Math.hypot(w, h);
    const r = CORNER_R;

    // Outward normal of the hypotenuse B→C (points into the playfield).
    // Left  (dir=+1): (h, -w)/len  →  right + up  ✓
    // Right (dir=-1): (-h, -w)/len →  left  + up  ✓
    this.activeNx = (dir * h) / len;
    this.activeNy = -w / len;

    // ── Corner-arc geometry ───────────────────────────────────────────────────
    //
    // For each corner we inscribe a circle of radius r tangent to both
    // meeting edges.  The tangent points define the arc endpoints and also
    // the start/end of every straight wall segment.
    //
    // Corner B (top-outer, where AB meets BC):
    //   Centre: (x + dir·r,  y - h + r·(len+h)/w)
    //   Tangent on AB:  directly left/right of centre → (x, centreBy)
    //   Tangent on BC:  centre + r·(dir·h/len, -w/len)
    const cBx = x + dir * r;
    const cBy = y - h + (r * (len + h)) / w;
    // Tangent points on the two edges that meet at B
    const tAB_B = { x, y: cBy }; // on the outer vertical wall
    const tBC_B = { x: cBx + (r * dir * h) / len, y: cBy - (r * w) / len }; // on the hypotenuse

    // Corner C (bottom-inner, where BC meets CA):
    //   Centre: (x + dir·(w - r·(w+len)/h),  y - r)
    //   Tangent on BC:  centre + r·(dir·h/len, -w/len)
    //   Tangent on CA:  directly above centre → (centreC_x, y)
    const cCx = x + dir * (w - (r * (w + len)) / h);
    const cCy = y - r;
    const tBC_C = { x: cCx + (r * dir * h) / len, y: cCy - (r * w) / len }; // on the hypotenuse
    const tCA_C = { x: cCx, y }; // on the bottom edge

    // Arc sweep direction — left slingshot: CW (increasing angle in screen coords)
    //                        right slingshot: CCW
    // SVG sweep flag:  1 = CW,  0 = CCW
    const svgSweep = side === "left" ? 1 : 0;
    // Phaser anticlockwise param: true = CCW, false = CW
    const arcCCW = side === "right";

    // Phaser arc angles (screen coords: 0°=right, 90°=down, 180°=left, 270°=up)
    //   B-arc start:  π for left (pointing left → tAB_B),  0 for right
    //   B-arc end  :  atan2(-w, dir·h)  (outward-normal direction of BC)
    //   C-arc start:  same atan2(-w, dir·h)
    //   C-arc end  :  π/2 (pointing down → tCA_C)
    const arcAngleBC = Math.atan2(-w, dir * h); // shared B-end / C-start angle
    const arcAngleBStart = side === "left" ? Math.PI : 0;
    const arcAngleCEnd = Math.PI / 2;

    // Helper: world → container-local for graphics calls
    const lx = (wx: number) => wx - x;
    const ly = (wy: number) => wy - y;

    // ── Visual ────────────────────────────────────────────────────────────────
    const g = scene.add.graphics();

    // Filled body with rounded corners at B and C
    g.fillStyle(0x546e7a, 1);
    g.beginPath();
    g.moveTo(lx(x), ly(y)); // vertex A
    g.lineTo(lx(tAB_B.x), ly(tAB_B.y)); // up the outer wall to arc B start
    g.arc(lx(cBx), ly(cBy), r, arcAngleBStart, arcAngleBC, arcCCW); // corner B arc → tBC_B
    g.lineTo(lx(tBC_C.x), ly(tBC_C.y)); // straight active face to arc C start
    g.arc(lx(cCx), ly(cCy), r, arcAngleBC, arcAngleCEnd, arcCCW); // corner C arc → tCA_C
    g.lineTo(lx(x), ly(y)); // back to A along bottom
    g.closePath();
    g.fillPath();

    // Passive outer edges — subtle grey stroke
    g.lineStyle(2, 0x78909c, 1);
    g.beginPath();
    g.moveTo(lx(x), ly(y));
    g.lineTo(lx(tAB_B.x), ly(tAB_B.y));
    g.strokePath();
    g.beginPath();
    g.moveTo(lx(tCA_C.x), ly(tCA_C.y));
    g.lineTo(lx(x), ly(y));
    g.strokePath();

    // Active face (straight hypotenuse portion only) — bright accent
    g.lineStyle(4, 0xff8f00, 1);
    g.beginPath();
    g.moveTo(lx(tBC_B.x), ly(tBC_B.y));
    g.lineTo(lx(tBC_C.x), ly(tBC_C.y));
    g.strokePath();

    this.add(g);
    scene.add.existing(this);

    // ── Physics ───────────────────────────────────────────────────────────────
    // Each straight edge is a thin static rectangle; arcs are approximated by
    // addBodiesFromSvgPath (which creates multiple segments).  Only the active
    // face rectangle is stored — it's the sole trigger for the kick.

    const makeSeg = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      label = "wall"
    ) =>
      scene.matter.add.rectangle(
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        Math.hypot(x2 - x1, y2 - y1),
        WALL_T,
        {
          isStatic: true,
          angle: Math.atan2(y2 - y1, x2 - x1),
          label,
          friction: 0,
          restitution: 0.4,
        }
      );

    // Outer AB wall (A → tAB_B)
    const bodyAB = makeSeg(x, y, tAB_B.x, tAB_B.y);

    // Rounded corner at B — passive arc wall
    addBodiesFromSvgPath(
      scene,
      `M${tAB_B.x},${tAB_B.y} A${r},${r} 0 0,${svgSweep} ${tBC_B.x},${tBC_B.y}`
    );

    // Active face — straight central portion of the hypotenuse
    this.activeFaceBody = makeSeg(
      tBC_B.x,
      tBC_B.y,
      tBC_C.x,
      tBC_C.y,
      "slingshot"
    );

    // Rounded corner at C — passive arc wall
    addBodiesFromSvgPath(
      scene,
      `M${tBC_C.x},${tBC_C.y} A${r},${r} 0 0,${svgSweep} ${tCA_C.x},${tCA_C.y}`
    );

    // Bottom CA wall (tCA_C → A)
    const bodyCA = makeSeg(tCA_C.x, tCA_C.y, x, y);

    this.segBodies = [bodyAB, this.activeFaceBody, bodyCA];

    scene.matter.world.on("collisionstart", this.onCollisionStart, this);
    this.once("destroy", () => {
      scene.matter.world.off("collisionstart", this.onCollisionStart, this);
      for (const body of this.segBodies) {
        scene.matter.world.remove(body);
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
    this.scene.matter.body.setVelocity(ballBody, {
      x: ballBody.velocity.x + this.activeNx * SLINGSHOT_KICK,
      y: ballBody.velocity.y + this.activeNy * SLINGSHOT_KICK,
    });
    this.onHit?.();
  }
}
