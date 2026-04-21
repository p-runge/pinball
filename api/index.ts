import { getRequestListener } from "@hono/node-server";
import { app } from "../server/app.js";

// Disable Vercel's built-in body parser so Hono can read the raw stream.
export const config = { api: { bodyParser: false } };

// Re-use the same Hono app for Vercel serverless functions.
// getRequestListener converts Hono's fetch handler to a Node.js
// IncomingMessage/ServerResponse handler — exactly what Vercel expects.
export default getRequestListener(app.fetch);
