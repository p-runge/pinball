import { Hono } from "hono";
import { addHighscore, getHighscores } from "./api/highscores.js";

export const app = new Hono();

app.get("/api/highscores", async (c) => {
  const data = await getHighscores();
  return c.json(data);
});

app.post("/api/highscores", async (c) => {
  const body = await c.req.json<{ name: string; score: number }>();
  const { name, score } = body;
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    typeof score !== "number"
  ) {
    return c.json({ error: "Invalid payload" }, 400);
  }
  const entry = await addHighscore(name.trim().slice(0, 32), score);
  return c.json(entry, 201);
});
