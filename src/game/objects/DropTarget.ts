import Phaser from "phaser";

const COLOR_NORMAL = 0xff4444;
const COLOR_DOWN = 0x333333;
const COLOR_BORDER = 0xff8888;

type CollisionEvent = {
  pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
};

/** Returns the four corners of a rectangle centered at (cx,cy), rotated by angle. */
function rotatedCorners(
  cx: number,
  cy: number,
  w: number,
  h: number,
  angle: number
): { x: number; y: number }[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: cx - hw * cos + hh * sin, y: cy - hw * sin - hh * cos },
    { x: cx + hw * cos + hh * sin, y: cy + hw * sin - hh * cos },
    { x: cx + hw * cos - hh * sin, y: cy + hw * sin + hh * cos },
    { x: cx - hw * cos - hh * sin, y: cy - hw * sin + hh * cos },
  ];
}

/**
 * A single drop target.
 *
 * The target is a static rectangle body at the given `angle` (radians).
 * When the ball hits it, the body becomes a sensor (the target "drops") and
 * the visual dims.  Call `reset()` to bring it back up.
 *
 * Angling the target (≥ 30° from horizontal) ensures the ball cannot rest
 * statically on its surface.
 */
export class DropTarget {
  private readonly physicsBody: MatterJS.BodyType;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private readonly cx: number;
  private readonly cy: number;
  private readonly w: number;
  private readonly h: number;
  private readonly angle: number;
  private readonly onHit: () => void;
  private _isDown = false;

  get isDown(): boolean {
    return this._isDown;
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    /** Rotation in radians.  Use ≥ Math.PI/6 (30°) to prevent ball resting. */
    angle: number,
    onHit: () => void
  ) {
    this.scene = scene;
    this.cx = x;
    this.cy = y;
    this.w = width;
    this.h = height;
    this.angle = angle;
    this.onHit = onHit;

    this.physicsBody = scene.matter.add.rectangle(x, y, width, height, {
      isStatic: true,
      isSensor: false,
      label: "drop-target",
      friction: 0,
      restitution: 0.5,
      angle,
    });

    this.g = scene.add.graphics();
    this.draw(false);

    scene.matter.world.on("collisionstart", this.onCollisionStart, this);
    scene.events.once("shutdown", () => {
      scene.matter.world.off("collisionstart", this.onCollisionStart, this);
      scene.matter.world.remove(this.physicsBody);
    });
  }

  reset(): void {
    if (!this._isDown) return;
    this._isDown = false;
    this.physicsBody.isSensor = false;
    this.g.setAlpha(1);
    this.draw(false);
  }

  private onCollisionStart(event: CollisionEvent): void {
    if (this._isDown) return;
    for (const { bodyA, bodyB } of event.pairs) {
      if (
        (bodyA === this.physicsBody && bodyB.label === "ball") ||
        (bodyB === this.physicsBody && bodyA.label === "ball")
      ) {
        this.flashAndDrop();
        break;
      }
    }
  }

  private flashAndDrop(): void {
    // Mark down immediately so re-entry during the flash animation is ignored.
    this._isDown = true;
    this.physicsBody.isSensor = true;

    this.scene.tweens.add({
      targets: this.g,
      alpha: { from: 1, to: 0.15 },
      duration: 80,
      yoyo: true,
      onComplete: () => {
        this.g.setAlpha(1);
        this.draw(true);
        this.onHit();
      },
    });
  }

  private draw(down: boolean): void {
    const g = this.g;
    g.clear();
    const pts = rotatedCorners(this.cx, this.cy, this.w, this.h, this.angle);

    if (down) {
      g.fillStyle(COLOR_DOWN, 0.4);
      g.fillPoints(pts, true);
      g.lineStyle(1, COLOR_DOWN, 0.6);
      g.strokePoints(pts, true);
    } else {
      g.fillStyle(COLOR_NORMAL, 1);
      g.fillPoints(pts, true);
      g.lineStyle(2, COLOR_BORDER, 1);
      g.strokePoints(pts, true);
    }
  }
}
