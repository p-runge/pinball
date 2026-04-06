import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { Ball } from "../objects/Ball";
import { Flipper } from "../objects/Flipper";

export class Game extends Scene {
  private leftFlipper!: Flipper;
  private rightFlipper!: Flipper;

  constructor() {
    super("Game");
  }

  create() {
    const { width, height } = this.scale;

    // Table boundaries
    const left = 20;
    const right = width - 40; // 440
    const top = 20;
    const bottom = height - 20; // 820

    // Plunger lane (right side)
    const plungerSep = right - 36; // 404 — separator between playfield and plunger lane
    const plungerEntryY = 200; // where ball can enter playfield from plunger lane

    // Bottom gutter diagonal start (where side walls angle inward)
    const gutterY = bottom - 200; // 620
    const gutterInnerLeft = left + 90; // 130 — where left gutter meets flipper level
    const gutterInnerRight = plungerSep - 90; // 314 — where right gutter meets flipper level

    // Flipper pivot points (outer ends, fixed to the gutter walls)
    const flipperY = bottom - 60; // 760

    const g = this.add.graphics();
    g.lineStyle(3, 0xcccccc, 1);

    // Outer table rectangle
    g.strokeRect(left, top, right - left, bottom - top);

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

    // Left gutter diagonal
    g.beginPath();
    g.moveTo(left, gutterY);
    g.lineTo(gutterInnerLeft, flipperY);
    g.strokePath();

    // Right gutter diagonal
    g.beginPath();
    g.moveTo(plungerSep, gutterY);
    g.lineTo(gutterInnerRight, flipperY);
    g.strokePath();

    // Flippers
    this.leftFlipper = new Flipper(this, gutterInnerLeft, flipperY, "left");
    this.rightFlipper = new Flipper(this, gutterInnerRight, flipperY, "right");

    // Ball — spawn slightly above the left flipper so it rolls down into the playfield, giving
    // the player a moment to react instead of dropping it straight onto the flippers.
    new Ball(this, gutterInnerLeft + 20, flipperY - 200);

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

    EventBus.emit("current-scene-ready", this);

    // Disable the automatic per-frame physics step so we can sub-step manually
    // in update(). More steps per render frame = finer collision granularity
    // during fast flipper movement, preventing the ball from being skipped over.
    this.matter.world.autoUpdate = false;
  }

  // Sub-step the physics engine each render frame.
  // At 60 fps with STEPS=3 each step covers ~5.5 ms, keeping the maximum
  // distance any body travels per step well below the ball's radius.
  update(_time: number, delta: number): void {
    const STEPS = 3;
    const stepDelta = delta / STEPS;
    for (let i = 0; i < STEPS; i++) {
      this.matter.world.step(stepDelta);
    }
  }
}
