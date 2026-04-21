import { Router, type IRouter } from "express";
import { db } from "../../../lib/db/src/index.js";
import { agentMessagesTable, residentsTable, agentsTable } from "../../../lib/db/src/schema/index.js";
import { eq, and, desc, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

// GET /api/agent-messages?residentId=&agentId=   — thread messages
router.get("/", async (req, res) => {
  try {
    const residentId = parseInt(req.query.residentId as string);
    const agentId = parseInt(req.query.agentId as string);
    if (isNaN(residentId) || isNaN(agentId)) {
      res.status(400).json({ error: "residentId and agentId are required" });
      return;
    }
    const messages = await db
      .select()
      .from(agentMessagesTable)
      .where(and(
        eq(agentMessagesTable.residentId, residentId),
        eq(agentMessagesTable.agentId, agentId),
      ))
      .orderBy(agentMessagesTable.createdAt);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agent-messages/conversations?agentId=   — all threads for an agent
router.get("/conversations", async (req, res) => {
  try {
    const agentId = req.query.agentId ? parseInt(req.query.agentId as string) : null;
    const residentId = req.query.residentId ? parseInt(req.query.residentId as string) : null;

    if (!agentId && !residentId) {
      res.status(400).json({ error: "agentId or residentId required" });
      return;
    }

    // Get all messages for this party
    const rows = agentId
      ? await db.select().from(agentMessagesTable).where(eq(agentMessagesTable.agentId, agentId)).orderBy(desc(agentMessagesTable.createdAt))
      : await db.select().from(agentMessagesTable).where(eq(agentMessagesTable.residentId, residentId!)).orderBy(desc(agentMessagesTable.createdAt));

    // Group by the "other" party
    const seen = new Set<string>();
    const conversations: any[] = [];

    for (const msg of rows) {
      const key = `${msg.residentId}:${msg.agentId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Count unread for the requesting party
      const unreadRole = agentId ? 'resident' : 'agent';
      const unread = rows.filter(
        m => m.residentId === msg.residentId && m.agentId === msg.agentId && m.senderRole === unreadRole && !m.readAt
      ).length;

      conversations.push({ residentId: msg.residentId, agentId: msg.agentId, latestMessage: msg, unread });
    }

    // Enrich with names
    const enriched = await Promise.all(conversations.map(async (conv) => {
      const [resident] = await db.select({ fullName: residentsTable.fullName, phone: residentsTable.phone })
        .from(residentsTable).where(eq(residentsTable.id, conv.residentId)).limit(1);
      const [agent] = await db.select({ name: agentsTable.name })
        .from(agentsTable).where(eq(agentsTable.id, conv.agentId)).limit(1);
      return { ...conv, residentName: resident?.fullName ?? 'Unknown', residentPhone: resident?.phone ?? '', agentName: agent?.name ?? 'Agent' };
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const SendMessageBody = z.object({
  residentId: z.number().int(),
  agentId: z.number().int(),
  senderRole: z.enum(["agent", "resident"]),
  senderName: z.string().optional(),
  content: z.string().min(1),
});

// POST /api/agent-messages   — send a message
router.post("/", async (req, res) => {
  try {
    const body = SendMessageBody.parse(req.body);
    const [msg] = await db.insert(agentMessagesTable).values({
      residentId: body.residentId,
      agentId: body.agentId,
      senderRole: body.senderRole,
      senderName: body.senderName ?? null,
      content: body.content,
    }).returning();
    res.status(201).json(msg);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/agent-messages/:id/read   — mark a message as read
router.put("/:id/read", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [msg] = await db.update(agentMessagesTable)
      .set({ readAt: new Date() })
      .where(eq(agentMessagesTable.id, id))
      .returning();
    if (!msg) { res.status(404).json({ error: "not_found" }); return; }
    res.json(msg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/agent-messages/read-all?residentId=&agentId=&role=   — mark all as read
router.put("/read-all", async (req, res) => {
  try {
    const residentId = parseInt(req.query.residentId as string);
    const agentId = parseInt(req.query.agentId as string);
    const role = req.query.role as string;
    await db.update(agentMessagesTable)
      .set({ readAt: new Date() })
      .where(and(
        eq(agentMessagesTable.residentId, residentId),
        eq(agentMessagesTable.agentId, agentId),
        eq(agentMessagesTable.senderRole, role),
        sql`read_at IS NULL`,
      ));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
