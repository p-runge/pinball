import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { Ball } from "../objects/Ball";
import { Flipper } from "../objects/Flipper";
import { STEPS } from "../layout/constants";
import { computeTableLayout } from "../layout/tableLayout";
import { setupTableBorder } from "../layout/TableBorder";
import { setupPlungerLane } from "../layout/PlungerLane";
import { setupGutter } from "../layout/Gutter";
import { setupPlayfield } from "../layout/Playfield";
import { CcdHandler } from "../physics/CcdHandler";

const TOTAL_BALLS = 3;

type CollisionEvent = {
  pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
};

export class Game extends Scene {
  private leftFlipper!: Flipper;
  private rightFlipper!: Flipper;
  private ball!: Ball;
  private ballsText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private multiplierText!: Phaser.GameObjects.Text;
  private ballSpawnX = 0;
  private ballSpawnY = 0;
  private ballsLeft = TOTAL_BALLS;
  private drainQueued = false;
  private score = 0;
  private scoreMultiplier = 1;
  private multiplierTimer: Phaser.Time.TimerEvent | null = null;
  private resetRolloverLanes!: () => void;
  private ccdHandler!: CcdHandler;

  constructor() {
    super("Game");
  }

  create() {
    this.ballsLeft = TOTAL_BALLS;
    this.drainQueued = false;
    this.score = 0;
    this.scoreMultiplier = 1;

    const { width, height } = this.scale;
    const layout = computeTableLayout(width, height);
    const { right, top } = layout;

    // ── Layout areas ───────────────────────────────────────────────────────────
    setupTableBorder(this, layout);

    const { ballSpawnX, ballSpawnY } = setupPlungerLane(
      this,
      layout,
      () => this.ball ?? null
    );
    this.ballSpawnX = ballSpawnX;
    this.ballSpawnY = ballSpawnY;

    const { leftFlipper, rightFlipper } = setupGutter(this, layout, () =>
      this.addScore(50)
    );
    this.leftFlipper = leftFlipper;
    this.rightFlipper = rightFlipper;

    // ── Playfield elements ─────────────────────────────────────────────────────
    const { resetRolloverLanes } = setupPlayfield(this, layout, {
      onBumperHit: () => this.addScore(100),
      onAllRolloversLit: () => this.activateMultiplier(),
      onDropTargetHit: () => this.addScore(150),
      onDropBankCleared: () => this.addScore(1000),
      onStandupHit: () => this.addScore(200),
    });
    this.resetRolloverLanes = resetRolloverLanes;

    this.spawnBall();

    // ── HUD ────────────────────────────────────────────────────────────────────
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

    this.add
      .text(right + 24, top + 130, "MULT", {
        fontFamily: "Arial Black",
        fontSize: 14,
        color: "#aaaaaa",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0, 0);

    this.multiplierText = this.add
      .text(right + 24, top + 148, "1×", {
        fontFamily: "Arial Black",
        fontSize: 26,
        color: "#888888",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0, 0);

    // ── Keyboard controls ──────────────────────────────────────────────────────
    // Key events fire immediately on press/release, before the next update()
    // frame, giving instant flipper response.
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

    // ── Physics ────────────────────────────────────────────────────────────────
    // Disable automatic per-frame physics step so we can sub-step manually.
    this.matter.world.autoUpdate = false;

    // Collect all static, non-sensor wall bodies for the CCD pre-pass.
    // Flipper and plunger bodies are deliberately excluded: their collisions are
    // handled entirely by Matter.js so the correct launch impulse is applied.
    const wallBodies = this.matter.world
      .getAllBodies()
      .filter((b) => b.isStatic && !b.isSensor && b.label === "wall");

    // Register the CCD handler *after* all objects (incl. flippers) have
    // registered their own beforeupdate listeners, so it always fires last and
    // sees the final flipper positions for that step.
    this.ccdHandler = new CcdHandler(
      this,
      [this.leftFlipper, this.rightFlipper],
      () => this.ball ?? null,
      () => this.drainQueued
    );
    this.ccdHandler.setWallBodies(wallBodies);
    this.matter.world.on("beforeupdate", this.ccdHandler.handle);
    this.matter.world.on("collisionstart", this.onCollisionStart, this);

    EventBus.emit("current-scene-ready", this);
  }

  private spawnBall(): void {
    this.ball = new Ball(this, this.ballSpawnX, this.ballSpawnY);
  }

  private addScore(points: number): void {
    this.score += points * this.scoreMultiplier;
    this.updateScoreText();
  }

  private activateMultiplier(): void {
    this.scoreMultiplier = 2;
    this.multiplierText.setText("2×").setColor("#00e5ff");
    if (this.multiplierTimer) this.multiplierTimer.remove();
    this.multiplierTimer = this.time.delayedCall(15000, () =>
      this.deactivateMultiplier()
    );
  }

  private deactivateMultiplier(): void {
    this.scoreMultiplier = 1;
    this.multiplierText.setText("1×").setColor("#888888");
    this.multiplierTimer = null;
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

      // Reset per-ball state
      this.deactivateMultiplier();
      this.resetRolloverLanes();

      if (this.ballsLeft <= 0) {
        this.scene.start("GameOver", { score: this.score });
        return;
      }

      this.spawnBall();
      this.drainQueued = false;
    });
  }

  update(_time: number, delta: number): void {
    // Cap delta so a long pause (e.g. tab switch) doesn't produce a giant step.
    const dt = Math.min(delta, 33);
    const stepDelta = dt / STEPS;
    for (let i = 0; i < STEPS; i++) {
      this.matter.world.step(stepDelta);
    }
  }
}
