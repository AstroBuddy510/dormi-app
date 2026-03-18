import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { employeesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const EmployeeBody = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().min(1),
  bankMomoDetails: z.string().optional(),
  salaryType: z.enum(["monthly", "daily"]).default("monthly"),
  salaryAmount: z.number().min(0),
  dailyFloat: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

router.get("/", async (_req, res) => {
  const employees = await db.select().from(employeesTable).orderBy(employeesTable.name);
  res.json(employees.map(mapEmployee));
});

router.post("/", async (req, res) => {
  try {
    const body = EmployeeBody.parse(req.body);
    const [employee] = await db.insert(employeesTable).values({
      name: body.name,
      role: body.role,
      phone: body.phone,
      bankMomoDetails: body.bankMomoDetails,
      salaryType: body.salaryType,
      salaryAmount: body.salaryAmount.toString(),
      dailyFloat: body.dailyFloat != null ? body.dailyFloat.toString() : "0.00",
      isActive: body.isActive ?? true,
    }).returning();
    res.status(201).json(mapEmployee(employee));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = EmployeeBody.partial().parse(req.body);
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.role !== undefined) updates.role = body.role;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.bankMomoDetails !== undefined) updates.bankMomoDetails = body.bankMomoDetails;
    if (body.salaryType !== undefined) updates.salaryType = body.salaryType;
    if (body.salaryAmount !== undefined) updates.salaryAmount = body.salaryAmount.toString();
    if (body.dailyFloat !== undefined) updates.dailyFloat = body.dailyFloat.toString();
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    const [employee] = await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id)).returning();
    if (!employee) { res.status(404).json({ error: "not_found" }); return; }
    res.json(mapEmployee(employee));
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(employeesTable).where(eq(employeesTable.id, id));
  res.json({ ok: true });
});

function mapEmployee(e: typeof employeesTable.$inferSelect) {
  return {
    id: e.id,
    name: e.name,
    role: e.role,
    phone: e.phone,
    bankMomoDetails: e.bankMomoDetails,
    salaryType: e.salaryType,
    salaryAmount: parseFloat(e.salaryAmount),
    dailyFloat: e.dailyFloat ? parseFloat(e.dailyFloat) : 0,
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
  };
}

export default router;
