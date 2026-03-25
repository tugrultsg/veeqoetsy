import { encrypt, decrypt } from "../lib/crypto";
import { Env } from "../env";
import { Database } from "../db/client";
import { etsyTokens, shops } from "../db/schema";
import { eq } from "drizzle-orm";

const ETSY_AUTH_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";

const REQUIRED_SCOPES = [
  "transactions_r",
  "transactions_w",
  "listings_r",
  "listings_w",
  "shops_r",
];

export function generatePkce(): { verifier: string; challenge: string } {
  const array = crypto.getRandomValues(new Uint8Array(64));
  const verifier = Array.from(array)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .substring(0, 96);

  // We'll compute challenge async separately
  return { verifier, challenge: "" }; // challenge computed in buildAuthUrl
}

export async function computeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function buildAuthUrl(
  apiKey: string,
  redirectUri: string,
  state: string,
  codeChallenge: string
): Promise<string> {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: apiKey,
    redirect_uri: redirectUri,
    scope: REQUIRED_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${ETSY_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  apiKey: string,
  redirectUri: string,
  code: string,
  codeVerifier: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const resp = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: apiKey,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }

  return resp.json();
}

export async function refreshAccessToken(
  apiKey: string,
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const resp = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: apiKey,
      refresh_token: refreshToken,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token refresh failed: ${resp.status} ${text}`);
  }

  return resp.json();
}

export async function saveTokens(
  db: Database,
  shopId: number,
  tokenData: { access_token: string; refresh_token: string; expires_in: number },
  encryptionKey: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  const encAccessToken = await encrypt(tokenData.access_token, encryptionKey);
  const encRefreshToken = await encrypt(tokenData.refresh_token, encryptionKey);

  const existing = await db
    .select()
    .from(etsyTokens)
    .where(eq(etsyTokens.shopId, shopId))
    .get();

  if (existing) {
    await db
      .update(etsyTokens)
      .set({
        accessToken: encAccessToken,
        refreshToken: encRefreshToken,
        expiresAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(etsyTokens.shopId, shopId));
  } else {
    await db.insert(etsyTokens).values({
      shopId,
      accessToken: encAccessToken,
      refreshToken: encRefreshToken,
      expiresAt,
    });
  }
}

export async function ensureValidToken(
  db: Database,
  env: Env,
  shopId: number
): Promise<string> {
  const token = await db
    .select()
    .from(etsyTokens)
    .where(eq(etsyTokens.shopId, shopId))
    .get();

  if (!token) {
    throw new Error(`No Etsy token for shop ${shopId}`);
  }

  const now = Date.now();
  const expiresAt = new Date(token.expiresAt).getTime();

  // Refresh if expiring within 5 minutes
  if (now >= expiresAt - 5 * 60 * 1000) {
    const shop = await db
      .select()
      .from(shops)
      .where(eq(shops.id, shopId))
      .get();

    if (!shop) throw new Error(`Shop ${shopId} not found`);

    const apiKey = await decrypt(shop.etsyApiKey, env.ENCRYPTION_KEY);
    const refreshTokenPlain = await decrypt(token.refreshToken, env.ENCRYPTION_KEY);

    const newTokenData = await refreshAccessToken(apiKey, refreshTokenPlain);
    await saveTokens(db, shopId, newTokenData, env.ENCRYPTION_KEY);

    return newTokenData.access_token;
  }

  return decrypt(token.accessToken, env.ENCRYPTION_KEY);
}

export function extractUserIdFromToken(accessToken: string): number {
  const parts = accessToken.split(".");
  if (parts.length >= 1 && /^\d+$/.test(parts[0])) {
    return parseInt(parts[0], 10);
  }
  throw new Error("Cannot extract user_id from access token");
}
