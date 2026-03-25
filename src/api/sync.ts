import { Hono } from "hono";
import { Env } from "../env";

export const syncRoutes = new Hono<{ Bindings: Env }>();

// Manual sync triggers are in shops.ts (POST /shops/:id/sync/:type)
// This route is for global sync-all
syncRoutes.post("/all/:type", async (c) => {
  // Import the cron handler logic
  const { handleScheduled } = await import("../cron/handler");

  const type = c.req.param("type");
  const cronMap: Record<string, string> = {
    orders: "*/5 * * * *",
    shipping: "*/10 * * * *",
    inventory: "0,30 * * * *",
  };

  const cron = cronMap[type];
  if (!cron) return c.json({ error: "Invalid type" }, 400);

  await handleScheduled({ cron, scheduledTime: Date.now() } as any, c.env);
  return c.json({ ok: true, type });
});
