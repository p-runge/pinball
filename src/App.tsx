import { useEffect, useRef, useState } from "react";
import { PhaserGame, type IRefPhaserGame } from "./PhaserGame";
import { EventBus } from "./game/EventBus";
import { HighscoreOverlay } from "./components/HighscoreOverlay";

function App() {
  const gameRef = useRef<IRefPhaserGame>(null!);
  const [gameOverScore, setGameOverScore] = useState<number | null>(null);

  useEffect(() => {
    const handler = ({ score }: { score: number }) => {
      setGameOverScore(score);
    };
    EventBus.on("game-over", handler);
    return () => {
      EventBus.off("game-over", handler);
    };
  }, []);

  function handlePlayAgain() {
    setGameOverScore(null);
    gameRef.current?.scene?.scene.start("Game");
  }

  return (
    <div id="app">
      <PhaserGame ref={gameRef} />
      {gameOverScore !== null && (
        <HighscoreOverlay score={gameOverScore} onPlayAgain={handlePlayAgain} />
      )}
    </div>
  );
}

export default App;
