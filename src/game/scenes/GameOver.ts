import { Scene } from "phaser";
import { EventBus } from "../EventBus";

export class GameOver extends Scene {
  constructor() {
    super("GameOver");
  }

  create() {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 3, "GAME OVER", {
        fontFamily: "Arial Black",
        fontSize: 64,
        color: "#ff5555",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2, "PRESS ENTER TO PLAY AGAIN", {
        fontFamily: "Arial Black",
        fontSize: 24,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5);

    const enter = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
    );
    enter.once("down", () => this.scene.start("Game"));

    EventBus.emit("current-scene-ready", this);
  }
}
