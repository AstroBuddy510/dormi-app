import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { itemsTable, itemRequestsTable } from "../../../../lib/db/src/schema/index.js";
import { eq, desc, inArray } from "drizzle-orm";
import { UpdateItemPriceBody } from "../../../../lib/api-zod/src/index.js";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── Items CRUD ───────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const category = req.query.category as string | undefined;
  const rows = category
    ? await db.select().from(itemsTable).where(eq(itemsTable.category, category)).orderBy(itemsTable.name)
    : await db.select().from(itemsTable).orderBy(itemsTable.category, itemsTable.name);
  res.json(rows.map(mapItem));
});

const AddItemBody = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  price: z.number().positive(),
  unit: z.string().min(1).default("1 unit"),
  vendorCategory: z.string().optional(),
  brands: z.array(z.string()).optional().default([]),
  imageUrl: z.string().optional(),
});

router.post("/", async (req, res) => {
  try {
    const body = AddItemBody.parse(req.body);
    const [item] = await db.insert(itemsTable).values({
      name: body.name,
      category: body.category,
      price: body.price.toString(),
      unit: body.unit,
      vendorCategory: body.vendorCategory ?? null,
      brands: body.brands ?? [],
      imageUrl: body.imageUrl ?? null,
    }).returning();
    res.status(201).json(mapItem(item));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

const UpdateItemBody = z.object({
  name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  unit: z.string().min(1).optional(),
  brands: z.array(z.string()).optional(),
  imageUrl: z.string().optional().nullable(),
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateItemBody.parse(req.body);
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined)     updates.name = body.name;
    if (body.category !== undefined) updates.category = body.category;
    if (body.price !== undefined)    updates.price = body.price.toString();
    if (body.unit !== undefined)     updates.unit = body.unit;
    if (body.brands !== undefined)   updates.brands = body.brands;
    if ("imageUrl" in body)          updates.imageUrl = body.imageUrl ?? null;
    const [item] = await db.update(itemsTable).set(updates).where(eq(itemsTable.id, id)).returning();
    if (!item) {
      res.status(404).json({ error: "not_found", message: "Item not found" });
      return;
    }
    res.json(mapItem(item));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id/price", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateItemPriceBody.parse(req.body);
    const [item] = await db.update(itemsTable)
      .set({ price: body.price.toString(), updatedAt: new Date() })
      .where(eq(itemsTable.id, id))
      .returning();
    if (!item) {
      res.status(404).json({ error: "not_found", message: "Item not found" });
      return;
    }
    res.json(mapItem(item));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [item] = await db.delete(itemsTable).where(eq(itemsTable.id, id)).returning();
    if (!item) {
      res.status(404).json({ error: "not_found", message: "Item not found" });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// Bulk delete — accepts { ids: number[] } and removes them in one query.
// Using POST instead of DELETE because DELETE requests with bodies are
// inconsistently supported across proxies / the fetch spec.
const BulkDeleteBody = z.object({ ids: z.array(z.number().int()).min(1).max(500) });

router.post("/bulk-delete", async (req, res) => {
  try {
    const { ids } = BulkDeleteBody.parse(req.body);
    const deleted = await db.delete(itemsTable).where(inArray(itemsTable.id, ids)).returning();
    res.json({ success: true, deletedCount: deleted.length, deletedIds: deleted.map(d => d.id) });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// ─── Item Requests ────────────────────────────────────────────────────────────

router.get("/requests", async (req, res) => {
  const rows = await db.select().from(itemRequestsTable).orderBy(desc(itemRequestsTable.createdAt));
  res.json(rows);
});

const RequestItemBody = z.object({
  residentId: z.number().optional(),
  residentName: z.string().default("Anonymous"),
  itemName: z.string().min(1),
  description: z.string().optional(),
});

router.post("/requests", async (req, res) => {
  try {
    const body = RequestItemBody.parse(req.body);
    const [row] = await db.insert(itemRequestsTable).values({
      residentId: body.residentId ?? null,
      residentName: body.residentName,
      itemName: body.itemName,
      description: body.description ?? null,
      status: "pending",
    }).returning();
    res.status(201).json(row);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

const UpdateRequestBody = z.object({
  status: z.enum(["pending", "added", "rejected"]),
});

router.patch("/requests/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateRequestBody.parse(req.body);
    const [row] = await db.update(itemRequestsTable)
      .set({ status: body.status })
      .where(eq(itemRequestsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "not_found", message: "Request not found" });
      return;
    }
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

function mapItem(i: typeof itemsTable.$inferSelect) {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    price: parseFloat(i.price),
    unit: i.unit,
    vendorCategory: i.vendorCategory,
    brands: i.brands ?? [],
    imageUrl: i.imageUrl ?? null,
  };
}

export default router;
