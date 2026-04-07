import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import { Ball, BALL_RADIUS } from "../objects/Ball";
import { Flipper } from "../objects/Flipper";
import { Plunger, PLUNGER_BODY_H } from "../objects/Plunger";
import { addBodiesFromSvgPath } from "../utils/svgPhysics";

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
    // Top-left concave arc: (20,80) → (80,20), clockwise, centre (80,80)
    g.arc(
      left + CORNER_R,
      top + CORNER_R,
      CORNER_R,
      Math.PI,
      -Math.PI / 2,
      false
    );
    g.lineTo(right - CORNER_R, top); // top wall → (380,20)
    // Top-right concave arc: (380,20) → (440,80), clockwise, centre (380,80)
    g.arc(right - CORNER_R, top + CORNER_R, CORNER_R, -Math.PI / 2, 0, false);
    g.lineTo(right, bottom); // right wall
    g.lineTo(left, bottom); // bottom wall
    g.closePath(); // left wall back to start
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

    // ── Physics ─────────────────────────────────────────────────────────────
    const WALL_T = 4; // wall thickness in px

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
          friction: 0.05,
          restitution: 0.3,
        }
      );
    };

    // Outer border — straight walls trimmed to the arc endpoints so the
    // geometry is seamless with the concave corner inlays below.
    addSeg(left + CORNER_R, top, right - CORNER_R, top); // top (between inlays)
    // Bottom wall only covers the main playfield; the plunger lane uses the
    // plunger body itself as its floor so the ball rests on (and is launched by) it.
    addSeg(left, bottom, plungerSep, bottom); // main playfield bottom
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
      // Top-right: from right wall (440,80) counterclockwise to top wall (380,20)
      `M${right},${top + CORNER_R} A${CORNER_R},${CORNER_R} 0 0,0 ${right - CORNER_R},${top}`
    );
    addBodiesFromSvgPath(
      this,
      // Top-left: from top wall (80,20) counterclockwise to left wall (20,80)
      `M${left + CORNER_R},${top} A${CORNER_R},${CORNER_R} 0 0,0 ${left},${top + CORNER_R}`
    );

    // Plunger lane separator
    addSeg(plungerSep, plungerEntryY, plungerSep, bottom);

    // Gutter diagonals
    addSeg(left, gutterY, gutterInnerLeft, flipperY);
    addSeg(plungerSep, gutterY, gutterInnerRight, flipperY);

    // ── Game objects ─────────────────────────────────────────────────────────

    // Flippers
    this.leftFlipper = new Flipper(this, gutterInnerLeft, flipperY, "left");
    this.rightFlipper = new Flipper(this, gutterInnerRight, flipperY, "right");

    // Plunger lane setup.
    // The plunger body (full lane width) acts as the floor of the lane so the
    // ball rests on it and is launched by it through physics collision.
    // restY: plunger centre flush with the table bottom (head top = bottom - BODY_H/2).
    const laneX = (plungerSep + right) / 2; // horizontal centre of the lane (422)
    const plungerRestY = bottom - PLUNGER_BODY_H / 2; // 816

    // Ball spawns on the plunger surface: centre = restY - half-body - ball-radius.
    new Ball(this, laneX, plungerRestY - PLUNGER_BODY_H / 2 - BALL_RADIUS);

    // Plunger: sensor covers the lane from the entry point down to the body.
    // The charge bar is rendered just outside the right table wall.
    new Plunger(
      this,
      laneX,
      plungerRestY,
      plungerEntryY, // top of sensor = lane entry
      right + 8, // charge bar X
      bottom - 10 // charge bar bottom Y
    );

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
