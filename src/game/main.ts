import { Game as PinballGame } from "./scenes/Game";
import { MainMenu } from "./scenes/MainMenu";
import { AUTO, Game, Scale } from "phaser";
import { env } from "../env";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: "game-container",
  backgroundColor: "#333333",
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
    width: 480,
    height: 840,
  },
  physics: {
    default: "matter",
    matter: {
      gravity: { x: 0, y: 1 },
      // Set debug: true to visualise collision shapes during development
      debug: env.VITE_DEBUG,
    },
  },
  scene: [MainMenu, PinballGame],
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

export default StartGame;
