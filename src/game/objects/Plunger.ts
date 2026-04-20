import Phaser from "phaser";
import {
  BASE_DELTA,
  LANE_WIDTH,
  PX_PER_M,
  TARGET_LAUNCH_SPEED_MS,
} from "../layout/constants";

const MAX_CHARGE_MS = 2000;

/**
 * Ball restitution is 0.3 and plunger restitution is 0.0, so the pair's
 * effective coefficient is max(0.3, 0.0) = 0.3.
 *
 * Kept local so it stays next to the derivation below; it must match the
 * value in Ball.ts.
 */
const BALL_RESTITUTION = 0.3;

/**
 * Velocity (px/BASE_DELTA) stored as the plunger body's normalised velocity.
 *
 * --- Why "normalised velocity"? ---
 * Dynamic bodies have `body.deltaTime = stepDelta` (e.g. BASE_DELTA/3 with
 * STEPS=3). When you call `Body.setVelocity(dynamicBody, {y: V})`, Matter.js
 * internally shifts `positionPrev` by `V × (body.deltaTime / BASE_DELTA)` so
 * the raw Verlet displacement per step is `V × (stepDelta/BASE_DELTA)`.
 *
 * Static bodies SKIP `Body.update`, so `body.deltaTime` stays at its default
 * of BASE_DELTA forever. Calling `Body.setVelocity(staticBody, {y: V})` shifts
 * `positionPrev` by `V × 1 = V` — as if the plunger moves V raw pixels per
 * sub-step, REGARDLESS of how large that sub-step is.
 *
 * To compensate, `step()` scales the velocity it sets by
 * `event.delta / BASE_DELTA` at call time, so the raw displacement the
 * resolver sees is `V × (event.delta / BASE_DELTA)` — identical to what a
 * dynamic body normalised velocity V would produce.
 *
 * --- Speed derivation ---
 * After scaling, the ball receives (1 + BALL_RESTITUTION) × MAX_SPEED raw
 * px/step from the impulse. Speed in real units:
 *
 *   speed (m/s) = (1 + e) × MAX_SPEED × (event.delta/BASE_DELTA) × steps/s / PX_PER_M
 *              = (1 + e) × MAX_SPEED × FPS / PX_PER_M     (FPS = 60, STEPS cancel)
 *
 * So for TARGET_LAUNCH_SPEED_MS:
 *
 *   MAX_SPEED = TARGET_LAUNCH_SPEED_MS × PX_PER_M / ((1 + BALL_RESTITUTION) × FPS)
 *             ≈ 3.5 × 1000 / (1.3 × 60) ≈ 44.9 px/BASE_DELTA
 */
const MAX_SPEED =
  (TARGET_LAUNCH_SPEED_MS * PX_PER_M) / ((1 + BALL_RESTITUTION) * 60);

/** Physics body dimensions — full lane width so there's no gap to fall through. */
export const PLUNGER_BODY_W = LANE_WIDTH;
export const PLUNGER_BODY_H = 8;

/** Visual plunger head width (narrower than the physics body). */
const HEAD_W = 22;
/** How far the head pulls back visually at full charge (cosmetic only). */
const MAX_PULLBACK = 40;

const BAR_W = 7;
const BAR_H = 80;

/**
 * The plunger — physics-backed launcher at the bottom of the plunger lane.
 *
 * The static physics body acts as the floor of the lane; the ball rests on it
 * under gravity.  Charging is visual only: the head graphic pulls back while
 * the physics body stays put (so the ball doesn't move during charging).
 * On release, one sub-step's worth of upward surface velocity is applied to
 * the physics body; the collision resolver transfers an impulse to the ball
 * and launches it.  "Launched" state is derived from a sensor body that
 * covers the lane: SPACE is only active while a ball is detected inside.
 */
export class Plunger {
  private readonly scene: Phaser.Scene;
  private readonly physicsBody: MatterJS.BodyType;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly laneX: number;
  private readonly restY: number;
  private readonly barX: number;
  private readonly barBottomY: number;

  /** True while a ball overlaps the lane sensor → SPACE can charge. */
  private ballPresent = true;
  private charging = false;
  private chargeStart = 0;
  /** Speed (px/step) to set on the body for exactly one upcoming sub-step. */
  private pendingSpeed = 0;

  constructor(
    scene: Phaser.Scene,
    laneX: number,
    /** Y of the plunger body centre — also the "zero pullback" position. */
    restY: number,
    /** Top Y of the sensor area (= the lane entry point). */
    sensorTopY: number,
    barX: number,
    barBottomY: number
  ) {
    this.scene = scene;
    this.laneX = laneX;
    this.restY = restY;
    this.barX = barX;
    this.barBottomY = barBottomY;

    // ── Physics body ────────────────────────────────────────────────────────
    // Spans the full lane width so there's no gap between the separator wall
    // (x = laneX - PLUNGER_BODY_W/2) and the right wall (x = laneX + W/2).
    this.physicsBody = scene.matter.add.rectangle(
      laneX,
      restY,
      PLUNGER_BODY_W,
      PLUNGER_BODY_H,
      {
        isStatic: true,
        label: "plunger",
        friction: 0.0,
        restitution: 0.0,
      }
    );

    // ── Sensor ──────────────────────────────────────────────────────────────
    // Covers the lane from the entry point down to the plunger body.
    // Collision events fire whenever the ball enters or leaves this zone,
    // toggling `ballPresent` and therefore enabling/disabling SPACE.
    const sensorH = restY - sensorTopY;
    scene.matter.add.rectangle(
      laneX,
      sensorTopY + sensorH / 2,
      PLUNGER_BODY_W,
      sensorH,
      { isStatic: true, isSensor: true, label: "plunger-sensor" }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scene.matter.world.on("collisionstart", (evt: any) => {
      for (const { bodyA, bodyB } of evt.pairs) {
        if (sensorPairWithBall(bodyA, bodyB)) this.ballPresent = true;
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scene.matter.world.on("collisionend", (evt: any) => {
      for (const { bodyA, bodyB } of evt.pairs) {
        if (sensorPairWithBall(bodyA, bodyB)) this.ballPresent = false;
      }
    });

    // ── Input ───────────────────────────────────────────────────────────────
    const spaceKey = scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    spaceKey.on("down", this.onDown, this);
    spaceKey.on("up", this.onUp, this);

    // ── Step hooks ──────────────────────────────────────────────────────────
    scene.matter.world.on("beforeupdate", this.step, this);
    scene.matter.world.on("afterupdate", this.draw, this);

    this.g = scene.add.graphics();
    this.draw();
  }

  // ── Key handlers ───────────────────────────────────────────────────────────

  private onDown(): void {
    if (!this.ballPresent || this.charging || this.pendingSpeed !== 0) return;
    this.charging = true;
    this.chargeStart = performance.now();
  }

  private onUp(): void {
    if (!this.charging) return;
    this.charging = false;
    const charge = Math.min(
      (performance.now() - this.chargeStart) / MAX_CHARGE_MS,
      1
    );

    // Store the speed; applied in the very next beforeupdate call.
    this.pendingSpeed = charge * MAX_SPEED;
  }

  // ── Physics ────────────────────────────────────────────────────────────────

  private step(event: { delta: number }): void {
    const { body } = this.scene.matter;
    if (this.pendingSpeed !== 0) {
      // Scale by event.delta/BASE_DELTA to compensate for the static body's
      // timeScale = 1 in Body.setVelocity (see MAX_SPEED comment above).
      const scale = event.delta / BASE_DELTA;
      body.setVelocity(this.physicsBody, {
        x: 0,
        y: -this.pendingSpeed * scale,
      });
      body.setAngularVelocity(this.physicsBody, 0);
      this.pendingSpeed = 0;
    } else {
      // Keep the static body truly stationary so a resting ball isn't disturbed.
      body.setVelocity(this.physicsBody, { x: 0, y: 0 });
      body.setAngularVelocity(this.physicsBody, 0);
    }
  }

  // ── Visual ─────────────────────────────────────────────────────────────────

  private draw(): void {
    this.g.clear();

    const charge = this.charging
      ? Math.min((performance.now() - this.chargeStart) / MAX_CHARGE_MS, 1)
      : 0;

    // Head pulls back (downward) as charge builds; ball stays stationary above.
    const headCY = this.restY + charge * MAX_PULLBACK;

    // Rod below the head (follows the head downward during charge)
    this.g.fillStyle(0x555555, 1);
    this.g.fillRect(this.laneX - 3, headCY + PLUNGER_BODY_H / 2, 6, 22);

    // Plunger head
    this.g.fillStyle(0xbbbbbb, 1);
    this.g.fillRoundedRect(
      this.laneX - HEAD_W / 2,
      headCY - PLUNGER_BODY_H / 2,
      HEAD_W,
      PLUNGER_BODY_H,
      3
    );

    if (charge <= 0) return;

    // Charge bar (outside the right table wall)
    this.g.fillStyle(0x222222, 0.9);
    this.g.fillRect(this.barX, this.barBottomY - BAR_H, BAR_W, BAR_H);

    const fillH = charge * BAR_H;
    this.g.fillStyle(chargeColor(charge), 1);
    this.g.fillRect(this.barX, this.barBottomY - fillH, BAR_W, fillH);
  }
}

function sensorPairWithBall(
  bodyA: MatterJS.BodyType,
  bodyB: MatterJS.BodyType
): boolean {
  return (
    (bodyA.label === "plunger-sensor" && bodyB.label === "ball") ||
    (bodyB.label === "plunger-sensor" && bodyA.label === "ball")
  );
}

/** Green → yellow → red gradient for the charge bar. */
function chargeColor(t: number): number {
  const r = t <= 0.5 ? Math.round(t * 2 * 255) : 255;
  const g = t <= 0.5 ? 200 : Math.round(200 * (1 - (t - 0.5) * 2));
  return (r << 16) | (g << 8);
}
