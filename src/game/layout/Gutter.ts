import { Scene } from "phaser";
import { CenterPost } from "../objects/CenterPost";
import { Flipper } from "../objects/Flipper";
import { Slingshot } from "../objects/Slingshot";
import { addBodiesFromSvgPath } from "../utils/svgPhysics";
import { LANE_WIDTH, SLINGSHOT_H, SLINGSHOT_W } from "./constants";
import { addWallSeg } from "./wallSegment";
import { TableLayout } from "./tableLayout";

export interface GutterResult {
  leftFlipper: Flipper;
  rightFlipper: Flipper;
}

/**
 * Draws and sets up the lower gutter zone: the channel walls leading into the
 * flippers, the transition arcs, the protective arcs that deflect balls toward
 * the flippers, and all game objects that live in this zone (flippers, center
 * post, slingshots).
 *
 * Returns the two Flipper instances so the caller can wire keyboard controls
 * and the CCD system.
 */
export function setupGutter(
  scene: Scene,
  layout: TableLayout,
  onSlingshotHit: () => void
): GutterResult {
  const {
    left,
    bottom,
    plungerSep,
    gutterY,
    gutterInnerLeft,
    gutterInnerRight,
    flipperY,
    leftWallX,
    rightWallX,
    arcStartY,
    arcEndDx,
    arcEndDy,
    arcEndAngleLeft,
    arcEndAngleRight,
    UPPER_EDGE_ANGLE,
    protectY,
    PROTECT_ARC_END_DX,
    PROTECT_ARC_END_DY,
    LOWER_CORNER_R,
    PROTECT_R,
  } = layout;

  const g = scene.add.graphics();
  g.lineStyle(3, 0xcccccc, 1);

  // ── Left channel wall + transition arc + angled connector ───────────────────
  // Runs vertically from the gutter floor, curves CCW around the lower-left
  // corner, then follows the flipper's upper-edge angle down to the pivot.
  g.beginPath();
  g.moveTo(leftWallX, gutterY);
  g.lineTo(leftWallX, arcStartY);
  g.arc(
    leftWallX + LOWER_CORNER_R,
    arcStartY,
    LOWER_CORNER_R,
    Math.PI,
    arcEndAngleLeft,
    true // anticlockwise
  );
  g.lineTo(gutterInnerLeft, flipperY);
  g.strokePath();

  // ── Right channel wall + transition arc + angled connector ──────────────────
  g.beginPath();
  g.moveTo(rightWallX, gutterY);
  g.lineTo(rightWallX, arcStartY);
  g.arc(
    rightWallX - LOWER_CORNER_R,
    arcStartY,
    LOWER_CORNER_R,
    0,
    arcEndAngleRight,
    false // clockwise
  );
  g.lineTo(gutterInnerRight, flipperY);
  g.strokePath();

  // ── Protective gutter arcs ───────────────────────────────────────────────────
  // An eighth-circle arc at the entrance of each outer gutter lane deflects
  // balls falling into the outer portion back toward the flippers, while
  // leaving a gap near the channel wall so a ball from centre can still drain.
  g.beginPath();
  g.arc(
    left + PROTECT_R,
    protectY,
    PROTECT_R,
    Math.PI,
    (Math.PI * 3) / 4,
    true // anticlockwise (CCW)
  );
  g.strokePath();

  g.beginPath();
  g.arc(
    plungerSep - PROTECT_R,
    protectY,
    PROTECT_R,
    0,
    Math.PI / 4,
    false // clockwise (CW)
  );
  g.strokePath();

  // ── Physics: left channel ───────────────────────────────────────────────────
  addWallSeg(scene, leftWallX, gutterY, leftWallX, arcStartY);
  addBodiesFromSvgPath(
    scene,
    // sweep-flag=0 (CCW): from arc start down the channel wall
    `M${leftWallX},${arcStartY} A${LOWER_CORNER_R},${LOWER_CORNER_R} 0 0,0 ${leftWallX + arcEndDx},${arcStartY + arcEndDy}`
  );
  addWallSeg(
    scene,
    leftWallX + arcEndDx,
    arcStartY + arcEndDy,
    gutterInnerLeft,
    flipperY
  );

  // ── Physics: right channel ──────────────────────────────────────────────────
  addWallSeg(scene, rightWallX, gutterY, rightWallX, arcStartY);
  addBodiesFromSvgPath(
    scene,
    // sweep-flag=1 (CW): mirrored on the right
    `M${rightWallX},${arcStartY} A${LOWER_CORNER_R},${LOWER_CORNER_R} 0 0,1 ${rightWallX - arcEndDx},${arcStartY + arcEndDy}`
  );
  addWallSeg(
    scene,
    rightWallX - arcEndDx,
    arcStartY + arcEndDy,
    gutterInnerRight,
    flipperY
  );

  // ── Physics: protective gutter arcs ────────────────────────────────────────
  addBodiesFromSvgPath(
    scene,
    `M${left},${protectY} A${PROTECT_R},${PROTECT_R} 0 0,0 ${left + PROTECT_ARC_END_DX},${protectY + PROTECT_ARC_END_DY}`
  );
  addBodiesFromSvgPath(
    scene,
    `M${plungerSep},${protectY} A${PROTECT_R},${PROTECT_R} 0 0,1 ${plungerSep - PROTECT_ARC_END_DX},${protectY + PROTECT_ARC_END_DY}`
  );

  // ── Game objects ─────────────────────────────────────────────────────────────
  const leftFlipper = new Flipper(scene, gutterInnerLeft, flipperY, "left");
  const rightFlipper = new Flipper(scene, gutterInnerRight, flipperY, "right");

  // Center post — deflects a ball falling straight down the center back toward
  // a flipper.
  new CenterPost(scene, (gutterInnerLeft + gutterInnerRight) / 2, bottom + 15);

  // Slingshots — triangular kickers just above the gutter diagonals, flush
  // against the side walls. Only the inner hypotenuse face is active.
  // Shape matches real-world spec: 100 mm active face at 55° from horizontal.
  // The bottom wall slopes at UPPER_EDGE_ANGLE so it stays parallel to the
  // angled channel wall that leads to each flipper.
  //
  // Anchor = outer bottom corner A:
  //   x — LANE_WIDTH from the outer channel wall (straightforward)
  //   y — positioned so the perpendicular gap between the slingshot bottom wall
  //       and the angled channel wall equals LANE_WIDTH.
  //
  // Both walls share slope m = tan(UPPER_EDGE_ANGLE).  For two parallel lines
  // y = mx + b₁ and y = mx + b₂, perpendicular distance = |b₁−b₂| × cos(α).
  // Setting that equal to LANE_WIDTH and solving for y_A:
  //   y_A = flipperY + m × (x_A − gutterInnerLeft) − LANE_WIDTH / cos(α)
  const m = Math.tan(UPPER_EDGE_ANGLE);
  const cosA = Math.cos(UPPER_EDGE_ANGLE);
  const slingshotAnchorY =
    flipperY +
    m * (leftWallX + LANE_WIDTH - gutterInnerLeft) -
    LANE_WIDTH / cosA;

  new Slingshot(
    scene,
    leftWallX + LANE_WIDTH,
    slingshotAnchorY,
    "left",
    SLINGSHOT_W,
    SLINGSHOT_H,
    UPPER_EDGE_ANGLE,
    onSlingshotHit
  );
  new Slingshot(
    scene,
    rightWallX - LANE_WIDTH,
    slingshotAnchorY,
    "right",
    SLINGSHOT_W,
    SLINGSHOT_H,
    UPPER_EDGE_ANGLE,
    onSlingshotHit
  );

  return { leftFlipper, rightFlipper };
}
