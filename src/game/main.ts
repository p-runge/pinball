import { Game as PinballGame } from "./scenes/Game";
import { MainMenu } from "./scenes/MainMenu";
import { AUTO, Game } from "phaser";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  width: 480,
  height: 840,
  parent: "game-container",
  backgroundColor: "#000000",
  scene: [MainMenu, PinballGame],
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

export default StartGame;
