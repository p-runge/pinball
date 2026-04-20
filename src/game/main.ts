import { AUTO, Game, Scale } from "phaser";
import { env } from "../env";
import { GRAVITY_Y, TABLE_H, TABLE_W } from "./layout/constants";
import { Game as PinballGame } from "./scenes/Game";
import { GameOver } from "./scenes/GameOver";
import { MainMenu } from "./scenes/MainMenu";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: "game-container",
  backgroundColor: "#333333",
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
    width: TABLE_W + 2 * 150,
    height: TABLE_H + 2 * 40,
  },
  physics: {
    default: "matter",
    matter: {
      gravity: { x: 0, y: GRAVITY_Y },
      // Set debug: true to visualise collision shapes during development
      debug: env.VITE_DEBUG,
    },
  },
  scene: [MainMenu, PinballGame, GameOver],
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

export default StartGame;
