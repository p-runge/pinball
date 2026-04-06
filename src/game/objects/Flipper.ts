import Phaser from "phaser";

export type FlipperSide = "left" | "right";

// Dimensions
const LENGTH = 90;
const HALF_THICK = 10; // half-height at the pivot end
const HALF_THIN = 5; // half-height at the tip

// Angles: positive = clockwise in Phaser's canvas coordinate system
const REST_ANGLE_DEG = 30; // tip angled downward at rest
const ACTIVE_ANGLE_DEG = -30; // tip angled upward when activated

// Animation durations in ms
const ACTIVATE_DURATION = 40; // solenoid snap — fast

/**
 * A flipper game object. The Container sits at the pivot point so that
 * rotation naturally swings the tip up and down around that anchor.
 *
 * Physics: a single compound Matter.js body (trapezoid + two circles) whose
 * centroid offset from the pivot is computed once and reused on every angle
 * update, keeping the physics shape pixel-aligned with the visual.
 */
export class Flipper extends Phaser.GameObjects.Container {
  private readonly physicsBody: MatterJS.BodyType;
  private readonly pivotX: number;
  private readonly pivotY: number;
  // Centroid of the compound body in the flipper's local (unrotated) frame.
  // Stored once at construction so applyAngle() can place the body correctly
  // regardless of the current angle.
  private readonly centOffX: number;
  private readonly centOffY: number;
  private readonly restAngle: number;
  private readonly activeAngle: number;
  private currentAngle: number;
  private activeTween: Phaser.Tweens.Tween | null = null;

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
    // All parts are created in the flipper's local (unrotated) space with the
    // pivot at the origin. body.create() computes the compound centroid and
    // stores it as compound.position — captured below before any setPosition call.
    const { body, bodies } = scene.matter;

    // Trapezoid part: pass its area-weighted centroid as the position so
    // Matter.js centres the vertices correctly inside the compound body.
    // Formula: centroid_x = L * (h1 + 2*h2) / (3*(h1+h2)) for a trapezoid.
    const trapCentX =
      (dir * LENGTH * (HALF_THICK + 2 * HALF_THIN)) /
      (3 * (HALF_THICK + HALF_THIN)); // ≈ dir * 40

    // fromVertices expects Array<Array<Vector>> (outer array = list of polygons)
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
      isStatic: true,
      label: "flipper",
    });

    // compound.position is now the mass-weighted centroid in local space.
    // Capture it before applyAngle() moves the body into world space.
    this.centOffX = compound.position.x;
    this.centOffY = compound.position.y;

    this.physicsBody = compound;
    scene.matter.world.add(compound);

    this.currentAngle = this.restAngle;
    this.applyAngle(this.currentAngle);
  }

  /** Rotate to the active (up) position. Call on key down. */
  activate(): void {
    this.animateTo(this.activeAngle, ACTIVATE_DURATION, "Cubic.easeOut");
  }

  /** Rotate back to the resting (down) position. Call on key up. */
  deactivate(): void {
    this.animateTo(this.restAngle, ACTIVATE_DURATION, "Cubic.easeOut");
  }

  /**
   * Animates the flipper to targetAngle, cancelling any in-progress tween
   * so that mid-flight direction changes feel instant.
   */
  private animateTo(targetAngle: number, duration: number, ease: string): void {
    this.activeTween?.stop();

    const proxy = { angle: this.currentAngle };
    this.activeTween = this.scene.tweens.add({
      targets: proxy,
      angle: targetAngle,
      duration,
      ease,
      onUpdate: () => {
        this.currentAngle = proxy.angle;
        this.applyAngle(this.currentAngle);
      },
      onComplete: () => {
        this.activeTween = null;
      },
    });
  }

  /**
   * Moves the compound body and the Container visual to the given angle,
   * keeping the pivot point fixed at (pivotX, pivotY) in world space.
   */
  private applyAngle(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const { body } = this.scene.matter;

    // Rotate the local centroid offset into world space and position the body
    // so that the pivot (local origin) lands exactly on (pivotX, pivotY).
    body.setPosition(this.physicsBody, {
      x: this.pivotX + this.centOffX * cos - this.centOffY * sin,
      y: this.pivotY + this.centOffX * sin + this.centOffY * cos,
    });
    body.setAngle(this.physicsBody, angle);

    this.setRotation(angle);
  }
}
