import { Scene } from "phaser";
import { EventBus } from "../EventBus";
import type { HighscoreEntry } from "../../components/HighscoreOverlay";

const RANK_COLORS: Record<number, string> = {
  0: "#ffff00",
  1: "#efefef",
  2: "#cd7f32",
};

export class Highscores extends Scene {
  constructor() {
    super("Highscores");
  }

  create() {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, 80, "HIGHSCORES", {
        fontFamily: "Arial Black",
        fontSize: 56,
        color: "#ffff00",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      })
      .setOrigin(0.5);

    const loadingText = this.add
      .text(width / 2, height / 2, "Loading…", {
        fontFamily: "Arial Black",
        fontSize: 20,
        color: "#cccccc",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    fetch("/api/highscores")
      .then((r) => r.json())
      .then((data: HighscoreEntry[]) => {
        if (!this.scene.isActive()) return;
        loadingText.destroy();
        this.renderList(data, width);
      })
      .catch(() => {
        if (!this.scene.isActive()) return;
        loadingText.setText("Could not load scores.");
      });

    this.add
      .text(width / 2, height - 60, "PRESS ENTER OR ESC TO GO BACK", {
        fontFamily: "Arial Black",
        fontSize: 15,
        color: "#cccccc",
        stroke: "#000000",
        strokeThickness: 2,
        align: "center",
      })
      .setOrigin(0.5);

    const back = () => this.scene.start("MainMenu");
    this.input
      .keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
      .once("down", back);
    this.input
      .keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
      .once("down", back);

    EventBus.emit("current-scene-ready", this);
  }

  private renderList(data: HighscoreEntry[], width: number) {
    if (data.length === 0) {
      this.add
        .text(width / 2, 400, "No scores yet — be the first!", {
          fontFamily: "Arial Black",
          fontSize: 20,
          color: "#cccccc",
          stroke: "#000000",
          strokeThickness: 3,
          align: "center",
        })
        .setOrigin(0.5);
      return;
    }

    const startY = 200;
    const rowHeight = 42;
    const colRank = width / 2 - 200;
    const colName = width / 2 - 150;
    const colScore = width / 2 + 200;

    // Header
    const headerStyle = {
      fontFamily: "Arial Black",
      fontSize: 13,
      color: "#cccccc",
      stroke: "#000000" as string,
      strokeThickness: 2,
    };
    this.add.text(colRank, startY - 28, "#", headerStyle).setOrigin(0, 0.5);
    this.add.text(colName, startY - 28, "NAME", headerStyle).setOrigin(0, 0.5);
    this.add
      .text(colScore, startY - 28, "SCORE", headerStyle)
      .setOrigin(1, 0.5);

    data.slice(0, 10).forEach((entry, i) => {
      const y = startY + i * rowHeight;
      const color = RANK_COLORS[i] ?? "#cccccc";

      const entryStyle = {
        fontFamily: "Arial Black",
        fontSize: 20,
        color,
        stroke: "#000000" as string,
        strokeThickness: 3,
      };

      this.add.text(colRank, y, `${i + 1}`, entryStyle).setOrigin(0, 0.5);
      this.add.text(colName, y, entry.name, entryStyle).setOrigin(0, 0.5);
      this.add
        .text(colScore, y, entry.score.toLocaleString(), entryStyle)
        .setOrigin(1, 0.5);
    });
  }
}
