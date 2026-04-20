import Phaser from "phaser";

const COLOR_NORMAL = 0x66bb6a;
const COLOR_BORDER = 0xa5d6a7;
const COLOR_FLASH = 0xffffff;

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
 * A standup target — a static wall that the ball bounces off.
 *
 * Unlike a drop target it never disappears.  It flashes briefly on each hit
 * to give visual feedback and fires `onHit`.
 *
 * The `angle` parameter (radians) rotates the target so that the ball cannot
 * rest on a flat horizontal surface.  Use ≥ Math.PI/6 (30°) from horizontal.
 */
export class StandupTarget {
  private readonly physicsBody: MatterJS.BodyType;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private readonly cx: number;
  private readonly cy: number;
  private readonly w: number;
  private readonly h: number;
  private readonly angle: number;
  private readonly onHit: () => void;
  private flashActive = false;

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
      label: "standup-target",
      friction: 0,
      restitution: 0.6,
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

  private onCollisionStart(event: CollisionEvent): void {
    for (const { bodyA, bodyB } of event.pairs) {
      if (
        (bodyA === this.physicsBody && bodyB.label === "ball") ||
        (bodyB === this.physicsBody && bodyA.label === "ball")
      ) {
        this.flash();
        break;
      }
    }
  }

  private flash(): void {
    if (this.flashActive) {
      this.onHit();
      return;
    }
    this.flashActive = true;
    this.draw(true);
    this.onHit();
    this.scene.time.delayedCall(120, () => {
      this.flashActive = false;
      this.draw(false);
    });
  }

  private draw(lit: boolean): void {
    const g = this.g;
    g.clear();
    const pts = rotatedCorners(this.cx, this.cy, this.w, this.h, this.angle);

    const fill = lit ? COLOR_FLASH : COLOR_NORMAL;
    const border = lit ? COLOR_FLASH : COLOR_BORDER;
    const alpha = lit ? 0.9 : 1;

    g.fillStyle(fill, alpha);
    g.fillPoints(pts, true);
    g.lineStyle(2, border, 1);
    g.strokePoints(pts, true);
  }
}
