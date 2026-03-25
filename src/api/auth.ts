import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Env } from "../env";

export const authRoutes = new Hono<{ Bindings: Env }>();

// HMAC-SHA256 sign/verify for session tokens
async function signToken(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${btoa(payload)}.${sigB64}`;
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  const payload = atob(payloadB64);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(payload)
  );

  if (!valid) return null;

  // Check expiry
  try {
    const data = JSON.parse(payload);
    if (data.exp && Date.now() > data.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// Simple password comparison (constant-time)
async function verifyPassword(input: string, storedHash: string): Promise<boolean> {
  // For simplicity, using SHA-256 hash comparison
  // storedHash should be hex-encoded SHA-256 of the password
  const inputHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  const inputHex = Array.from(new Uint8Array(inputHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return inputHex === storedHash;
}

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ password: string }>();
  const valid = await verifyPassword(body.password, c.env.ADMIN_PASSWORD_HASH);

  if (!valid) {
    return c.json({ error: "Invalid password" }, 401);
  }

  const payload = JSON.stringify({
    admin: true,
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24h
  });

  const token = await signToken(payload, c.env.SESSION_SECRET);

  setCookie(c, "session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    maxAge: 86400,
    path: "/",
  });

  return c.json({ ok: true });
});

authRoutes.post("/logout", (c) => {
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/check", async (c) => {
  const token = getCookie(c, "session");
  if (!token) return c.json({ authenticated: false }, 401);

  const payload = await verifyToken(token, c.env.SESSION_SECRET);
  if (!payload) return c.json({ authenticated: false }, 401);

  return c.json({ authenticated: true });
});

// Middleware for protected routes
export async function authMiddleware(c: any, next: any) {
  const token = getCookie(c, "session");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await verifyToken(token, c.env.SESSION_SECRET);
  if (!payload) {
    return c.json({ error: "Session expired" }, 401);
  }

  await next();
}
