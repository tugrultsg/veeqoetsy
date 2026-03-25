import { Hono } from "hono";
import { Env } from "../env";
import { getDb } from "../db/client";
import { setupTokens, shops, customers } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt } from "../lib/crypto";
import {
  computeChallenge,
  buildAuthUrl,
  exchangeCode,
  extractUserIdFromToken,
  saveTokens,
} from "../auth/etsy-oauth";

export const setupRoutes = new Hono<{ Bindings: Env }>();

// Validate setup token and return customer info
setupRoutes.get("/validate/:token", async (c) => {
  const db = getDb(c.env.DB);
  const token = c.req.param("token");

  const setup = await db
    .select()
    .from(setupTokens)
    .where(eq(setupTokens.token, token))
    .get();

  if (!setup) return c.json({ error: "Invalid link" }, 404);
  if (setup.used) return c.json({ error: "This link has already been used" }, 410);
  if (new Date(setup.expiresAt) < new Date()) return c.json({ error: "This link has expired" }, 410);

  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.id, setup.customerId))
    .get();

  return c.json({
    shopName: setup.shopName,
    customerName: customer?.name || "Unknown",
    callbackUrl: `${c.env.WORKER_URL}/api/oauth/etsy/callback`,
  });
});

// Start OAuth from setup page
setupRoutes.post("/oauth-start/:token", async (c) => {
  const db = getDb(c.env.DB);
  const token = c.req.param("token");
  const body = await c.req.json<{ etsyApiKey: string }>();

  const setup = await db
    .select()
    .from(setupTokens)
    .where(eq(setupTokens.token, token))
    .get();

  if (!setup || setup.used || new Date(setup.expiresAt) < new Date()) {
    return c.json({ error: "Invalid or expired link" }, 400);
  }

  // Generate PKCE
  const array = crypto.getRandomValues(new Uint8Array(64));
  const verifier = Array.from(array)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .substring(0, 96);
  const challenge = await computeChallenge(verifier);

  // Generate state
  const stateBytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(stateBytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .substring(0, 43);

  // Store in KV
  await c.env.OAUTH_STATE.put(
    `oauth:${state}`,
    JSON.stringify({
      customerId: String(setup.customerId),
      etsyApiKey: body.etsyApiKey,
      shopName: setup.shopName,
      verifier,
      setupToken: token,
    }),
    { expirationTtl: 600 }
  );

  const redirectUri = `${c.env.WORKER_URL}/api/oauth/etsy/callback`;
  const authUrl = await buildAuthUrl(body.etsyApiKey, redirectUri, state, challenge);

  return c.json({ authUrl });
});
