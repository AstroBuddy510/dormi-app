import { Router } from "express";
import { db } from "../../../lib/db/src/index.js";
import { riderMessagesTable } from "../../../lib/db/src/index.js";
import { eq, desc, isNull } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { riderId } = req.query;
    let query = db.select().from(riderMessagesTable).orderBy(desc(riderMessagesTable.createdAt));
    const msgs = riderId
      ? await db.select().from(riderMessagesTable)
          .where(eq(riderMessagesTable.riderId, parseInt(riderId as string)))
          .orderBy(riderMessagesTable.createdAt)
      : await db.select().from(riderMessagesTable).orderBy(desc(riderMessagesTable.createdAt));
    res.json(msgs);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.get("/unread-count", async (_req, res) => {
  try {
    const unread = await db.select()
      .from(riderMessagesTable)
      .where(isNull(riderMessagesTable.readAt));
    const byRider: Record<number, number> = {};
    unread.forEach(m => {
      byRider[m.riderId] = (byRider[m.riderId] ?? 0) + 1;
    });
    const total = unread.filter(m => m.senderRole === 'rider').length;
    res.json({ total, byRider });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { riderId, senderRole, senderName, content } = req.body;
    if (!riderId || !content) {
      res.status(400).json({ error: "bad_request", message: "riderId and content required" });
      return;
    }
    const [msg] = await db.insert(riderMessagesTable).values({
      riderId: parseInt(riderId),
      senderRole: senderRole ?? 'rider',
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
    const [msg] = await db.update(riderMessagesTable)
      .set({ readAt: new Date() })
      .where(eq(riderMessagesTable.id, parseInt(req.params.id)))
      .returning();
    res.json(msg);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

router.post("/:id/reply", async (req, res) => {
  try {
    const original = await db.select().from(riderMessagesTable)
      .where(eq(riderMessagesTable.id, parseInt(req.params.id)));
    if (!original.length) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const { content } = req.body;
    await db.update(riderMessagesTable)
      .set({ readAt: new Date() })
      .where(eq(riderMessagesTable.id, parseInt(req.params.id)));
    const [reply] = await db.insert(riderMessagesTable).values({
      riderId: original[0].riderId,
      senderRole: 'admin',
      senderName: 'Admin',
      content,
    }).returning();
    res.status(201).json(reply);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

export default router;
