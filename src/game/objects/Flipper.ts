import Phaser from "phaser";

export type FlipperSide = "left" | "right";

// Dimensions
const LENGTH = 90;
const HALF_THICK = 10; // half-height at the pivot end
const HALF_THIN = 5; // half-height at the tip

// Resting angle (tip pointing downward)
const REST_ANGLE_DEG = 30;

/**
 * A flipper game object. The Container is positioned at the pivot point
 * (the outer end fixed to the wall), so that future rotation naturally
 * swings the tip up and down around that anchor.
 *
 * Left flipper: extends to the right from pivot.
 * Right flipper: extends to the left from pivot.
 */
export class Flipper extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, side: FlipperSide) {
    super(scene, x, y);

    const dir = side === "left" ? 1 : -1;

    const g = scene.add.graphics();

    // --- Flipper body ---
    g.fillStyle(0xffffff, 1);

    // Tapered trapezoid: wide at pivot (origin), narrow at tip
    g.fillPoints(
      [
        { x: 0, y: -HALF_THICK },
        { x: dir * LENGTH, y: -HALF_THIN },
        { x: dir * LENGTH, y: HALF_THIN },
        { x: 0, y: HALF_THICK },
      ],
      true
    );

    // Rounded caps: circles at each end blend into the trapezoid body
    g.fillCircle(0, 0, HALF_THICK);
    g.fillCircle(dir * LENGTH, 0, HALF_THIN);

    // --- Anchor highlight ---
    g.fillStyle(0xff8c00, 1);
    g.fillCircle(0, 0, 5);

    this.add(g);
    this.setRotation(dir * Phaser.Math.DegToRad(REST_ANGLE_DEG));

    scene.add.existing(this);
  }
}
