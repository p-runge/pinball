import Phaser from "phaser";

const LANE_H = 8; // visual + physics height of the sensor strip
const COLOR_UNLIT = 0x334455;
const COLOR_LIT = 0x00e5ff;

type CollisionEvent = {
  pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
};

/**
 * A horizontal sensor strip that the ball rolls over.
 *
 * The lane is invisible to physics (sensor-only) — it only detects when the
 * ball passes through and fires `onLit`.  Visually it switches between a dim
 * "unlit" state and a bright "lit" state.
 *
 * Call `reset()` to return the lane to its unlit state (e.g. on ball drain).
 */
export class RolloverLane {
  private readonly physicsBody: MatterJS.BodyType;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly onLit: () => void;
  private _isLit = false;

  get isLit(): boolean {
    return this._isLit;
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    onLit: () => void
  ) {
    this.onLit = onLit;

    this.physicsBody = scene.matter.add.rectangle(x, y, width, LANE_H, {
      isStatic: true,
      isSensor: true,
      label: "rollover-lane",
      friction: 0,
      restitution: 0,
    });

    this.g = scene.add.graphics();
    this.drawLane(x, y, width, false);

    const world = scene.matter.world;
    world.on("collisionstart", this.onCollisionStart, this);
    scene.events.once("shutdown", () => {
      world.off("collisionstart", this.onCollisionStart, this);
      world.remove(this.physicsBody);
    });
  }

  reset(): void {
    if (!this._isLit) return;
    this._isLit = false;
    this.g.clear();
    const { x, y } = this.physicsBody.position;
    const width = this.physicsBody.bounds.max.x - this.physicsBody.bounds.min.x;
    this.drawLane(x, y, width, false);
  }

  private onCollisionStart(event: CollisionEvent): void {
    if (this._isLit) return;
    for (const { bodyA, bodyB } of event.pairs) {
      if (
        (bodyA === this.physicsBody && bodyB.label === "ball") ||
        (bodyB === this.physicsBody && bodyA.label === "ball")
      ) {
        this.light();
        break;
      }
    }
  }

  private light(): void {
    this._isLit = true;
    this.g.clear();
    const { x, y } = this.physicsBody.position;
    const width = this.physicsBody.bounds.max.x - this.physicsBody.bounds.min.x;
    this.drawLane(x, y, width, true);
    this.onLit();
  }

  private drawLane(cx: number, cy: number, width: number, lit: boolean): void {
    const color = lit ? COLOR_LIT : COLOR_UNLIT;
    const alpha = lit ? 1 : 0.6;
    this.g.fillStyle(color, alpha);
    this.g.fillRect(cx - width / 2, cy - LANE_H / 2, width, LANE_H);
    if (lit) {
      this.g.lineStyle(1, 0xffffff, 0.4);
      this.g.strokeRect(cx - width / 2, cy - LANE_H / 2, width, LANE_H);
    }
  }
}
