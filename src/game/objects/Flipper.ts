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
 *
 * The Matter.js physics bodies are built to exactly match the visual:
 *   - a trapezoid polygon for the tapered body
 *   - two circles for the rounded end caps
 * Vertices are pre-rotated into world space so the shapes align without
 * any post-creation angle adjustment.
 */
export class Flipper extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, side: FlipperSide) {
    super(scene, x, y);

    const dir = side === "left" ? 1 : -1;
    const angle = dir * Phaser.Math.DegToRad(REST_ANGLE_DEG);

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
    this.setRotation(angle);
    scene.add.existing(this);

    // ---- Physics bodies ----
    // Vertices are computed in world space (pre-rotated around the pivot)
    // so the bodies align with the visual without any extra setAngle() call.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const toWorld = (lx: number, ly: number) => ({
      x: x + lx * cos - ly * sin,
      y: y + lx * sin + ly * cos,
    });

    // Trapezoid body — vertices in world space, centered around their centroid
    // so Matter.js places the body at exactly the right position.
    const worldVerts = [
      toWorld(0, -HALF_THICK),
      toWorld(dir * LENGTH, -HALF_THIN),
      toWorld(dir * LENGTH, HALF_THIN),
      toWorld(0, HALF_THICK),
    ];
    const centroid = polygonCentroid(worldVerts);
    const localVerts = worldVerts.map((v) => ({
      x: v.x - centroid.x,
      y: v.y - centroid.y,
    }));

    scene.matter.add.fromVertices(centroid.x, centroid.y, localVerts, {
      isStatic: true,
      label: "flipper",
    });

    // Circles matching the rounded end caps
    const tipWorld = toWorld(dir * LENGTH, 0);
    scene.matter.add.circle(x, y, HALF_THICK, {
      isStatic: true,
      label: "flipper",
    });
    scene.matter.add.circle(tipWorld.x, tipWorld.y, HALF_THIN, {
      isStatic: true,
      label: "flipper",
    });
  }
}

/** Area-weighted centroid of a convex polygon (standard shoelace formula). */
function polygonCentroid(verts: { x: number; y: number }[]): {
  x: number;
  y: number;
} {
  let cx = 0;
  let cy = 0;
  let area = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = verts[i].x * verts[j].y - verts[j].x * verts[i].y;
    cx += (verts[i].x + verts[j].x) * cross;
    cy += (verts[i].y + verts[j].y) * cross;
    area += cross;
  }
  area /= 2;
  return { x: cx / (6 * area), y: cy / (6 * area) };
}
