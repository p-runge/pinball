import { Scene } from "phaser";
import { BALL_RADIUS } from "../objects/Ball";
import { addBodiesFromSvgPath } from "../utils/svgPhysics";
import { addWallSeg } from "./wallSegment";
import { TableLayout } from "./tableLayout";

/**
 * Draws and adds physics bodies for the outer table border (straight walls,
 * concave top-corner arcs) and places the drain sensor below the table opening.
 *
 * The two quarter-circle top-corner arcs are centred INSIDE the playfield so
 * that their concave face guides the ball around each corner instead of
 * bouncing it off a convex bump.
 */
export function setupTableBorder(scene: Scene, layout: TableLayout): void {
  const { left, right, top, bottom, CORNER_R } = layout;

  const g = scene.add.graphics();
  g.lineStyle(3, 0xcccccc, 1);

  // Outer border with concave top corners
  g.beginPath();
  g.moveTo(left, top + CORNER_R);
  g.arc(
    left + CORNER_R,
    top + CORNER_R,
    CORNER_R,
    Math.PI,
    -Math.PI / 2,
    false
  );
  g.lineTo(right - CORNER_R, top);
  g.arc(right - CORNER_R, top + CORNER_R, CORNER_R, -Math.PI / 2, 0, false);
  g.lineTo(right, bottom);
  g.strokePath();

  g.beginPath();
  g.moveTo(left, top + CORNER_R);
  g.lineTo(left, bottom);
  g.strokePath();

  // Straight walls trimmed to the arc endpoints so the geometry is seamless
  // with the concave corner inlays below.
  addWallSeg(scene, left + CORNER_R, top, right - CORNER_R, top); // top (between inlays)
  addWallSeg(scene, left, top + CORNER_R, left, bottom); // left (below inlay)
  addWallSeg(scene, right, top + CORNER_R, right, bottom); // right (below inlay)

  // Concave top-corner arc bodies — SVG sweep-flag=0 → CCW, placing the centre
  // of curvature INSIDE the playfield.
  addBodiesFromSvgPath(
    scene,
    `M${right},${top + CORNER_R} A${CORNER_R},${CORNER_R} 0 0,0 ${right - CORNER_R},${top}`
  );
  addBodiesFromSvgPath(
    scene,
    `M${left + CORNER_R},${top} A${CORNER_R},${CORNER_R} 0 0,0 ${left},${top + CORNER_R}`
  );

  // Drain sensor just below the table opening.
  scene.matter.add.rectangle(
    (left + right) / 2,
    bottom + BALL_RADIUS + 24,
    right - left,
    48,
    { isStatic: true, isSensor: true, label: "drain-sensor" }
  );
}
