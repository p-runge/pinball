import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app } from "./app.js";

// Serve Vite-built frontend in production; in dev Vite handles static files.
if (process.env["NODE_ENV"] !== "development") {
  app.use("/*", serveStatic({ root: "./dist" }));
}

const port = Number(process.env["PORT"] ?? 3011);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`);
});
