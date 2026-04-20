import { getRequestListener } from "@hono/node-server";
import { app } from "../server/app.js";

// Re-use the same Hono app for Vercel serverless functions.
// getRequestListener converts Hono's fetch handler to a Node.js
// IncomingMessage/ServerResponse handler — exactly what Vercel expects.
export default getRequestListener(app.fetch);
