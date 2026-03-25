import { Hono } from "hono";
import { Env } from "../env";
import {
  computeChallenge,
  buildAuthUrl,
  exchangeCode,
  extractUserIdFromToken,
  saveTokens,
} from "../auth/etsy-oauth";
import { getDb } from "../db/client";
import { shops, customers, setupTokens } from "../db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "../lib/crypto";

export const oauthRoutes = new Hono<{ Bindings: Env }>();

// Start OAuth flow - returns auth URL
oauthRoutes.get("/etsy/start", async (c) => {
  const customerId = c.req.query("customerId");
  const etsyApiKey = c.req.query("etsyApiKey");
  const shopName = c.req.query("shopName");

  if (!customerId || !etsyApiKey || !shopName) {
    return c.json({ error: "Missing customerId, etsyApiKey, or shopName" }, 400);
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

  // Store in KV with 10 min TTL
  await c.env.OAUTH_STATE.put(
    `oauth:${state}`,
    JSON.stringify({ customerId, etsyApiKey, shopName, verifier }),
    { expirationTtl: 600 }
  );

  const redirectUri = `${c.env.WORKER_URL}/api/oauth/etsy/callback`;
  const authUrl = await buildAuthUrl(etsyApiKey, redirectUri, state, challenge);

  return c.json({ authUrl, state });
});

// OAuth callback from Etsy
oauthRoutes.get("/etsy/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.html(callbackPage(false, `Authorization failed: ${error}`));
  }

  if (!code || !state) {
    return c.html(callbackPage(false, "Missing code or state"));
  }

  // Retrieve state from KV
  const stored = await c.env.OAUTH_STATE.get(`oauth:${state}`);
  if (!stored) {
    return c.html(callbackPage(false, "Invalid or expired state. Try again."));
  }

  // Delete state (one-time use)
  await c.env.OAUTH_STATE.delete(`oauth:${state}`);

  const { customerId, etsyApiKey, shopName, verifier, setupToken } = JSON.parse(stored);
  const redirectUri = `${c.env.WORKER_URL}/api/oauth/etsy/callback`;

  try {
    // Exchange code for tokens
    const tokenData = await exchangeCode(etsyApiKey, redirectUri, code, verifier);

    // Extract user ID and get shop ID
    const userId = extractUserIdFromToken(tokenData.access_token);

    // Fetch shop info from Etsy
    const shopResp = await fetch(
      `https://api.etsy.com/v3/application/users/${userId}/shops`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "x-api-key": etsyApiKey,
        },
      }
    );

    let etsyShopId: number | null = null;
    if (shopResp.ok) {
      const shopData = await shopResp.json() as any;
      if (Array.isArray(shopData)) {
        etsyShopId = shopData[0]?.shop_id ?? null;
      } else if (shopData.results) {
        etsyShopId = shopData.results[0]?.shop_id ?? null;
      } else {
        etsyShopId = shopData.shop_id ?? null;
      }
    }

    // Create shop record
    const db = getDb(c.env.DB);
    const encEtsyApiKey = await encrypt(etsyApiKey, c.env.ENCRYPTION_KEY);

    const [shop] = await db
      .insert(shops)
      .values({
        customerId: parseInt(customerId),
        name: shopName,
        etsyApiKey: encEtsyApiKey,
        etsyShopId,
        etsyUserId: userId,
        // Temporary defaults - will be updated in the next step
        veeqoChannelId: 0,
        veeqoWarehouseId: 0,
        veeqoDeliveryMethodId: 0,
      })
      .returning();

    // Save encrypted tokens
    await saveTokens(db, shop.id, tokenData, c.env.ENCRYPTION_KEY);

    // Mark setup token as used (if this came from a setup link)
    if (setupToken) {
      await db
        .update(setupTokens)
        .set({ used: true, shopId: shop.id })
        .where(eq(setupTokens.token, setupToken));
    }

    return c.html(callbackPage(true, undefined, shop.id, !!setupToken));
  } catch (e: any) {
    console.error("OAuth callback error:", e);
    return c.html(callbackPage(false, e.message || "Unknown error"));
  }
});

function callbackPage(success: boolean, error?: string, shopId?: number, fromSetup?: boolean): string {
  const message = success
    ? "Etsy connected successfully!"
    : `Connection failed: ${error}`;

  const subMessage = success
    ? fromSetup
      ? "Your Etsy shop is now connected. You can close this page."
      : "You can close this window."
    : "Please close this window and try again.";

  return `<!DOCTYPE html>
<html><head><title>Etsy-Veeqo Auth</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;">
<h2>${message}</h2>
<p>${subMessage}</p>
<script>
  if (window.opener) {
    window.opener.postMessage(${JSON.stringify({ success, error, shopId })}, "*");
    setTimeout(() => window.close(), 2000);
  }
</script>
</body></html>`;
}
