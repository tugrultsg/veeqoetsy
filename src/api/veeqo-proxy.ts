import { Hono } from "hono";
import { Env } from "../env";
import { VeeqoClient } from "../services/veeqo-client";

export const veeqoProxyRoutes = new Hono<{ Bindings: Env }>();

// These endpoints are used during setup to fetch Veeqo config
// API key is passed as query param (not yet stored)

veeqoProxyRoutes.get("/channels", async (c) => {
  const apiKey = c.req.query("apiKey");
  if (!apiKey) return c.json({ error: "Missing apiKey" }, 400);

  try {
    const veeqo = new VeeqoClient(apiKey);
    const channels = await veeqo.getChannels();
    return c.json(channels);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

veeqoProxyRoutes.get("/warehouses", async (c) => {
  const apiKey = c.req.query("apiKey");
  if (!apiKey) return c.json({ error: "Missing apiKey" }, 400);

  try {
    const veeqo = new VeeqoClient(apiKey);
    const warehouses = await veeqo.getWarehouses();
    return c.json(warehouses);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

veeqoProxyRoutes.get("/delivery-methods", async (c) => {
  const apiKey = c.req.query("apiKey");
  if (!apiKey) return c.json({ error: "Missing apiKey" }, 400);

  try {
    const veeqo = new VeeqoClient(apiKey);
    const methods = await veeqo.getDeliveryMethods();
    return c.json(methods);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});
