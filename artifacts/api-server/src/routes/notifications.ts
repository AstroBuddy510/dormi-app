import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, or, isNull, desc, and, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const CreateSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  type: z.enum(["info", "order", "promo", "alert"]).default("info"),
  residentId: z.number().int().optional().nullable(),
});

// GET /notifications?residentId=X — fetch for a resident (targeted + broadcast)
router.get("/", async (req: Request, res: Response) => {
  const residentId = parseInt(req.query.residentId as string);
  if (isNaN(residentId)) {
    res.status(400).json({ error: "residentId required" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(or(eq(notificationsTable.residentId, residentId), isNull(notificationsTable.residentId)))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);

    const unread = rows.filter(r => !r.readAt).length;
    res.json({ notifications: rows, unread });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /notifications/all — admin: list all (newest first)
router.get("/all", async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /notifications — admin creates a notification
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }
  try {
    const { title, body, type, residentId } = parsed.data;
    const [row] = await db
      .insert(notificationsTable)
      .values({ title, body, type, residentId: residentId ?? null })
      .returning();
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /notifications/:id/read — mark single notification as read
router.put("/:id/read", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [row] = await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(and(eq(notificationsTable.id, id), isNull(notificationsTable.readAt)))
      .returning();
    res.json(row ?? { id, alreadyRead: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /notifications/read-all — mark all unread as read for a resident
router.put("/read-all", async (req: Request, res: Response) => {
  const residentId = parseInt(req.body.residentId);
  if (isNaN(residentId)) { res.status(400).json({ error: "residentId required" }); return; }
  try {
    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          or(eq(notificationsTable.residentId, residentId), isNull(notificationsTable.residentId)),
          isNull(notificationsTable.readAt)
        )
      );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /notifications/:id — admin removes a notification
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
