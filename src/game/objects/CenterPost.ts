import Phaser from "phaser";

export const CENTER_POST_RADIUS = 9;
const RADIUS = CENTER_POST_RADIUS;

/**
 * A passive cylindrical post mounted in the centre of the flipper gap.
 *
 * Acts as a last-resort deflector: a ball falling straight down the middle
 * hits the post and bounces to one side, giving the player a chance to
 * recover with a flipper.  The post has no kick — it is purely elastic.
 *
 * Visually it looks like a small metal peg, consistent with the rest of
 * the table's aesthetic.
 */
export class CenterPost {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    // ── Physics ────────────────────────────────────────────────────────────────
    scene.matter.add.circle(x, y, RADIUS, {
      isStatic: true,
      label: "wall",
      friction: 0,
      restitution: 1, // bouncier than walls so the deflection is satisfying
    });

    // ── Visual ─────────────────────────────────────────────────────────────────
    const g = scene.add.graphics();

    // Base metallic circle
    g.fillStyle(0xaaaaaa, 1);
    g.fillCircle(x, y, RADIUS);

    // Darker ring for depth
    g.lineStyle(2, 0x555555, 1);
    g.strokeCircle(x, y, RADIUS);

    // Small specular highlight
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(x - RADIUS * 0.3, y - RADIUS * 0.35, RADIUS * 0.3);
  }
}
