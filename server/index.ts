import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { addHighscore, getHighscores } from "./api/highscores";

const app = new Hono();

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

// Serve Vite-built frontend in production; in dev Vite handles static files.
if (process.env["NODE_ENV"] !== "development") {
  app.use("/*", serveStatic({ root: "./dist" }));
}

const port = Number(process.env["PORT"] ?? 3011);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`);
});
