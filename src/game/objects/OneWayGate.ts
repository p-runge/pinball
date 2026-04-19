import Phaser from "phaser";
import { Ball } from "./Ball";

const WALL_T = 8;

/**
 * A one-way gate wall, placeable at any angle (like `addSeg`).
 *
 * The gate is defined by two endpoints `(x1,y1)` → `(x2,y2)`.  The
 * `passSign` parameter controls which side the ball may cross **from**:
 *
 *   +1  – ball may enter from the side where the signed cross product
 *          `(x2−x1)·(by−y1) − (y2−y1)·(bx−x1)` is **positive**.
 *          (This is the left side when looking from p1 toward p2, with
 *           screen-coordinates Y-down: i.e. the CCW normal side.)
 *
 *   −1  – ball may enter from the opposite (right / CW) side.
 *
 * Internally the `isSensor` flag is toggled on every `beforeupdate`:
 *   ball on **entry** side  → sensor  (passes through freely)
 *   ball on **blocking** side → solid  (normal wall collision)
 *
 * The gate is deliberately NOT labelled "wall" so the CCD pre-pass ignores
 * it; ball speeds near the plunger-lane entry are low enough that tunnelling
 * is not a concern.
 */
export class OneWayGate {
  private readonly body: MatterJS.BodyType;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly getBall: () => Ball | null;

  /** Cached wall vector components (reused every step). */
  private readonly x1: number;
  private readonly y1: number;
  private readonly dx: number;
  private readonly dy: number;
  private readonly passSign: number;

  /**
   * @param scene     Active Phaser scene.
   * @param x1,y1     First endpoint of the gate wall.
   * @param x2,y2     Second endpoint of the gate wall.
   * @param passSign  +1 or −1 — see class doc for the convention.
   * @param getBall   Returns the live ball (handles respawns gracefully).
   */
  constructor(
    scene: Phaser.Scene,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    passSign: 1 | -1,
    getBall: () => Ball | null
  ) {
    this.getBall = getBall;
    this.x1 = x1;
    this.y1 = y1;
    this.dx = x2 - x1;
    this.dy = y2 - y1;
    this.passSign = passSign;

    const len = Math.hypot(this.dx, this.dy);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const angle = Math.atan2(this.dy, this.dx);

    // Physics body — thin rectangle at the same position/angle as the wall
    // segment produced by addSeg().  Starts solid; toggled to sensor each step
    // when the ball is on the entry side.
    this.body = scene.matter.add.rectangle(cx, cy, len, WALL_T, {
      isStatic: true,
      isSensor: false,
      label: "one-way-gate",
      angle,
      friction: 0,
      restitution: 0.3,
    });

    this.g = scene.add.graphics();
    this.draw(x1, y1, x2, y2, len, passSign);

    scene.matter.world.on("beforeupdate", this.update, this);
  }

  // ── Physics update ──────────────────────────────────────────────────────────

  private update(): void {
    const ball = this.getBall();
    if (!ball) return;

    const bx = ball.physicsBody.position.x;
    const by = ball.physicsBody.position.y;

    // Signed cross product: positive when ball is on the CCW-normal side of
    // the wall direction.  When its sign matches passSign the ball is on the
    // entry (allowed) side → make the gate transparent.
    const cross = this.dx * (by - this.y1) - this.dy * (bx - this.x1);
    this.body.isSensor = cross * this.passSign > 0;
  }

  // ── Visual ──────────────────────────────────────────────────────────────────

  private draw(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    len: number,
    passSign: number
  ): void {
    const g = this.g;
    const dx = x2 - x1;
    const dy = y2 - y1;

    // Unit vectors — along the wall (ux,uy) and toward the blocking side (bnx,bny).
    // passSign=+1 → entry on CCW side → blocking on CW side → (dy/len, -dx/len)
    // passSign=−1 → entry on CW side  → blocking on CCW side → (-dy/len, dx/len)
    const ux = dx / len;
    const uy = dy / len;
    const bnx = (passSign * dy) / len; // blocking-side normal, x
    const bny = (-passSign * dx) / len; // blocking-side normal, y

    // Gate wall line
    g.lineStyle(3, 0x00e5ff, 1);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();

    // Chevrons on the blocking side pointing in the allowed direction.
    // Each chevron's tip points away from the gate (deeper into blocking side);
    // its arms spread back toward the gate, hinting "entry from this side: no".
    const CHEVRON_SIZE = 7;
    const CHEVRON_GAP = 11;
    const NUM_CHEVRONS = 3;

    g.lineStyle(2, 0x00e5ff, 0.6);

    for (let i = 0; i < NUM_CHEVRONS; i++) {
      const t = (i + 1) / (NUM_CHEVRONS + 1);
      // Point along the gate face
      const wx = x1 + t * dx;
      const wy = y1 + t * dy;
      // Tip: offset toward blocking side
      const tipX = wx + bnx * CHEVRON_GAP;
      const tipY = wy + bny * CHEVRON_GAP;
      // Arms: spread along the wall, pulled back toward the gate face
      const arm1X = tipX + ux * CHEVRON_SIZE - bnx * CHEVRON_SIZE;
      const arm1Y = tipY + uy * CHEVRON_SIZE - bny * CHEVRON_SIZE;
      const arm2X = tipX - ux * CHEVRON_SIZE - bnx * CHEVRON_SIZE;
      const arm2Y = tipY - uy * CHEVRON_SIZE - bny * CHEVRON_SIZE;

      g.beginPath();
      g.moveTo(arm1X, arm1Y);
      g.lineTo(tipX, tipY);
      g.lineTo(arm2X, arm2Y);
      g.strokePath();
    }
  }
}
