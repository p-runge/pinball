import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { Ball, BALL_RADIUS } from "../objects/Ball";
import { Bumper } from "../objects/Bumper";
import { Flipper } from "../objects/Flipper";
import { Plunger, PLUNGER_BODY_H } from "../objects/Plunger";
import { Slingshot } from "../objects/Slingshot";
import { sweptCircleVsConvex, sweptConvexVsCircle } from "../utils/ccd";
import { addBodiesFromSvgPath } from "../utils/svgPhysics";

// Thickness used for all straight wall segments (and the minimum across curved
// ones).
const WALL_T = 4;
const TOTAL_BALLS = 3;
const TABLE_W = 420;

// Fixed number of physics sub-steps per render frame.  Three steps gives smooth
// simulation; tunnelling is prevented by CCD rather than step count.
const STEPS = 3;

// Matter.js default base delta (ms) used for velocity normalisation.
const BASE_DELTA = 1000 / 60; // 16.667 ms

// Restitution to apply in CCD bounces — must match the wall bodies' restitution.
const WALL_RESTITUTION = 0.3;
// Restitution for flipper CCD contacts.  Higher than walls for a lively feel.
const FLIPPER_RESTITUTION = 0.5;

type CollisionEvent = {
  pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
};

export class Game extends Scene {
  private leftFlipper!: Flipper;
  private rightFlipper!: Flipper;
  private ball!: Ball;
  private ballsText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  /** Static wall bodies checked each step by the CCD pre-pass. */
  private wallBodies: MatterJS.BodyType[] = [];
  /** Delta (ms) of the current sub-step — shared with the CCD handler. */
  private currentStepDelta = BASE_DELTA / STEPS;
  private ballSpawnX = 0;
  private ballSpawnY = 0;
  private ballsLeft = TOTAL_BALLS;
  private drainQueued = false;
  private score = 0;

  constructor() {
    super("Game");
  }

  create() {
    this.ballsLeft = TOTAL_BALLS;
    this.drainQueued = false;
    this.score = 0;

    const { width, height } = this.scale;

    // Table boundaries
    const left = (width - TABLE_W) / 2;
    const right = left + TABLE_W;
    const top = 20;
    const bottom = height - 20;

    // Plunger lane (right side)
    const plungerSep = right - 36; // separator between playfield and plunger lane
    const plungerEntryY = 200; // where ball can enter playfield from plunger lane

    // Y at which the lower channel zone begins
    const gutterY = bottom - 200;

    // Flipper pivot X positions — moved 6 px inward from the outer walls to
    // narrow the central gap slightly (was left+90 / plungerSep-90).
    const gutterInnerLeft = left + 96;
    const gutterInnerRight = plungerSep - 96;

    // Flipper pivot points (outer ends, fixed to the gutter walls)
    const flipperY = bottom - 60;

    // ── Lower-zone geometry ─────────────────────────────────────────────────
    // Each channel wall runs vertically, then transitions via a 60° arc to the
    // flipper rest angle (30° below horizontal), then a straight wall at that
    // same angle leads directly to the flipper pivot.
    //
    // Arc geometry (left side):
    //   Center at (leftWallX + R, arcStartY).  Sweeps CCW from θ=180° (start,
    //   tangent=downward) to θ=120° (end, tangent=30° below horizontal).
    //   End point: (leftWallX + R/2, arcStartY + R·√3/2)
    //
    // Tangent constraint — for the straight wall from arc end to reach the
    // flipper pivot at 30°:  arcStartY = flipperY − (D + R) / √3
    //   where D = gutterInnerLeft − leftWallX (horizontal distance wall→pivot)
    const LANE_WALL_OFFSET = 36; // px from the outer wall to the channel wall
    const LOWER_CORNER_R = 30; // arc radius; controls how "tight" the curve is

    // World-space X of the channel wall on each side
    const leftWallX = left + LANE_WALL_OFFSET;
    const rightWallX = plungerSep - LANE_WALL_OFFSET;

    // Horizontal distance from channel wall to flipper pivot (same on both sides)
    const laneD = gutterInnerLeft - leftWallX;

    // Y where the vertical channel wall ends and the arc begins
    const arcStartY = flipperY - (laneD + LOWER_CORNER_R) / Math.sqrt(3);

    // Arc end-point offsets (R·cos60°, R·sin60°), mirrored on X for right side
    const arcEndDx = LOWER_CORNER_R / 2;
    const arcEndDy = (LOWER_CORNER_R * Math.sqrt(3)) / 2;

    const CORNER_R = 60; // radius of the top-corner inlay arcs

    // ── Graphics ────────────────────────────────────────────────────────────
    const g = this.add.graphics();
    g.lineStyle(3, 0xcccccc, 1);

    // Outer table border with concave top corners.
    // The two quarter-circle arcs are centred INSIDE the playfield at
    // (left+CORNER_R, top+CORNER_R) and (right-CORNER_R, top+CORNER_R).
    // This means their concave (inner) face points toward the playfield, so
    // the ball is guided smoothly around each corner rather than bouncing off
    // a convex bump.
    g.beginPath();
    g.moveTo(left, top + CORNER_R); // start at left wall, bottom of top-left arc
    // Top-left concave arc from the left wall up into the top wall.
    g.arc(
      left + CORNER_R,
      top + CORNER_R,
      CORNER_R,
      Math.PI,
      -Math.PI / 2,
      false
    );
    g.lineTo(right - CORNER_R, top); // top wall
    // Top-right concave arc from the top wall down into the right wall.
    g.arc(right - CORNER_R, top + CORNER_R, CORNER_R, -Math.PI / 2, 0, false);
    g.lineTo(right, bottom); // right wall
    g.strokePath();

    g.beginPath();
    g.moveTo(left, top + CORNER_R);
    g.lineTo(left, bottom); // left wall
    g.strokePath();

    // Plunger lane separator (runs from entry point to the bottom)
    g.beginPath();
    g.moveTo(plungerSep, plungerEntryY);
    g.lineTo(plungerSep, bottom);
    g.strokePath();

    // Entry arch from plunger lane into playfield (small horizontal connector)
    g.beginPath();
    g.moveTo(plungerSep, plungerEntryY);
    g.lineTo(right, plungerEntryY);
    g.strokePath();

    // ── Left channel wall + 60° arc + angled connector ──────────────────────
    g.beginPath();
    g.moveTo(leftWallX, gutterY);
    // Vertical wall from gutterY down to the arc start
    g.lineTo(leftWallX, arcStartY);
    // 60° CCW arc: center at (leftWallX+R, arcStartY), from θ=180° to θ=120°.
    // End tangent matches the flipper rest angle (30° below horizontal).
    g.arc(
      leftWallX + LOWER_CORNER_R,
      arcStartY,
      LOWER_CORNER_R,
      Math.PI, // θ=180°: start = (leftWallX, arcStartY)
      (2 * Math.PI) / 3, // θ=120°: end tangent = 30° below horizontal
      true // anticlockwise = decreasing angle
    );
    // Straight wall at 30° slope from arc end to left flipper pivot
    g.lineTo(gutterInnerLeft, flipperY);
    g.strokePath();

    // ── Right channel wall + 60° arc + angled connector ─────────────────────
    g.beginPath();
    g.moveTo(rightWallX, gutterY);
    g.lineTo(rightWallX, arcStartY);
    // 60° CW arc: center at (rightWallX-R, arcStartY), from θ=0° to θ=60°.
    g.arc(
      rightWallX - LOWER_CORNER_R,
      arcStartY,
      LOWER_CORNER_R,
      0, // θ=0°: start = (rightWallX, arcStartY)
      Math.PI / 3, // θ=60°: end tangent = 30° below horizontal (mirrored)
      false // clockwise = increasing angle
    );
    // Straight wall at 30° slope from arc end to right flipper pivot
    g.lineTo(gutterInnerRight, flipperY);
    g.strokePath();

    // ── Physics ─────────────────────────────────────────────────────────────

    // Add a static segment body between two world-space points.
    const addSeg = (x1: number, y1: number, x2: number, y2: number) => {
      this.matter.add.rectangle(
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        Math.hypot(x2 - x1, y2 - y1),
        WALL_T,
        {
          isStatic: true,
          angle: Math.atan2(y2 - y1, x2 - x1),
          label: "wall",
          friction: 0.0,
          restitution: 0.3,
        }
      );
    };

    // Outer border — straight walls trimmed to the arc endpoints so the
    // geometry is seamless with the concave corner inlays below.
    addSeg(left + CORNER_R, top, right - CORNER_R, top); // top (between inlays)
    addSeg(left, top + CORNER_R, left, bottom); // left (below inlay)
    addSeg(right, top + CORNER_R, right, bottom); // right (below inlay)

    // Top corner inlays — concave quarter-circle arcs whose centre of
    // curvature sits INSIDE the playfield.  A ball approaching the corner
    // from the playfield is therefore on the concave (inner) side of the arc
    // and is guided smoothly around rather than bounced off a convex bump.
    //
    // SVG arc: sweep-flag=0 → counterclockwise, which produces a centre at
    // (right-CORNER_R, top+CORNER_R) and (left+CORNER_R, top+CORNER_R).
    addBodiesFromSvgPath(
      this,
      // Top-right: from the right wall counterclockwise to the top wall.
      `M${right},${top + CORNER_R} A${CORNER_R},${CORNER_R} 0 0,0 ${right - CORNER_R},${top}`
    );
    addBodiesFromSvgPath(
      this,
      // Top-left: from the top wall counterclockwise to the left wall.
      `M${left + CORNER_R},${top} A${CORNER_R},${CORNER_R} 0 0,0 ${left},${top + CORNER_R}`
    );

    // Plunger lane separator
    addSeg(plungerSep, plungerEntryY, plungerSep, bottom);

    // ── Lower-zone physics ───────────────────────────────────────────────────
    // Left: vertical wall → 60° CCW arc → 30°-angled wall to pivot
    addSeg(leftWallX, gutterY, leftWallX, arcStartY);
    addBodiesFromSvgPath(
      this,
      // sweep-flag=0 (CCW): from (leftWallX, arcStartY) to arc end at 120°
      `M${leftWallX},${arcStartY} A${LOWER_CORNER_R},${LOWER_CORNER_R} 0 0,0 ${leftWallX + arcEndDx},${arcStartY + arcEndDy}`
    );
    addSeg(
      leftWallX + arcEndDx,
      arcStartY + arcEndDy,
      gutterInnerLeft,
      flipperY
    );

    // Right: vertical wall → 60° CW arc → 30°-angled wall to pivot
    addSeg(rightWallX, gutterY, rightWallX, arcStartY);
    addBodiesFromSvgPath(
      this,
      // sweep-flag=1 (CW): from (rightWallX, arcStartY) to arc end at 60°
      `M${rightWallX},${arcStartY} A${LOWER_CORNER_R},${LOWER_CORNER_R} 0 0,1 ${rightWallX - arcEndDx},${arcStartY + arcEndDy}`
    );
    addSeg(
      rightWallX - arcEndDx,
      arcStartY + arcEndDy,
      gutterInnerRight,
      flipperY
    );

    // ── Game objects ─────────────────────────────────────────────────────────

    // Flippers
    this.leftFlipper = new Flipper(this, gutterInnerLeft, flipperY, "left");
    this.rightFlipper = new Flipper(this, gutterInnerRight, flipperY, "right");

    // Slingshot bumpers — triangular kickers just above the gutter diagonals,
    // flush against the side walls.  Only the inner hypotenuse face is active.
    const slingshotW = 60;
    const slingshotH = 140;
    const onSlingshotHit = () => this.addScore(50);
    new Slingshot(
      this,
      leftWallX + 36,
      gutterY + slingshotH - 40,
      "left",
      slingshotW,
      slingshotH,
      onSlingshotHit
    );
    new Slingshot(
      this,
      rightWallX - 36,
      gutterY + slingshotH - 40,
      "right",
      slingshotW,
      slingshotH,
      onSlingshotHit
    );

    const bumperCenterX = (left + plungerSep) / 2;
    const bumperTopY = top + 220;
    const bumperDx = 42;
    const bumperDy = 68;
    const onBumperHit = () => this.addScore(100);
    new Bumper(this, bumperCenterX - bumperDx, bumperTopY, onBumperHit);
    new Bumper(this, bumperCenterX + bumperDx, bumperTopY, onBumperHit);
    new Bumper(this, bumperCenterX, bumperTopY + bumperDy, onBumperHit);

    // Plunger lane setup.
    // The plunger body (full lane width) acts as the floor of the lane so the
    // ball rests on it and is launched by it through physics collision.
    // restY: plunger centre flush with the table bottom (head top = bottom - BODY_H/2).
    const laneX = (plungerSep + right) / 2; // horizontal centre of the lane
    const plungerRestY = bottom - PLUNGER_BODY_H / 2;

    // Ball spawns on the plunger surface: centre = restY - half-body - ball-radius.
    this.ballSpawnX = laneX;
    this.ballSpawnY = plungerRestY - PLUNGER_BODY_H / 2 - BALL_RADIUS;
    this.spawnBall();

    // Plunger: sensor covers the lane from the entry point down to the body.
    // The charge bar is rendered just outside the right table wall.
    new Plunger(
      this,
      laneX,
      plungerRestY,
      plungerEntryY, // top of sensor = lane entry
      right + 32, // charge bar X
      bottom - 10 // charge bar bottom Y
    );

    // Drain sensor just below the table opening. Falling through it consumes
    // the current ball without affecting the wall CCD system.
    this.matter.add.rectangle(
      (left + right) / 2,
      bottom + BALL_RADIUS + 24,
      right - left,
      48,
      { isStatic: true, isSensor: true, label: "drain-sensor" }
    );

    this.add
      .text(right + 24, top + 10, "BALLS", {
        fontFamily: "Arial Black",
        fontSize: 14,
        color: "#aaaaaa",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0, 0);

    this.ballsText = this.add
      .text(right + 24, top + 28, "", {
        fontFamily: "Arial Black",
        fontSize: 26,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0, 0);
    this.updateBallsText();

    this.add
      .text(right + 24, top + 70, "SCORE", {
        fontFamily: "Arial Black",
        fontSize: 14,
        color: "#aaaaaa",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0, 0);

    this.scoreText = this.add
      .text(right + 24, top + 88, "", {
        fontFamily: "Arial Black",
        fontSize: 26,
        color: "#ffd54f",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0, 0);
    this.updateScoreText();

    // Keyboard controls — key events fire immediately on press/release,
    // before the next update() frame, giving instant flipper response.
    const leftKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.LEFT
    );
    const rightKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.RIGHT
    );

    leftKey.on("down", () => this.leftFlipper.activate());
    leftKey.on("up", () => this.leftFlipper.deactivate());
    rightKey.on("down", () => this.rightFlipper.activate());
    rightKey.on("up", () => this.rightFlipper.deactivate());

    // Disable automatic per-frame physics step so we can sub-step manually.
    this.matter.world.autoUpdate = false;

    // Collect all static, non-sensor wall bodies for the CCD pre-pass.
    // Flipper and plunger bodies are deliberately excluded: their collisions are
    // handled entirely by Matter.js so the correct launch impulse is applied.
    this.wallBodies = this.matter.world
      .getAllBodies()
      .filter((b) => b.isStatic && !b.isSensor && b.label === "wall");

    // Register the CCD handler *after* all objects (incl. flippers) have
    // registered their own beforeupdate listeners, so it always fires last and
    // sees the final flipper positions for that step.
    this.matter.world.on("beforeupdate", this.ccdPrePass, this);
    this.matter.world.on("collisionstart", this.onCollisionStart, this);

    EventBus.emit("current-scene-ready", this);
  }

  private spawnBall(): void {
    this.ball = new Ball(this, this.ballSpawnX, this.ballSpawnY);
  }

  private addScore(points: number): void {
    this.score += points;
    this.updateScoreText();
  }

  private updateBallsText(): void {
    this.ballsText.setText(this.ballsLeft.toLocaleString());
  }

  private updateScoreText(): void {
    this.scoreText.setText(this.score.toLocaleString());
  }

  private onCollisionStart(event: CollisionEvent): void {
    for (const { bodyA, bodyB } of event.pairs) {
      if (this.isDrainPair(bodyA, bodyB)) {
        this.queueBallDrain();
        break;
      }
    }
  }

  private isDrainPair(
    bodyA: MatterJS.BodyType,
    bodyB: MatterJS.BodyType
  ): boolean {
    return (
      (bodyA.label === "drain-sensor" && bodyB.label === "ball") ||
      (bodyB.label === "drain-sensor" && bodyA.label === "ball")
    );
  }

  private queueBallDrain(): void {
    if (this.drainQueued) return;

    this.drainQueued = true;
    this.time.delayedCall(0, () => {
      this.ball.destroy();
      this.ballsLeft -= 1;
      this.updateBallsText();

      if (this.ballsLeft <= 0) {
        this.scene.start("GameOver", { score: this.score });
        return;
      }

      this.spawnBall();
      this.drainQueued = false;
    });
  }

  /**
   * CCD pre-pass — runs before every Matter.js sub-step.
   *
   * Predicts the ball's full displacement for the upcoming step using its
   * current normalised velocity plus the gravity contribution.  If the swept
   * circle intersects any wall body before completing that displacement, the
   * ball is teleported to the contact surface and its velocity is reflected
   * across the contact normal (elastic bounce with WALL_RESTITUTION).
   *
   * Up to three reflections are handled per step for cases where the ball
   * would bounce between two walls (rare but theoretically possible at
   * extreme speeds).
   *
   * Why this works instead of a speed cap:
   *   A speed cap clips the velocity AFTER the fact and can fight Matter.js's
   *   own impulse solver, leaving the ball oscillating against a wall
   *   (sticking).  The CCD pre-pass intercepts the ball BEFORE the step,
   *   ensures it never penetrates a wall, and lets Matter.js run on a
   *   configuration that needs no further correction.
   */
  private ccdPrePass(event: { delta: number }): void {
    if (this.drainQueued) return;

    const stepDelta = event.delta; // ms for this sub-step
    const body = this.ball.physicsBody;

    // Convert normalised velocity → raw pixels this step.
    // Body.update uses: disp = normalised_vel × (stepDelta / baseDelta)
    const scale = stepDelta / BASE_DELTA;

    // Gravity contribution (px) for this step.
    // Engine applies: force.y += mass × gravity.y × gravityScale (= 0.001)
    // Body.update: vel.y += force.y / mass × dt²  →  += 0.001 × dt²
    const gravY = 0.001 * stepDelta * stepDelta;
    const gravVelY = gravY / scale;

    // Matter applies gravity before advancing the body, so the actual motion
    // this step follows the post-gravity velocity vector.
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
        // Wall bodies are single-part rectangles; parts[0] == the body itself.
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

      // Reflect the step's actual motion vector across the contact normal.
      const relVelN = stepVx * earliest.nx + stepVy * earliest.ny;
      if (relVelN < 0) {
        // Ball moving toward surface — apply restitution
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

      // Pre-position the ball one full velocity-step *behind* finalPos so that
      // when Matter.js advances it by (v * scale + gravY) it lands exactly on
      // finalPos. This avoids the double-displacement where the old code placed
      // the ball at the contact point and Matter.js then added a full extra step.
      // Because the reflected velocity points away from every wall we bounced off,
      // the brief sub-pixel overlap with a wall surface does not trigger a second
      // impulse from Matter.js (relVelN > 0 → no impulse applied).
      this.matter.body.setPosition(body, {
        x: finalX - rawVx * scale,
        y: finalY - (rawVy * scale + gravY),
      });
      this.matter.body.setVelocity(body, { x: rawVx, y: rawVy });
      return; // wall contact handled; skip flipper CCD this step
    }

    // No wall contact this step — check whether a sweeping flipper hits the ball.
    // Each flipper records prevAngle (before its step) and currentAngle (after).
    // We binary-search for the exact fractional contact time, then compute the
    // flipper's surface velocity at the contact point and apply the impulse.
    this.applyFlipperCcd(body, scale, gravVelY, gravY);
  }

  /**
   * Swept-flipper CCD.
   *
   * Checks both flippers for a rotating-polygon vs ball-circle contact this step.
   * Takes the earliest contact (both flippers could theoretically contact in the
   * same step), computes the exact surface velocity of the flipper at the impact
   * point, and applies a physically correct impulse + position rewind so Matter
   * sees a ball already moving away — preventing double-impulse from the engine.
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
    for (const flipper of [this.leftFlipper, this.rightFlipper]) {
      // Skip if the flipper didn't move this step.
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

    // If the ball is already moving away from the surface, nothing to do.
    if (relVn >= 0) return;

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
    const rawVy = newVy - gravVelY; // store without gravity; Matter re-adds it

    this.matter.body.setPosition(body, {
      x: finalX - newVx * scale,
      y: finalY - (rawVy * scale + gravY),
    });
    this.matter.body.setVelocity(body, { x: newVx, y: rawVy });
  }

  update(_time: number, delta: number): void {
    // Cap delta so a long pause (e.g. tab switch) doesn't produce a giant step.
    const dt = Math.min(delta, 33);
    this.currentStepDelta = dt / STEPS;
    for (let i = 0; i < STEPS; i++) {
      this.matter.world.step(this.currentStepDelta);
    }
  }
}
