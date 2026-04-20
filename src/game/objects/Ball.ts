import Phaser from "phaser";

const RADIUS = 13.5;
export const BALL_RADIUS = RADIUS;

/**
 * The pinball. A dynamic Matter.js circle body whose visual Container is
 * synced to the physics position after every sub-step.
 *
 * Tunnelling prevention is handled by the CCD system in Game.ts, which
 * predicts the ball's trajectory before each step and reflects its velocity
 * at the contact surface.  No speed cap is applied here.
 */
export class Ball extends Phaser.GameObjects.Container {
  private readonly _physicsBody: MatterJS.BodyType;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    const g = scene.add.graphics();
    g.fillStyle(0xc0c0c0, 1);
    g.fillCircle(0, 0, RADIUS);
    // Small specular highlight to give it a spherical look
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(-3, -3, 4);
    this.add(g);
    scene.add.existing(this);

    this._physicsBody = scene.matter.bodies.circle(x, y, RADIUS, {
      label: "ball",
      restitution: 0.3,
      friction: 0,
      // Density is tuned so the ball weighs 80g at radius 13.5, which is in the ballpark for a real pinball
      density: 0.00979,
      //   frictionAir: 0.001,
    });
    scene.matter.world.add(this._physicsBody);

    scene.matter.world.on("afterupdate", this.sync, this);
    this.once("destroy", () => {
      scene.matter.world.off("afterupdate", this.sync, this);
      scene.matter.world.remove(this._physicsBody);
    });
  }

  /** Exposes the underlying Matter.js body for external systems (e.g. CCD). */
  get physicsBody(): MatterJS.BodyType {
    return this._physicsBody;
  }

  private sync(): void {
    this.setPosition(
      this._physicsBody.position.x,
      this._physicsBody.position.y
    );
  }
}
