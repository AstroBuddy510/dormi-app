import { Router } from "express";
import { db } from "../../../lib/db/src/index.js";
import { vendorMessagesTable } from "../../../lib/db/src/index.js";
import { eq, desc, isNull } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { vendorId } = req.query;
    const msgs = vendorId
      ? await db.select().from(vendorMessagesTable)
          .where(eq(vendorMessagesTable.vendorId, parseInt(vendorId as string)))
          .orderBy(vendorMessagesTable.createdAt)
      : await db.select().from(vendorMessagesTable).orderBy(desc(vendorMessagesTable.createdAt));
    res.json(msgs);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.get("/unread-count", async (_req, res) => {
  try {
    const unread = await db.select()
      .from(vendorMessagesTable)
      .where(isNull(vendorMessagesTable.readAt));
    const total = unread.filter(m => m.senderRole === 'vendor').length;
    const byVendor: Record<number, number> = {};
    unread.forEach(m => {
      byVendor[m.vendorId] = (byVendor[m.vendorId] ?? 0) + 1;
    });
    res.json({ total, byVendor });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { vendorId, senderRole, senderName, content } = req.body;
    if (!vendorId || !content) {
      res.status(400).json({ error: "bad_request", message: "vendorId and content required" });
      return;
    }
    const [msg] = await db.insert(vendorMessagesTable).values({
      vendorId: parseInt(vendorId),
      senderRole: senderRole ?? 'vendor',
      senderName: senderName ?? null,
      content,
    }).returning();
    res.status(201).json(msg);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.put("/:id/read", async (req, res) => {
  try {
    const [msg] = await db.update(vendorMessagesTable)
      .set({ readAt: new Date() })
      .where(eq(vendorMessagesTable.id, parseInt(req.params.id)))
      .returning();
    res.json(msg);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.post("/:id/reply", async (req, res) => {
  try {
    const original = await db.select().from(vendorMessagesTable)
      .where(eq(vendorMessagesTable.id, parseInt(req.params.id)));
    if (!original.length) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const { content } = req.body;
    await db.update(vendorMessagesTable)
      .set({ readAt: new Date() })
      .where(eq(vendorMessagesTable.id, parseInt(req.params.id)));
    const [reply] = await db.insert(vendorMessagesTable).values({
      vendorId: original[0].vendorId,
      senderRole: 'admin',
      senderName: 'Dormi Support',
      content,
    }).returning();
    res.status(201).json(reply);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

export default router;
