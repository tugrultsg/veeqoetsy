import { Hono } from "hono";
import { Env } from "./env";
import { apiRoutes } from "./api/index";
import { handleScheduled } from "./cron/handler";

const app = new Hono<{ Bindings: Env }>();

// API routes
app.route("/api", apiRoutes);

// Health check
app.get("/health", (c) => c.json({ ok: true }));

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
