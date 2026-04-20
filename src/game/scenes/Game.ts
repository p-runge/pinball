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
const MAX_MULTIPLIER = 5;

// Colour for each multiplier level — used by both the HUD text and the
// rollover-lane lit colour (which previews the *next* level the player is aiming for).
const MULTIPLIER_COLORS: Record<number, { hex: number; css: string }> = {
  1: { hex: 0x888888, css: "#888888" },
  2: { hex: 0x00e5ff, css: "#00e5ff" },
  3: { hex: 0x69f0ae, css: "#69f0ae" },
  4: { hex: 0xffab40, css: "#ffab40" },
  5: { hex: 0xff1744, css: "#ff1744" },
};

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
  private resetRolloverLanes!: () => void;
  private setRolloverLitColor!: (hex: number) => void;
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
    const { resetRolloverLanes, setRolloverLitColor } = setupPlayfield(
      this,
      layout,
      {
        onBumperHit: () => this.addScore(100),
        onAllRolloversLit: () => this.increaseMultiplier(),
        onDropTargetHit: () => this.addScore(150),
        onDropBankCleared: () => this.addScore(1000),
        onStandupHit: () => this.addScore(200),
      }
    );
    this.resetRolloverLanes = resetRolloverLanes;
    this.setRolloverLitColor = setRolloverLitColor;

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

    // Lanes preview the next multiplier level — at start that's 2×.
    this.setRolloverLitColor(MULTIPLIER_COLORS[2].hex);

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

  private increaseMultiplier(): void {
    this.scoreMultiplier = Math.min(this.scoreMultiplier + 1, MAX_MULTIPLIER);
    this.updateMultiplierUI();
  }

  private resetMultiplier(): void {
    this.scoreMultiplier = 1;
    this.updateMultiplierUI();
  }

  private updateMultiplierUI(): void {
    const current = MULTIPLIER_COLORS[this.scoreMultiplier];
    this.multiplierText
      .setText(`${this.scoreMultiplier}×`)
      .setColor(current.css);
    // Lanes preview the next level; at max they stay at the max colour.
    const nextLevel = Math.min(this.scoreMultiplier + 1, MAX_MULTIPLIER);
    this.setRolloverLitColor(MULTIPLIER_COLORS[nextLevel].hex);
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

      // Reset per-ball state before spawning the next ball.
      this.resetMultiplier();
      this.resetRolloverLanes();
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
