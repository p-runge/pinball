import { Scene } from "phaser";
import { WALL_RESTITUTION, WALL_T } from "./constants";

/**
 * Adds a static thin-rectangle wall segment between two world-space points.
 * All straight wall sections across the table use this helper.
 */
export function addWallSeg(
  scene: Scene,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  scene.matter.add.rectangle(
    (x1 + x2) / 2,
    (y1 + y2) / 2,
    Math.hypot(x2 - x1, y2 - y1),
    WALL_T,
    {
      isStatic: true,
      angle: Math.atan2(y2 - y1, x2 - x1),
      label: "wall",
      friction: 0.0,
      restitution: WALL_RESTITUTION,
    }
  );
}
