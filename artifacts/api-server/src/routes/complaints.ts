import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { complaintsTable, agentsTable, residentsTable } from "../../../../lib/db/src/schema/index.js";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

async function enrichComplaint(c: typeof complaintsTable.$inferSelect) {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, c.agentId)).limit(1);
  return {
    id: c.id,
    agentId: c.agentId,
    agentName: agent?.name ?? "Unknown",
    residentId: c.residentId,
    residentName: c.residentName,
    residentPhone: c.residentPhone,
    subject: c.subject,
    description: c.description,
    priority: c.priority,
    status: c.status,
    adminNotes: c.adminNotes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/", async (req, res) => {
  const { agentId, status } = req.query;
  let rows = await db.select().from(complaintsTable).orderBy(desc(complaintsTable.createdAt));
  if (agentId) rows = rows.filter(c => c.agentId === parseInt(agentId as string));
  if (status) rows = rows.filter(c => c.status === status);
  const enriched = await Promise.all(rows.map(enrichComplaint));
  res.json(enriched);
});

router.post("/", async (req, res) => {
  try {
    const { agentId, residentId, residentName, residentPhone, subject, description, priority } = req.body;
    if (!agentId || !subject || !description) {
      res.status(400).json({ error: "bad_request", message: "agentId, subject and description are required" });
      return;
    }
    let rName = residentName;
    let rPhone = residentPhone;
    if (residentId && !rName) {
      const [r] = await db.select().from(residentsTable).where(eq(residentsTable.id, parseInt(residentId))).limit(1);
      rName = r?.fullName;
      rPhone = r?.phone;
    }
    const [complaint] = await db.insert(complaintsTable).values({
      agentId: parseInt(agentId),
      residentId: residentId ? parseInt(residentId) : null,
      residentName: rName ?? null,
      residentPhone: rPhone ?? null,
      subject,
      description,
      priority: priority ?? "normal",
      status: "open",
    }).returning();
    res.status(201).json(await enrichComplaint(complaint));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, adminNotes, priority } = req.body;
    const [complaint] = await db.update(complaintsTable)
      .set({
        ...(status && { status }),
        ...(adminNotes !== undefined && { adminNotes }),
        ...(priority && { priority }),
        updatedAt: new Date(),
      })
      .where(eq(complaintsTable.id, id))
      .returning();
    if (!complaint) {
      res.status(404).json({ error: "not_found", message: "Complaint not found" });
      return;
    }
    res.json(await enrichComplaint(complaint));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
