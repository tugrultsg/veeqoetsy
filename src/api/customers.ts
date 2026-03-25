import { Hono } from "hono";
import { Env } from "../env";
import { getDb } from "../db/client";
import { customers, shops, setupTokens } from "../db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";
import { VeeqoClient } from "../services/veeqo-client";

export const customerRoutes = new Hono<{ Bindings: Env }>();

// List all customers
customerRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const result = await db.select().from(customers).all();
  return c.json(result);
});

// Get single customer with shops
customerRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));

  const customer = await db.select().from(customers).where(eq(customers.id, id)).get();
  if (!customer) return c.json({ error: "Not found" }, 404);

  const customerShops = await db.select().from(shops).where(eq(shops.customerId, id)).all();

  return c.json({ ...customer, shops: customerShops });
});

// Create customer
customerRoutes.post("/", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ name: string; veeqoApiKey: string }>();

  // Verify Veeqo API key
  try {
    const veeqo = new VeeqoClient(body.veeqoApiKey);
    await veeqo.getChannels();
  } catch (e) {
    return c.json({ error: "Invalid Veeqo API key" }, 400);
  }

  const encKey = await encrypt(body.veeqoApiKey, c.env.ENCRYPTION_KEY);

  const [customer] = await db
    .insert(customers)
    .values({ name: body.name, veeqoApiKey: encKey })
    .returning();

  return c.json(customer, 201);
});

// Update customer
customerRoutes.put("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{ name?: string; active?: boolean }>();

  await db.update(customers).set(body).where(eq(customers.id, id));
  const updated = await db.select().from(customers).where(eq(customers.id, id)).get();

  return c.json(updated);
});

// Generate setup link for customer
customerRoutes.post("/:id/setup-link", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{ shopName: string }>();

  const customer = await db.select().from(customers).where(eq(customers.id, id)).get();
  if (!customer) return c.json({ error: "Customer not found" }, 404);

  // Generate random token
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(tokenBytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .substring(0, 48);

  // Expires in 24 hours
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db.insert(setupTokens).values({
    token,
    customerId: id,
    shopName: body.shopName,
    expiresAt,
  });

  const setupUrl = `${c.env.WORKER_URL}/setup/${token}`;
  return c.json({ url: setupUrl, token, expiresAt });
});

// List setup links for customer
customerRoutes.get("/:id/setup-links", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));

  const tokens = await db
    .select()
    .from(setupTokens)
    .where(eq(setupTokens.customerId, id))
    .all();

  return c.json(tokens);
});

// Soft-delete customer
customerRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));

  await db.update(customers).set({ active: false }).where(eq(customers.id, id));
  return c.json({ ok: true });
});
