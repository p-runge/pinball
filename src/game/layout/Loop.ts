import { Scene } from "phaser";
import { BALL_RADIUS } from "../objects/Ball";
import { addBodiesFromSvgPath } from "../utils/svgPhysics";
import { TableLayout } from "./tableLayout";
import { LANE_WIDTH } from "./constants";

/** Width of the orbit channel — same as the side-lane width. */
const ORBIT_W = LANE_WIDTH; // 34 px

/**
 * How far below the table top the loop entry/exit openings sit.
 * Keeping this below the bumper cluster (top + 220) makes the orbit
 * accessible via flipper shots aimed at the upper-left / plunger launches.
 */
const ENTRY_OFFSET = 320; // px

const LOOP_COLOR = 0x00ff00;

export interface LoopCallbacks {
  onLoopScore: () => void;
}

/**
 * Builds the round "orbit" loop at the top of the playfield.
 *
 * The inner wall follows a continuous "drop" shape: two large-radius circular
 * arcs sweep the arms from wide entry openings near the table centre upward
 * and outward to the corner-arc junctions, giving a teardrop outline with no
 * straight sections.  Each arm arc is tangent to the inner corner arc at its
 * junction, so the ball experiences zero kinks.
 *
 *        ┌──────────────────────────────┐  outer top wall (y = top)
 *        │  ╭────────────────────────╮  │  inner top wall (y = top + ORBIT_W)
 *        │ ╱                          ╲ │
 *        ││          (orbit            ││
 *        ││          interior)         ││  plunger
 *        │ ╲                          ╱ │  lane
 *        └──╰──entry L    entry R──╯  ──┘
 *
 * Left entry:  ball goes up the left side lane, curves around the top, exits
 *              right toward the plunger lane opening.
 * Right entry: ball launched by plunger enters at plungerEntryY, arcs around
 *              the top, exits left into the main playfield.
 */
export function setupLoop(
  scene: Scene,
  layout: TableLayout,
  callbacks: LoopCallbacks
): void {
  const { left, right, top, CORNER_R, leftWallX, plungerSep, plungerEntryY } =
    layout;

  const INNER_R = CORNER_R - ORBIT_W; // 86 px — inner corner-arc radius
  const innerLeftX = leftWallX; //  184 px
  const innerRightX = plungerSep; //  666 px
  const innerTopY = top + ORBIT_W; //   74 px
  const armTopY = top + CORNER_R; //  160 px — arm/corner-arc junction Y

  // Entry points sit directly below the outer corner-arc centres.
  // Using x = left + CORNER_R and x = right − CORNER_R means the arm's
  // horizontal inset matches INNER_R (= CORNER_R − ORBIT_W = 86 px), which
  // is exactly what is needed for tangent continuity at the junction.
  const entryLeftX = left + CORNER_R; //  270 px
  const entryRightX = right - CORNER_R; //  580 px
  const entryY = top + ENTRY_OFFSET; //  360 px

  // Arm arc radius: derived so the arc is tangent-continuous (vertical) at
  // the junction (innerLeftX / innerRightX, armTopY) and passes through the
  // entry point.  Center lies on y = armTopY at distance R from the junction.
  //   (R − INNER_R)² + (entryY − armTopY)²  =  R²
  //   R = (INNER_R² + (entryY − armTopY)²) / (2 · INNER_R)
  const R_ARM = (INNER_R * INNER_R + (entryY - armTopY) ** 2) / (2 * INNER_R);
  const armCenterLX = innerLeftX + R_ARM; // ~459.6 px
  const armCenterRX = innerRightX - R_ARM; // ~390.4 px

  // Arc angles in Phaser screen-Y-down coordinates (CW = anticlockwise:false)
  const armAngleStartL = Math.atan2(entryY - armTopY, entryLeftX - armCenterLX); // ~133.4°
  const armAngleEndL = Math.PI; // junction is directly left of left centre
  const armAngleStartR = 0; // junction is directly right of right centre
  const armAngleEndR = Math.atan2(entryY - armTopY, entryRightX - armCenterRX); // ~46.6°

  // ── Graphics ──────────────────────────────────────────────────────────────
  const g = scene.add.graphics();
  g.lineStyle(3, LOOP_COLOR, 0.9);

  // Inner drop-shape wall: left arm → left corner arc → top → right corner arc → right arm
  g.beginPath();
  g.moveTo(entryLeftX, entryY);
  // Left arm: CW large-radius arc from entry up to junction
  g.arc(armCenterLX, armTopY, R_ARM, armAngleStartL, armAngleEndL, false);
  // Left inner corner: CW from junction to inner top-left
  g.arc(left + CORNER_R, top + CORNER_R, INNER_R, Math.PI, -Math.PI / 2, false);
  // Inner top wall
  g.lineTo(right - CORNER_R, innerTopY);
  // Right inner corner: CW from inner top-right to right junction
  g.arc(right - CORNER_R, top + CORNER_R, INNER_R, -Math.PI / 2, 0, false);
  // Right arm: CW large-radius arc from junction down to entry
  g.arc(armCenterRX, armTopY, R_ARM, armAngleStartR, armAngleEndR, false);
  g.strokePath();

  // "LOOP" label inside the top channel
  scene.add
    .text((left + right) / 2, innerTopY + ORBIT_W / 2, "LOOP", {
      fontFamily: "Arial Black",
      fontSize: 11,
      color: "#00e5ff99",
    })
    .setOrigin(0.5, 0.5);

  // Entry chevrons pointing into each loop channel
  _chevrons(g, entryLeftX, entryY, -1);
  _chevrons(g, entryRightX, entryY, 1);

  // ── Physics: inner wall ────────────────────────────────────────────────────
  // SVG arc flags: sweep=1 = CW in screen-Y-down coords throughout.
  // Right arm terminates at plungerEntryY because PlungerLane.ts covers
  // x = plungerSep from plungerEntryY downward.
  const R_S = R_ARM.toFixed(3);
  // x-coordinate on the right arm arc at y = plungerEntryY (≈ 663 px,
  // nearly vertical here — only ~3 px from innerRightX).
  const thetaREntry = Math.asin((plungerEntryY - armTopY) / R_ARM);
  const xREntry = (armCenterRX + R_ARM * Math.cos(thetaREntry)).toFixed(1);

  addBodiesFromSvgPath(
    scene,
    `M${entryLeftX},${entryY}` +
      ` A${R_S},${R_S} 0 0,1 ${innerLeftX},${armTopY}` +
      ` A${INNER_R},${INNER_R} 0 0,1 ${left + CORNER_R},${innerTopY}` +
      ` L${right - CORNER_R},${innerTopY}` +
      ` A${INNER_R},${INNER_R} 0 0,1 ${innerRightX},${armTopY}` +
      ` A${R_S},${R_S} 0 0,1 ${xREntry},${plungerEntryY}`
  );

  // ── Scoring sensor ─────────────────────────────────────────────────────────
  // A thin strip centred in the top channel; fires when the ball passes through
  // the highest point of the orbit.
  const sensorX = (left + right) / 2;
  const sensorY = top + ORBIT_W / 2; // vertically centred in the 34 px channel
  const sensorW = right - CORNER_R - (left + CORNER_R); // 310 px
  const sensorBody = scene.matter.add.rectangle(
    sensorX,
    sensorY,
    sensorW,
    BALL_RADIUS * 2,
    {
      isStatic: true,
      isSensor: true,
      label: "loop-sensor",
    }
  );

  // 700 ms cooldown so one pass scores exactly once.
  let cooldown = false;
  type CollisionEvent = {
    pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
  };

  scene.matter.world.on("collisionstart", (event: CollisionEvent) => {
    if (cooldown) return;
    for (const { bodyA, bodyB } of event.pairs) {
      if (
        (bodyA === sensorBody && bodyB.label === "ball") ||
        (bodyB === sensorBody && bodyA.label === "ball")
      ) {
        cooldown = true;
        callbacks.onLoopScore();
        _flash(g, scene);
        scene.time.delayedCall(700, () => {
          cooldown = false;
        });
        break;
      }
    }
  });
}

// ── Private helpers ──────────────────────────────────────────────────────────

/** Two small chevrons just below the opening hint the direction into the channel. */
function _chevrons(
  g: Phaser.GameObjects.Graphics,
  wallX: number,
  entryY: number,
  dir: 1 | -1 // +1 = point rightward (right entry), −1 = leftward (left entry)
): void {
  const SIZE = 7;
  const STEP = 13;
  g.lineStyle(2, LOOP_COLOR, 0.45);
  for (let i = 0; i < 2; i++) {
    const cy = entryY - STEP * (i + 1);
    const tipX = wallX + dir * SIZE;
    g.beginPath();
    g.moveTo(wallX, cy - SIZE);
    g.lineTo(tipX, cy);
    g.lineTo(wallX, cy + SIZE);
    g.strokePath();
  }
}

/** Brief flash on the inner-wall graphics when the loop sensor fires. */
function _flash(g: Phaser.GameObjects.Graphics, scene: Phaser.Scene): void {
  let tick = 0;
  const t = scene.time.addEvent({
    delay: 80,
    repeat: 5,
    callback: () => {
      tick++;
      g.setAlpha(tick % 2 === 0 ? 1 : 0.2);
      if (tick >= 6) {
        g.setAlpha(1);
        t.destroy();
      }
    },
  });
}
