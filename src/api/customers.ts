import { Hono } from "hono";
import { Env } from "../env";
import { getDb } from "../db/client";
import { customers, shops } from "../db/schema";
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

// Soft-delete customer
customerRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));

  await db.update(customers).set({ active: false }).where(eq(customers.id, id));
  return c.json({ ok: true });
});
