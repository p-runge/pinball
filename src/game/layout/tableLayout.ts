import { BALL_RADIUS } from "../objects/Ball";
import {
  FLIPPER_HALF_THICK,
  FLIPPER_HALF_THIN,
  FLIPPER_LENGTH,
  FLIPPER_REST_ANGLE_DEG,
} from "../objects/Flipper";
import { PLUNGER_BODY_H } from "../objects/Plunger";
import { LANE_WIDTH, TABLE_H, TABLE_W } from "./constants";

export interface TableLayout {
  // Outer table bounds
  left: number;
  right: number;
  top: number;
  bottom: number;

  // Plunger lane
  plungerSep: number;
  plungerEntryY: number;
  laneX: number;
  plungerRestY: number;

  // Gutter zone
  gutterY: number;
  gutterInnerLeft: number;
  gutterInnerRight: number;
  flipperY: number;

  // Gutter wall geometry
  leftWallX: number;
  rightWallX: number;
  arcStartY: number;
  arcEndDx: number;
  arcEndDy: number;
  arcEndAngleLeft: number;
  arcEndAngleRight: number;
  UPPER_EDGE_ANGLE: number;

  // Protective arc geometry
  protectY: number;
  PROTECT_ARC_END_DX: number;
  PROTECT_ARC_END_DY: number;

  // Radius / offset constants
  CORNER_R: number;
  LOWER_CORNER_R: number;
  PROTECT_R: number;
}

/**
 * Derives all table geometry from the canvas dimensions.
 * This is the single source of truth for every coordinate used by the layout
 * modules — none of them need to recompute anything independently.
 */
export function computeTableLayout(width: number, height: number): TableLayout {
  const left = (width - TABLE_W) / 2;
  const right = left + TABLE_W;
  const top = (height - TABLE_H) / 2;
  const bottom = top + TABLE_H;

  // Plunger lane (right side)
  const plungerSep = right - LANE_WIDTH; // separator between playfield and plunger lane
  const plungerEntryY = 200; // Y where the ball can enter the playfield

  const centerX = (left + plungerSep) / 2;

  // Y at which the lower channel zone begins
  const gutterY = bottom - 200;

  // Flipper pivot X positions — moved 6 px inward from the outer walls to
  // narrow the central gap slightly.
  const gutterInnerLeft = centerX - FLIPPER_LENGTH - 2 * BALL_RADIUS;
  const gutterInnerRight = centerX + FLIPPER_LENGTH + 2 * BALL_RADIUS;

  const flipperY = gutterY + 140;

  const LOWER_CORNER_R = 30;
  const CORNER_R = 60;
  const PROTECT_R = 120;

  const leftWallX = left + LANE_WIDTH;
  const rightWallX = plungerSep - LANE_WIDTH;

  // Horizontal distance from a channel wall to the flipper pivot
  const laneD = gutterInnerLeft - leftWallX;

  // Angle of the flipper's upper edge in its rest position (radians below horizontal).
  // upperEdgeAngle = restAngle + atan2(HALF_THICK − HALF_THIN, LENGTH)
  const UPPER_EDGE_ANGLE =
    Phaser.Math.DegToRad(FLIPPER_REST_ANGLE_DEG) +
    Math.atan2(FLIPPER_HALF_THICK - FLIPPER_HALF_THIN, FLIPPER_LENGTH);

  // Arc end-point offsets from the arc start on the channel wall.
  const arcEndDx = LOWER_CORNER_R * (1 - Math.sin(UPPER_EDGE_ANGLE));
  const arcEndDy = LOWER_CORNER_R * Math.cos(UPPER_EDGE_ANGLE);

  // Y where the vertical channel wall meets the transition arc.
  const arcStartY =
    flipperY - arcEndDy - Math.tan(UPPER_EDGE_ANGLE) * (laneD - arcEndDx);

  // Phaser arc end angles (left: π/2+α CCW from π; right: π/2−α CW from 0)
  const arcEndAngleLeft = Math.PI / 2 + UPPER_EDGE_ANGLE;
  const arcEndAngleRight = Math.PI / 2 - UPPER_EDGE_ANGLE;

  // Protective arc end-point offsets (eighth-circle, 45°)
  const PROTECT_ARC_END_DX = PROTECT_R * (1 - Math.SQRT1_2);
  const PROTECT_ARC_END_DY = PROTECT_R * Math.SQRT1_2;
  const protectY = gutterY - PROTECT_R - 12;

  // Plunger-lane ball spawn geometry
  const laneX = (plungerSep + right) / 2;
  const plungerRestY = bottom - PLUNGER_BODY_H / 2;

  return {
    left,
    right,
    top,
    bottom,
    plungerSep,
    plungerEntryY,
    laneX,
    plungerRestY,
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
    CORNER_R,
    LOWER_CORNER_R,
    PROTECT_R,
  };
}
