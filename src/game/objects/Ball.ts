import Phaser from "phaser";

const RADIUS = 20;

/**
 * The pinball. A dynamic Matter.js circle body whose visual Container
 * is synced to the physics position every frame via a scene update listener.
 */
export class Ball extends Phaser.GameObjects.Container {
  private readonly physicsBody: MatterJS.BodyType;

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

    this.physicsBody = scene.matter.bodies.circle(x, y, RADIUS, {
      label: "ball",
      restitution: 0.1,
      friction: 0.01,
      frictionAir: 0.005,
    });
    scene.matter.world.add(this.physicsBody);

    scene.matter.world.on("afterupdate", this.sync, this);
    this.once("destroy", () =>
      scene.matter.world.off("afterupdate", this.sync, this)
    );
  }

  private sync(): void {
    this.setPosition(this.physicsBody.position.x, this.physicsBody.position.y);
  }
}
