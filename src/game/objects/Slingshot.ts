import Phaser from "phaser";

export type SlingshotSide = "left" | "right";

/**
 * How hard the slingshot kicks the ball when the active face is hit.
 * px per Matter normalised-velocity step (same unit as BUMPER_KICK).
 */
const SLINGSHOT_KICK = 15;

type CollisionEvent = {
  pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
};

/** Returns the squared distance from point (px,py) to the segment (ax,ay)→(bx,by). */
function distSqToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq)
  );
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

/**
 * A triangular "slingshot" bumper — the kind found on real pinball tables just
 * above the flipper gutters.
 *
 * Only the inner hypotenuse face is active: when the ball touches it, an
 * outward kick is applied.  The two outer legs behave as ordinary walls.
 *
 * @param x  World x of the bottom-outer corner (flush against the side wall).
 * @param y  World y of the bottom-outer corner.
 * @param side   "left" → triangle opens rightward; "right" → opens leftward.
 * @param w  Horizontal width of the triangle (how far it protrudes inward).
 * @param h  Vertical height of the triangle (how far it extends upward).
 * @param onHit  Optional callback fired every time the active face is struck.
 */
export class Slingshot extends Phaser.GameObjects.Container {
  private readonly physicsBody: MatterJS.BodyType;
  private readonly onHit: (() => void) | undefined;

  /** World-space vertices of the triangle, in order: outer-bottom, outer-top, inner-bottom. */
  private readonly vA: { x: number; y: number };
  private readonly vB: { x: number; y: number };
  private readonly vC: { x: number; y: number };

  /**
   * Outward normal of the active face (B→C), pointing into the playfield.
   * Precomputed so the collision handler pays no trig cost.
   */
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

    const dir = side === "left" ? 1 : -1; // +1 protrudes right; -1 protrudes left

    // Triangle vertices in world space.
    // A = bottom-outer (back corner, against the wall)
    // B = top-outer    (against the wall, directly above A)
    // C = bottom-inner (inward from A along the bottom)
    this.vA = { x, y };
    this.vB = { x, y: y - h };
    this.vC = { x: x + dir * w, y };

    // Active face: hypotenuse B → C
    // Left  (dir=+1): B→C direction = ( w, h), outward CW normal = ( h, -w) → right+up  ✓
    // Right (dir=-1): B→C direction = (-w, h), outward CCW normal = (-h, -w) → left+up   ✓
    // General: (dir*h, -w) / len
    const len = Math.hypot(w, h);
    this.activeNx = (dir * h) / len;
    this.activeNy = -w / len;

    // ── Visual ────────────────────────────────────────────────────────────────
    const g = scene.add.graphics();

    // Filled triangle body
    g.fillStyle(0x546e7a, 1); // blue-grey fill
    g.fillTriangle(
      this.vA.x - x,
      this.vA.y - y,
      this.vB.x - x,
      this.vB.y - y,
      this.vC.x - x,
      this.vC.y - y
    );

    // Passive edges (outer legs) — subtle grey
    g.lineStyle(2, 0x78909c, 1);
    g.beginPath();
    g.moveTo(this.vA.x - x, this.vA.y - y);
    g.lineTo(this.vB.x - x, this.vB.y - y);
    g.strokePath();
    g.beginPath();
    g.moveTo(this.vA.x - x, this.vA.y - y);
    g.lineTo(this.vC.x - x, this.vC.y - y);
    g.strokePath();

    // Active face (hypotenuse) — bright accent
    g.lineStyle(4, 0xff8f00, 1);
    g.beginPath();
    g.moveTo(this.vB.x - x, this.vB.y - y);
    g.lineTo(this.vC.x - x, this.vC.y - y);
    g.strokePath();

    this.add(g);
    scene.add.existing(this);

    // ── Physics ───────────────────────────────────────────────────────────────
    // fromVertices expects an array of vector objects.  The result is a static
    // convex polygon body centred on the centroid of the given vertices.
    this.physicsBody = scene.matter.add.fromVertices(
      (this.vA.x + this.vB.x + this.vC.x) / 3,
      (this.vA.y + this.vB.y + this.vC.y) / 3,
      [
        { x: this.vA.x, y: this.vA.y },
        { x: this.vB.x, y: this.vB.y },
        { x: this.vC.x, y: this.vC.y },
      ],
      {
        isStatic: true,
        label: "slingshot",
        friction: 0,
        restitution: 0.4,
      }
    );

    scene.matter.world.on("collisionstart", this.onCollisionStart, this);
    this.once("destroy", () => {
      scene.matter.world.off("collisionstart", this.onCollisionStart, this);
      scene.matter.world.remove(this.physicsBody);
    });
  }

  private onCollisionStart(event: CollisionEvent): void {
    for (const { bodyA, bodyB } of event.pairs) {
      if (bodyA === this.physicsBody && bodyB.label === "ball") {
        this.tryKick(bodyB);
      } else if (bodyB === this.physicsBody && bodyA.label === "ball") {
        this.tryKick(bodyA);
      }
    }
  }

  /**
   * Kick the ball only if it contacted the active hypotenuse face.
   *
   * Strategy: compute the squared distance from the ball center to each of the
   * three triangle edges.  The edge with the smallest distance is the contact
   * face.  If it's the active face (B→C), apply the kick.
   */
  private tryKick(ballBody: MatterJS.BodyType): void {
    const bx = ballBody.position.x;
    const by = ballBody.position.y;

    const dAB = distSqToSegment(
      bx,
      by,
      this.vA.x,
      this.vA.y,
      this.vB.x,
      this.vB.y
    );
    const dAC = distSqToSegment(
      bx,
      by,
      this.vA.x,
      this.vA.y,
      this.vC.x,
      this.vC.y
    );
    const dBC = distSqToSegment(
      bx,
      by,
      this.vB.x,
      this.vB.y,
      this.vC.x,
      this.vC.y
    );

    // Only kick if the active face (B→C) is closest.
    if (dBC > dAB || dBC > dAC) return;

    this.scene.matter.body.setVelocity(ballBody, {
      x: ballBody.velocity.x + this.activeNx * SLINGSHOT_KICK,
      y: ballBody.velocity.y + this.activeNy * SLINGSHOT_KICK,
    });

    this.onHit?.();
  }
}
