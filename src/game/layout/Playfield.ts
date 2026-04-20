import { Scene } from "phaser";
import { Bumper } from "../objects/Bumper";
import { DropTarget } from "../objects/DropTarget";
import { RolloverLane } from "../objects/RolloverLane";
import { StandupTarget } from "../objects/StandupTarget";
import { TableLayout } from "./tableLayout";

export interface PlayfieldCallbacks {
  /** A pop bumper was hit. */
  onBumperHit: () => void;
  /** All three rollover lanes are now lit (called once per cycle). */
  onAllRolloversLit: () => void;
  /** A single drop target was knocked down. */
  onDropTargetHit: () => void;
  /** All drop targets in the bank are down (called once per cycle). */
  onDropBankCleared: () => void;
  /** A standup target was hit. */
  onStandupHit: () => void;
}

export interface PlayfieldResult {
  /**
   * Reset all rollover lanes to unlit — call this on each ball drain so the
   * player has to re-light them every ball.
   */
  resetRolloverLanes: () => void;
  /** Update the lit colour of the rollover lanes (e.g. to preview the next multiplier level). */
  setRolloverLitColor: (hexColor: number) => void;
}

/**
 * Sets up all mid-playfield interactive elements:
 *   - Three rollover lanes across the upper field
 *   - Three pop bumpers in a triangle cluster
 *   - A bank of three drop targets on the left side
 *   - Two standup targets on the right side
 *
 * Fires the provided callbacks on each game event so the caller can apply
 * scoring without coupling this module to game-logic state.
 */
export function setupPlayfield(
  scene: Scene,
  layout: TableLayout,
  callbacks: PlayfieldCallbacks
): PlayfieldResult {
  const { top, centerX, leftWallX, rightWallX } = layout;
  const {
    onBumperHit,
    onAllRolloversLit,
    onDropTargetHit,
    onDropBankCleared,
    onStandupHit,
  } = callbacks;

  // ── Rollover lanes ──────────────────────────────────────────────────────────
  // Three horizontal sensor strips near the top of the playfield.  The ball
  // lights them as it passes through on its way back from the top wall.
  // When all three are lit the caller activates a score multiplier.
  const LANE_W = 72;
  const LANE_GAP = 14;
  const laneY = top + 120;
  const laneCenters = [
    centerX - LANE_W - LANE_GAP,
    centerX,
    centerX + LANE_W + LANE_GAP,
  ];
  let litCount = 0;

  const rollovers = laneCenters.map(
    (x) =>
      new RolloverLane(scene, x, laneY, LANE_W, () => {
        litCount += 1;
        if (litCount === 3) {
          onAllRolloversLit();
          // Reset immediately so the player can go for the next level.
          litCount = 0;
          rollovers.forEach((r) => r.reset());
        }
      })
  );

  // ── Pop bumpers ─────────────────────────────────────────────────────────────
  // Triangle cluster in the upper-centre playfield (same positions previously
  // placed inline in Game.ts).
  const bumperTopY = top + 220;
  const bumperDx = 42;
  const bumperDy = 68;
  new Bumper(scene, centerX - bumperDx, bumperTopY, onBumperHit);
  new Bumper(scene, centerX + bumperDx, bumperTopY, onBumperHit);
  new Bumper(scene, centerX, bumperTopY + bumperDy, onBumperHit);

  // ── Drop target bank ────────────────────────────────────────────────────────
  // Three targets near the left wall, each rotated 45° ("/").  Angling them
  // prevents the ball from resting on a flat surface and deflects it toward
  // the bumpers when hit.  They are stacked so a single aimed shot can clear
  // all three.
  const DROP_W = 12;
  const DROP_H = 52;
  const DROP_ANGLE_DEG = 45;
  const dropX = leftWallX + 74;
  const dropYTop = top + 440;
  const DROP_STEP = 56;
  const DROP_RESET_DELAY = 2000; // ms to reset drop targets after bank cleared
  const DROP_GROUP_SIZE = 3; // number of targets in the bank

  let targetsDown = 0;
  const dropTargets = [...Array(DROP_GROUP_SIZE)].map(
    (_, i) =>
      new DropTarget(
        scene,
        dropX,
        dropYTop + i * DROP_STEP,
        DROP_W,
        DROP_H,
        Phaser.Math.DegToRad(DROP_ANGLE_DEG),
        () => {
          onDropTargetHit();
          targetsDown += 1;
          if (targetsDown === DROP_GROUP_SIZE) {
            onDropBankCleared();
            scene.time.delayedCall(DROP_RESET_DELAY, () => {
              targetsDown = 0;
              dropTargets.forEach((t) => t.reset());
            });
          }
        }
      )
  );

  // ── Standup targets ─────────────────────────────────────────────────────────
  // Two targets near the right wall, each rotated −45° ("\"), mirroring the
  // drop targets.  They remain solid and flash on every hit.
  const STANDUP_W = 12;
  const STANDUP_H = 52;
  const STANDUP_ANGLE_DEG = -45;
  const standupX = rightWallX - 74;
  const standupYTop = top + 468;
  const STANDUP_STEP = 70;

  [...Array(2)].forEach(
    (_, i) =>
      new StandupTarget(
        scene,
        standupX,
        standupYTop + i * STANDUP_STEP,
        STANDUP_W,
        STANDUP_H,
        Phaser.Math.DegToRad(STANDUP_ANGLE_DEG),
        onStandupHit
      )
  );

  return {
    resetRolloverLanes: () => {
      litCount = 0;
      rollovers.forEach((lane) => lane.reset());
    },
    setRolloverLitColor: (hexColor: number) => {
      rollovers.forEach((lane) => lane.setLitColor(hexColor));
    },
  };
}
