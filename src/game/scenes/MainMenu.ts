import { Scene } from "phaser";
import { EventBus } from "../EventBus";

export class MainMenu extends Scene {
  constructor() {
    super("MainMenu");
  }

  create() {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 3, "PINBALL", {
        fontFamily: "Arial Black",
        fontSize: 72,
        color: "#ffff00",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2, "PRESS ENTER TO START", {
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
