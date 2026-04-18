import Phaser from "phaser";

const BUMPER_RADIUS = 20;
const INNER_RADIUS = 10;
const BUMPER_KICK = 18;

type CollisionEvent = {
  pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
};

export class Bumper extends Phaser.GameObjects.Container {
  private readonly physicsBody: MatterJS.BodyType;
  private readonly onHit: (() => void) | undefined;

  constructor(scene: Phaser.Scene, x: number, y: number, onHit?: () => void) {
    super(scene, x, y);
    this.onHit = onHit;

    const g = scene.add.graphics();
    g.fillStyle(0xffd54f, 1);
    g.fillCircle(0, 0, BUMPER_RADIUS);
    g.lineStyle(4, 0xff8f00, 1);
    g.strokeCircle(0, 0, BUMPER_RADIUS - 2);
    g.fillStyle(0xff7043, 1);
    g.fillCircle(0, 0, INNER_RADIUS);
    this.add(g);
    scene.add.existing(this);

    this.physicsBody = scene.matter.add.circle(x, y, BUMPER_RADIUS, {
      isStatic: true,
      label: "bumper",
      friction: 0,
      restitution: 1,
    });

    scene.matter.world.on("collisionstart", this.onCollisionStart, this);
    this.once("destroy", () => {
      scene.matter.world.off("collisionstart", this.onCollisionStart, this);
      scene.matter.world.remove(this.physicsBody);
    });
  }

  private onCollisionStart(event: CollisionEvent): void {
    for (const { bodyA, bodyB } of event.pairs) {
      if (bodyA === this.physicsBody && bodyB.label === "ball") {
        this.kick(bodyB);
      } else if (bodyB === this.physicsBody && bodyA.label === "ball") {
        this.kick(bodyA);
      }
    }
  }

  private kick(ballBody: MatterJS.BodyType): void {
    const dx = ballBody.position.x - this.physicsBody.position.x;
    const dy = ballBody.position.y - this.physicsBody.position.y;
    const len = Math.hypot(dx, dy);
    const nx = len > 1e-6 ? dx / len : 0;
    const ny = len > 1e-6 ? dy / len : -1;

    this.scene.matter.body.setVelocity(ballBody, {
      x: ballBody.velocity.x + nx * BUMPER_KICK,
      y: ballBody.velocity.y + ny * BUMPER_KICK,
    });

    this.onHit?.();
  }
}
