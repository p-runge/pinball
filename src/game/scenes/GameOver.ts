import { Scene } from "phaser";
import { EventBus } from "../EventBus";

export class GameOver extends Scene {
  constructor() {
    super("GameOver");
  }

  create(data: { score?: number }) {
    const score = data?.score ?? 0;

    // Dark backdrop — the React overlay renders all UI on top.
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.7)
      .setOrigin(0, 0);

    EventBus.emit("game-over", { score });
    EventBus.emit("current-scene-ready", this);
  }
}
