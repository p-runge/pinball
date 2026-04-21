import { Scene } from "phaser";
import { EventBus } from "../EventBus";

const MENU_ITEMS = ["START GAME", "HIGHSCORES"] as const;

export class MainMenu extends Scene {
  private selectedIndex = 0;
  private menuTexts: Phaser.GameObjects.Text[] = [];

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

    this.selectedIndex = 0;
    this.menuTexts = [];

    MENU_ITEMS.forEach((label, i) => {
      const y = height / 2 + i * 64;
      const text = this.add
        .text(width / 2, y, label, {
          fontFamily: "Arial Black",
          fontSize: 28,
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 4,
          align: "center",
          fixedWidth: 300,
        })
        .setOrigin(0.5);
      this.menuTexts.push(text);
    });

    this.updateMenuDisplay();

    const up = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    const down = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.DOWN
    );
    const enter = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
    );

    up.on("down", () => {
      this.selectedIndex =
        (this.selectedIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
      this.updateMenuDisplay();
    });

    down.on("down", () => {
      this.selectedIndex = (this.selectedIndex + 1) % MENU_ITEMS.length;
      this.updateMenuDisplay();
    });

    enter.once("down", () => {
      if (this.selectedIndex === 0) {
        this.scene.start("Game");
      } else {
        this.scene.start("Highscores");
      }
    });

    EventBus.emit("current-scene-ready", this);
  }

  private updateMenuDisplay() {
    this.menuTexts.forEach((text, i) => {
      const selected = i === this.selectedIndex;
      text.setText(selected ? `> ${MENU_ITEMS[i]} <` : MENU_ITEMS[i]);
      text.setColor(selected ? "#ffff00" : "#cccccc");
    });
  }
}
