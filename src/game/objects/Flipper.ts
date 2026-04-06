import Phaser from "phaser";

export type FlipperSide = "left" | "right";

const LENGTH = 90;
const HALF_THICK = 10;
const HALF_THIN = 5;

const REST_ANGLE_DEG = 30;
const ACTIVE_ANGLE_DEG = -30;

const ACTIVATE_SPEED = Phaser.Math.DegToRad(60) / 30;
const DEACTIVATE_SPEED = Phaser.Math.DegToRad(60) / 30;

/**
 * A pinball flipper.
 *
 * Physics approach:
 *   - Dynamic (non-static) compound body so Matter.js tracks its velocity
 *     natively. This is critical: the collision resolver reads body.velocity
 *     when computing impulses, and for static bodies that velocity is always
 *     zero — resulting in the "ball sticks to flipper" effect.
 *   - ignoreGravity + infinite inertia: we control the rotation manually;
 *     no external forces or torques can interfere.
 *   - A world constraint (pin joint) keeps the pivot fixed in world space.
 *     After each step Matter.js writes the constraint-correction displacement
 *     back into body.velocity via Constraint.postSolveAll, so the collision
 *     resolver automatically sees the correct tangential surface velocity.
 *   - We only need to set body.angularVelocity each beforeupdate step.
 *     Everything else (linear velocity, impulse transfer) is handled by the
 *     engine + constraint pipeline.
 */
export class Flipper extends Phaser.GameObjects.Container {
  private readonly physicsBody: MatterJS.BodyType;
  private readonly pivotX: number;
  private readonly pivotY: number;
  private readonly centOffX: number;
  private readonly centOffY: number;
  private readonly restAngle: number;
  private readonly activeAngle: number;
  private targetAngle: number;
  private isActivating = false;
  private prevTimestamp = -1;

  constructor(scene: Phaser.Scene, x: number, y: number, side: FlipperSide) {
    super(scene, x, y);

    this.pivotX = x;
    this.pivotY = y;

    const dir = side === "left" ? 1 : -1;
    this.restAngle = dir * Phaser.Math.DegToRad(REST_ANGLE_DEG);
    this.activeAngle = dir * Phaser.Math.DegToRad(ACTIVE_ANGLE_DEG);

    // ---- Visual ----
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillPoints(
      [
        { x: 0, y: -HALF_THICK },
        { x: dir * LENGTH, y: -HALF_THIN },
        { x: dir * LENGTH, y: HALF_THIN },
        { x: 0, y: HALF_THICK },
      ],
      true
    );
    g.fillCircle(0, 0, HALF_THICK);
    g.fillCircle(dir * LENGTH, 0, HALF_THIN);
    g.fillStyle(0xff8c00, 1);
    g.fillCircle(0, 0, 5);
    this.add(g);
    scene.add.existing(this);

    // ---- Physics compound body ----
    const { body, bodies } = scene.matter;

    const trapCentX =
      (dir * LENGTH * (HALF_THICK + 2 * HALF_THIN)) /
      (3 * (HALF_THICK + HALF_THIN));

    const trapPart = bodies.fromVertices(trapCentX, 0, [
      [
        { x: 0, y: -HALF_THICK },
        { x: dir * LENGTH, y: -HALF_THIN },
        { x: dir * LENGTH, y: HALF_THIN },
        { x: 0, y: HALF_THICK },
      ],
    ]);
    const pivotPart = bodies.circle(0, 0, HALF_THICK);
    const tipPart = bodies.circle(dir * LENGTH, 0, HALF_THIN);

    const compound = body.create({
      parts: [trapPart, pivotPart, tipPart],
      // Dynamic (not static) so Matter.js maintains velocity correctly and the
      // collision resolver can transfer momentum to the ball.
      isStatic: false,
      ignoreGravity: true, // we position it ourselves — no gravitational drift
      frictionAir: 0, // no damping — we control angular velocity directly
      friction: 0.05,
      restitution: 0.3,
      // High mass keeps the position solver from pushing the flipper around
      // during collision response; the constraint still corrects any drift.
      mass: 1000,
      label: "flipper",
    });

    // Prevent external torques (ball impacts) from rotating the flipper.
    // Only our explicit setAngularVelocity calls change the rotation.
    body.setInertia(compound, Infinity);

    this.centOffX = compound.position.x;
    this.centOffY = compound.position.y;
    this.physicsBody = compound;
    scene.matter.world.add(compound);

    // Place at rest angle so the constraint starts from the correct position.
    this.placeAt(0);
    this.setRotation(0);

    // Pin joint: keeps the flipper's pivot point fixed at (x, y) in world space.
    // worldConstraint sets bodyB = compound, so:
    //   pointA = world-space anchor (the pivot location)
    //   pointB = local offset on the body from its centroid to the pivot
    scene.matter.add.worldConstraint(compound, 0, 1, {
      pointA: { x, y },
      pointB: { x: -this.centOffX, y: -this.centOffY },
    });

    this.targetAngle = this.restAngle;

    scene.matter.world.on("beforeupdate", this.step, this);
    scene.matter.world.on("afterupdate", this.syncVisual, this);
    this.once("destroy", () => {
      scene.matter.world.off("beforeupdate", this.step, this);
      scene.matter.world.off("afterupdate", this.syncVisual, this);
    });
  }

  activate(): void {
    this.targetAngle = this.activeAngle;
    this.isActivating = true;
  }

  deactivate(): void {
    this.targetAngle = this.restAngle;
    this.isActivating = false;
  }

  /**
   * Runs inside every physics sub-step.
   * Sets angularVelocity toward the target angle. The constraint then corrects
   * the body's centroid position, and Matter.js writes the resulting linear
   * velocity into body.velocity via Constraint.postSolveAll — giving the
   * collision resolver the correct surface velocity automatically.
   */
  private step(event: { timestamp: number }): void {
    const dt =
      this.prevTimestamp < 0 ? 0 : event.timestamp - this.prevTimestamp;
    this.prevTimestamp = event.timestamp;
    if (dt <= 0) return;

    const diff = this.targetAngle - this.physicsBody.angle;

    if (Math.abs(diff) < 0.0001) {
      // Snap exactly to target and hold still.
      this.scene.matter.body.setAngularVelocity(this.physicsBody, 0);
      this.scene.matter.body.setAngle(this.physicsBody, this.targetAngle);
      return;
    }

    const speed = this.isActivating ? ACTIVATE_SPEED : DEACTIVATE_SPEED;
    const angVel = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
    this.scene.matter.body.setAngularVelocity(this.physicsBody, angVel);
  }

  /** Sync the visual Container rotation to match the physics body each step. */
  private syncVisual(): void {
    this.setRotation(this.physicsBody.angle);

    // The constraint correction each step displaces the centroid, which
    // Body.update would interpret as velocity next step (position - positionPrev).
    // With frictionAir=0 that carries forward unattenuated, causing the centroid
    // to overshoot and oscillate — misaligning the collision shape from the visual.
    // Zero positionPrev here so the next integration starts with zero linear
    // velocity; the constraint still writes the correct velocity for this step's
    // collision resolution before syncVisual runs.
    this.physicsBody.positionPrev.x = this.physicsBody.position.x;
    this.physicsBody.positionPrev.y = this.physicsBody.position.y;
  }

  /** Position the compound body so the pivot lies exactly at (pivotX, pivotY). */
  private placeAt(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const { body } = this.scene.matter;
    body.setPosition(this.physicsBody, {
      x: this.pivotX + this.centOffX * cos - this.centOffY * sin,
      y: this.pivotY + this.centOffX * sin + this.centOffY * cos,
    });
    body.setAngle(this.physicsBody, angle);
  }
}
