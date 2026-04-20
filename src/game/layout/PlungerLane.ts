import { Scene } from "phaser";
import { Ball, BALL_RADIUS } from "../objects/Ball";
import { OneWayGate } from "../objects/OneWayGate";
import { Plunger, PLUNGER_BODY_H } from "../objects/Plunger";
import { addWallSeg } from "./wallSegment";
import { TableLayout } from "./tableLayout";

export interface PlungerLaneResult {
  ballSpawnX: number;
  ballSpawnY: number;
}

/**
 * Draws and sets up physics for the right-side plunger lane: the lane
 * separator wall, the entry arch into the playfield, the Plunger body, and
 * the one-way gate that prevents a ball from re-entering the lane.
 *
 * Returns the ball spawn position (centre of the ball resting on the plunger).
 */
export function setupPlungerLane(
  scene: Scene,
  layout: TableLayout,
  getBall: () => Ball | null
): PlungerLaneResult {
  const { right, bottom, plungerSep, plungerEntryY, laneX, plungerRestY } =
    layout;

  const g = scene.add.graphics();
  g.lineStyle(3, 0xcccccc, 1);

  // Lane separator line (runs from entry point down to the table bottom)
  g.beginPath();
  g.moveTo(plungerSep, plungerEntryY);
  g.lineTo(plungerSep, bottom);
  g.strokePath();

  // Entry arch — short horizontal connector between lane separator and right wall
  g.beginPath();
  g.moveTo(plungerSep, plungerEntryY);
  g.lineTo(right, plungerEntryY);
  g.strokePath();

  // Physics: lane separator wall segment
  addWallSeg(scene, plungerSep, plungerEntryY, plungerSep, bottom);

  // Plunger: the body acts as the lane floor; the ball rests and launches from it.
  // The charge bar is rendered just outside the right table wall.
  new Plunger(
    scene,
    laneX,
    plungerRestY,
    plungerEntryY, // top of the plunger sensor = lane entry
    right + 32, // charge bar X
    bottom - 10 // charge bar bottom Y
  );

  // One-way gate at the top of the lane separator.
  // The ball may exit the plunger lane (travel leftward) but cannot re-enter
  // it from the playfield (travel rightward).
  new OneWayGate(
    scene,
    plungerSep,
    plungerEntryY,
    plungerSep + 36,
    plungerEntryY - 36,
    1, // ball may cross from bottom-right (plunger lane side)
    () => getBall()
  );

  return {
    ballSpawnX: laneX,
    ballSpawnY: plungerRestY - PLUNGER_BODY_H / 2 - BALL_RADIUS,
  };
}
