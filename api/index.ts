import type { VercelRequest, VercelResponse } from "@vercel/node";
import { app } from "../server/app.js";

// Let Vercel parse the body (default), then adapt to Web API Request/Response
// so the Hono app remains the single source of truth for all route logic.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const base = `https://${req.headers.host ?? "localhost"}`;
  const url = new URL(req.url ?? "/", base);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }

  // Vercel already parsed the JSON body — re-serialize so Hono can read it.
  const body =
    req.body != null && req.method !== "GET" && req.method !== "HEAD"
      ? JSON.stringify(req.body)
      : undefined;

  const webReq = new Request(url, { method: req.method, headers, body });
  const webRes = await app.fetch(webReq);

  res.status(webRes.status);
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(await webRes.text());
}
