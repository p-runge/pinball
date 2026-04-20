import Phaser from "phaser";

export type FlipperSide = "left" | "right";

export const FLIPPER_LENGTH = 80;
export const FLIPPER_HALF_THICK = 10;
export const FLIPPER_HALF_THIN = 5;
export const FLIPPER_REST_ANGLE_DEG = 30;
const SWING_ANGLE_DEG = 52;
export const FLIPPER_ACTIVE_ANGLE_DEG =
  FLIPPER_REST_ANGLE_DEG - SWING_ANGLE_DEG;

const LENGTH = FLIPPER_LENGTH;
const HALF_THICK = FLIPPER_HALF_THICK;
const HALF_THIN = FLIPPER_HALF_THIN;

const REST_ANGLE_DEG = FLIPPER_REST_ANGLE_DEG;
const ACTIVE_ANGLE_DEG = FLIPPER_ACTIVE_ANGLE_DEG;

// Maximum angular displacement per millisecond.
const ACTIVATE_SPEED = Phaser.Math.DegToRad(60) / 30;
const DEACTIVATE_SPEED = Phaser.Math.DegToRad(60) / 30;

/**
 * A pinball flipper.
 *
 * Uses a static Matter.js compound body.  Static bodies are never moved by
 * the engine, so the hitbox stays exactly where we put it.  We drive the
 * flipper ourselves each sub-step:
 *
 *   1. setPosition / setAngle  — move the body to the new pose.
 *   2. setVelocity             — tell the collision resolver the surface
 *                                velocity so it computes the correct launch
 *                                impulse for any ball that makes contact.
 *   3. setAngularVelocity      — same for the rotational component.
 *
 * When the flipper is stationary, velocity is zero → a resting ball is not
 * disturbed.  When it's swinging, the ball is launched at the correct angle
 * and speed for the contact point.
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

  /** Pivot-local vertices (body at world angle = 0). Cached at construction. */
  readonly localVertices: ReadonlyArray<{ x: number; y: number }>;
  /** Flipper angle at the start of the current step (before this step moved it). */
  prevAngle: number;

  get pivotWorldX(): number {
    return this.pivotX;
  }
  get pivotWorldY(): number {
    return this.pivotY;
  }
  get currentAngle(): number {
    return this.physicsBody.angle;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, side: FlipperSide) {
    // Place the container at the physics pivot so setRotation() rotates around it.
    super(scene, x, y + HALF_THICK);

    this.pivotX = x;
    this.pivotY = y + HALF_THICK;

    const dir = side === "left" ? 1 : -1;
    this.restAngle = dir * Phaser.Math.DegToRad(REST_ANGLE_DEG);
    this.activeAngle = dir * Phaser.Math.DegToRad(ACTIVE_ANGLE_DEG);

    // ── Visual ───────────────────────────────────────────────────────────────
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
    g.fillCircle(0, 0, 5); // pivot marker
    this.add(g);
    scene.add.existing(this);

    // ── Physics ──────────────────────────────────────────────────────────────
    const { body, bodies } = scene.matter;

    // Centroid of the trapezoidal part (analytically: h/3 * (a+2b)/(a+b)).
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
      isStatic: true, // engine never moves it; we drive position ourselves
      friction: 0.0,
      restitution: 0.3,
      label: "flipper",
    });

    // Offset of the compound centroid from the pivot in body-local space
    // (captured at creation time when all parts sit near the world origin).
    this.centOffX = compound.position.x;
    this.centOffY = compound.position.y;
    this.physicsBody = compound;
    scene.matter.world.add(compound);

    this.placeAt(this.restAngle);
    this.setRotation(this.restAngle);
    this.targetAngle = this.restAngle;
    this.prevAngle = this.restAngle;

    // Cache vertices in pivot-local frame (at body angle = 0).
    // At restAngle: worldVert = pivot + R(restAngle) * localVert
    // → localVert = R(-restAngle) * (worldVert - pivot)
    const cosNeg = Math.cos(-this.restAngle);
    const sinNeg = Math.sin(-this.restAngle);
    this.localVertices =
      this.physicsBody.vertices?.map((v) => {
        const dx = v.x - this.pivotX;
        const dy = v.y - this.pivotY;
        return { x: dx * cosNeg - dy * sinNeg, y: dx * sinNeg + dy * cosNeg };
      }) ?? [];

    scene.matter.world.on("beforeupdate", this.step, this);
    scene.matter.world.on("afterupdate", this.syncVisual, this);
    this.once("destroy", () => {
      scene.matter.world.off("beforeupdate", this.step, this);
      scene.matter.world.off("afterupdate", this.syncVisual, this);
    });
  }

  get isSwinging(): boolean {
    return Math.abs(this.physicsBody.angle - this.targetAngle) > 0.001;
  }

  activate(): void {
    this.targetAngle = this.activeAngle;
    this.isActivating = true;
  }

  deactivate(): void {
    this.targetAngle = this.restAngle;
    this.isActivating = false;
  }

  private step(event: { timestamp: number }): void {
    const dt =
      this.prevTimestamp < 0 ? 0 : event.timestamp - this.prevTimestamp;
    this.prevTimestamp = event.timestamp;
    if (dt <= 0) return;

    const currentAngle = this.physicsBody.angle;
    this.prevAngle = currentAngle; // record before this step moves the body
    const diff = this.targetAngle - currentAngle;

    let newAngle: number;
    let angVel: number;

    if (Math.abs(diff) < 0.0001) {
      newAngle = this.targetAngle;
      angVel = 0;
    } else {
      const speed = this.isActivating ? ACTIVATE_SPEED : DEACTIVATE_SPEED;
      const delta = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
      newAngle = currentAngle + delta;
      angVel = delta;
    }

    // Centroid positions for the old and new angles, pivot fixed at (pivotX, pivotY).
    const oldCos = Math.cos(currentAngle);
    const oldSin = Math.sin(currentAngle);
    const oldCx = this.pivotX + this.centOffX * oldCos - this.centOffY * oldSin;
    const oldCy = this.pivotY + this.centOffX * oldSin + this.centOffY * oldCos;

    const newCos = Math.cos(newAngle);
    const newSin = Math.sin(newAngle);
    const newCx = this.pivotX + this.centOffX * newCos - this.centOffY * newSin;
    const newCy = this.pivotY + this.centOffX * newSin + this.centOffY * newCos;

    const { body } = this.scene.matter;
    body.setPosition(this.physicsBody, { x: newCx, y: newCy });
    body.setAngle(this.physicsBody, newAngle);
    // Expose the surface velocity so the collision resolver applies the correct
    // launch impulse to a ball that makes contact this step.
    body.setVelocity(this.physicsBody, { x: newCx - oldCx, y: newCy - oldCy });
    body.setAngularVelocity(this.physicsBody, angVel);
  }

  private syncVisual(): void {
    this.setRotation(this.physicsBody.angle);
  }

  /** Place the body so the pivot lies exactly at (pivotX, pivotY). */
  private placeAt(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.scene.matter.body.setPosition(this.physicsBody, {
      x: this.pivotX + this.centOffX * cos - this.centOffY * sin,
      y: this.pivotY + this.centOffX * sin + this.centOffY * cos,
    });
    this.scene.matter.body.setAngle(this.physicsBody, angle);
  }
}
