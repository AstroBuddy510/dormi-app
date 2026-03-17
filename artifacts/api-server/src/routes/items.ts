import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { itemsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { UpdateItemPriceBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const category = req.query.category as string | undefined;
  const rows = category
    ? await db.select().from(itemsTable).where(eq(itemsTable.category, category)).orderBy(itemsTable.name)
    : await db.select().from(itemsTable).orderBy(itemsTable.category, itemsTable.name);
  res.json(rows.map(mapItem));
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

function mapItem(i: typeof itemsTable.$inferSelect) {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    price: parseFloat(i.price),
    unit: i.unit,
    vendorCategory: i.vendorCategory,
  };
}

export default router;
