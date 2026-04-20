import { Scene } from "phaser";
import { Ball, BALL_RADIUS } from "../objects/Ball";
import { Flipper } from "../objects/Flipper";
import { sweptCircleVsConvex, sweptConvexVsCircle } from "../utils/ccd";
import {
  BASE_DELTA,
  FLIPPER_RESTITUTION,
  WALL_RESTITUTION,
} from "../layout/constants";

/**
 * Continuous Collision Detection handler.
 *
 * Encapsulates the two CCD passes that were previously inline methods of the
 * Game scene:
 *
 *  1. Wall CCD pre-pass — predicts the ball's full displacement for the
 *     upcoming step, detects the earliest wall contact via swept-circle SAT,
 *     and if a hit is found teleports the ball to the contact surface and
 *     applies an elastic reflection.
 *
 *  2. Flipper CCD — when no wall contact occurred, checks both rotating
 *     flippers for an overlap, binary-searches for the exact contact time,
 *     computes the flipper surface velocity at the impact point, and applies
 *     the correct launch impulse.
 *
 * Register the handler's `handle` method as a `beforeupdate` listener on the
 * Matter world AFTER all other objects (especially flippers) have registered
 * their own listeners, so it always sees final flipper positions.
 */
export class CcdHandler {
  private wallBodies: MatterJS.BodyType[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly flippers: readonly [Flipper, Flipper],
    private readonly getBall: () => Ball | null,
    private readonly isQueuedDrain: () => boolean
  ) {}

  /** Call once after scene setup to supply the static wall bodies for CCD. */
  setWallBodies(bodies: MatterJS.BodyType[]): void {
    this.wallBodies = bodies;
  }

  /**
   * The `beforeupdate` callback. Arrow function so it can be passed directly
   * to `matter.world.on()` without binding.
   */
  handle = (event: { delta: number }): void => {
    if (this.isQueuedDrain()) return;
    const ball = this.getBall();
    if (!ball) return;

    const stepDelta = event.delta;
    const body = ball.physicsBody;

    // Convert normalised velocity → raw pixels this step.
    // Body.update uses: disp = normalised_vel × (stepDelta / baseDelta)
    const scale = stepDelta / BASE_DELTA;

    // Gravity contribution (px) for this step.
    // Engine applies: force.y += mass × gravity.y × gravityScale (= 0.001)
    // Body.update: vel.y += force.y / mass × dt²  →  += 0.001 × dt²
    const gravY = 0.001 * stepDelta * stepDelta;
    const gravVelY = gravY / scale;

    let stepVx = body.velocity.x;
    let stepVy = body.velocity.y + gravVelY;
    let cx = body.position.x;
    let cy = body.position.y;
    let hitAny = false;

    // Iterative CCD: handle up to 3 wall bounces within a single step.
    let rem = 1.0;
    for (let iter = 0; iter < 3 && rem > 1e-4; iter++) {
      const ddx = stepVx * scale;
      const ddy = stepVy * scale;

      let earliest: ReturnType<typeof sweptCircleVsConvex> = null;
      for (const wb of this.wallBodies) {
        if (!wb.vertices || wb.vertices.length < 3) continue;
        const h = sweptCircleVsConvex(
          cx,
          cy,
          ddx * rem,
          ddy * rem,
          BALL_RADIUS,
          wb.vertices
        );
        if (h && (!earliest || h.t < earliest.t)) earliest = h;
      }

      if (!earliest) break;

      // Move ball to just before the contact point.
      const safeT = earliest.t * (1 - 1e-4);
      cx += ddx * rem * safeT;
      cy += ddy * rem * safeT;

      // Reflect the step's motion vector across the contact normal.
      const relVelN = stepVx * earliest.nx + stepVy * earliest.ny;
      if (relVelN < 0) {
        stepVx -= (1 + WALL_RESTITUTION) * relVelN * earliest.nx;
        stepVy -= (1 + WALL_RESTITUTION) * relVelN * earliest.ny;
      }

      rem *= 1 - earliest.t;
      hitAny = true;
    }

    if (hitAny) {
      // Compute the correct end-of-step position: contact point + remaining
      // post-bounce travel (fraction `rem` of the step still left).
      const finalX = cx + stepVx * scale * rem;
      const finalY = cy + stepVy * scale * rem;
      const rawVx = stepVx;
      const rawVy = stepVy - gravVelY;

      // Pre-position the ball one full velocity-step behind finalPos so that
      // when Matter.js advances it by (v * scale + gravY) it lands exactly on
      // finalPos. This avoids double-displacement where the old code placed the
      // ball at the contact point and Matter then added a full extra step.
      this.scene.matter.body.setPosition(body, {
        x: finalX - rawVx * scale,
        y: finalY - (rawVy * scale + gravY),
      });
      this.scene.matter.body.setVelocity(body, { x: rawVx, y: rawVy });
      return; // wall contact handled; skip flipper CCD this step
    }

    // No wall contact this step — check whether a sweeping flipper hits the ball.
    this.applyFlipperCcd(body, scale, gravVelY, gravY);
  };

  /**
   * Swept-flipper CCD.
   *
   * Checks both flippers for a rotating-polygon vs ball-circle contact this
   * step. Takes the earliest contact, computes the exact surface velocity of
   * the flipper at the impact point, and applies a physically correct impulse
   * + position rewind so Matter sees a ball already moving away — preventing
   * double-impulse from the engine.
   */
  private applyFlipperCcd(
    body: MatterJS.BodyType,
    scale: number,
    gravVelY: number,
    gravY: number
  ): void {
    type FlipperHit = {
      t: number;
      nx: number;
      ny: number;
      flipper: Flipper;
    };

    let earliest: FlipperHit | null = null;
    for (const flipper of this.flippers) {
      if (Math.abs(flipper.currentAngle - flipper.prevAngle) < 1e-7) continue;

      const hit = sweptConvexVsCircle(
        body.position.x,
        body.position.y,
        BALL_RADIUS,
        flipper.pivotWorldX,
        flipper.pivotWorldY,
        flipper.prevAngle,
        flipper.currentAngle,
        flipper.localVertices
      );
      if (hit && (!earliest || hit.t < earliest.t)) {
        earliest = { ...hit, flipper };
      }
    }

    if (!earliest) return;

    // Angular displacement this step (radians, signed).
    const ω = earliest.flipper.currentAngle - earliest.flipper.prevAngle;

    // Contact point on the flipper surface = ball center – normal * radius.
    const contactX = body.position.x - earliest.nx * BALL_RADIUS;
    const contactY = body.position.y - earliest.ny * BALL_RADIUS;

    // Flipper surface velocity at the contact point:  v = ω × r  (2D: ω·(-ry, rx))
    const rx = contactX - earliest.flipper.pivotWorldX;
    const ry = contactY - earliest.flipper.pivotWorldY;
    const vSurfX = -ω * ry;
    const vSurfY = ω * rx;

    // Ball velocity with gravity already included (mirrors wall CCD convention).
    const vBallX = body.velocity.x;
    const vBallY = body.velocity.y + gravVelY;

    // Relative velocity of ball w.r.t. flipper surface along the contact normal.
    const relVn =
      (vBallX - vSurfX) * earliest.nx + (vBallY - vSurfY) * earliest.ny;

    if (relVn >= 0) return; // ball already moving away from the surface

    // Impulse magnitude: reverse the relative normal velocity with restitution.
    const impulse = -(1 + FLIPPER_RESTITUTION) * relVn;
    const newVx = vBallX + impulse * earliest.nx;
    const newVy = vBallY + impulse * earliest.ny;

    // Rewind the ball's position so Matter advances it to the correct final spot.
    // finalPos = ball.pos + newVel * scale * (1 - t)   [remaining fraction of step]
    // rewindPos = finalPos − newVel * scale             [minus a full step so Matter lands there]
    const rem = 1 - earliest.t;
    const finalX = body.position.x + newVx * scale * rem;
    const finalY = body.position.y + newVy * scale * rem;
    const rawVy = newVy - gravVelY;

    this.scene.matter.body.setPosition(body, {
      x: finalX - newVx * scale,
      y: finalY - (rawVy * scale + gravY),
    });
    this.scene.matter.body.setVelocity(body, { x: newVx, y: rawVy });
  }
}
