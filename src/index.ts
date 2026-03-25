import { Hono } from "hono";
import { Env } from "./env";
import { apiRoutes } from "./api/index";
import { handleScheduled } from "./cron/handler";

const app = new Hono<{ Bindings: Env }>();

// API routes
app.route("/api", apiRoutes);

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// All other routes → serve static assets (React SPA)
app.all("*", async (c) => {
  // Try to serve the exact path from assets
  let resp = await c.env.ASSETS.fetch(c.req.raw);

  // If not found or if it's an SPA route, serve index.html
  if (resp.status === 404) {
    const url = new URL(c.req.url);
    url.pathname = "/";
    resp = await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  }

  return resp;
});

export default {
  fetch: app.fetch,
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(handleScheduled(controller, env));
  },
};
