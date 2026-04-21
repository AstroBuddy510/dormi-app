import { Router, type IRouter } from "express";
import { db } from "../../../../lib/db/src/index.js";
import { adminsTable } from "../../../../lib/db/src/schema/index.js";
import { eq, count } from "drizzle-orm";
import { createHash } from "crypto";
import { z } from "zod/v4";

const router: IRouter = Router();

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

const CreateAdminBody = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  pin: z.string().min(4).max(8),
});

const UpdateAdminBody = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(10).optional(),
  isActive: z.boolean().optional(),
});

const ChangePinBody = z.object({
  newPin: z.string().min(4).max(8),
});

/* GET /admin-accounts — list all admin accounts */
router.get("/", async (_req, res) => {
  try {
    const admins = await db
      .select({ id: adminsTable.id, name: adminsTable.name, phone: adminsTable.phone, isActive: adminsTable.isActive, createdAt: adminsTable.createdAt })
      .from(adminsTable)
      .orderBy(adminsTable.id);
    res.json(admins);
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

/* POST /admin-accounts — create new admin */
router.post("/", async (req, res) => {
  try {
    const { name, phone, pin } = CreateAdminBody.parse(req.body);
    const hashedPin = hashPin(pin);
    const [admin] = await db
      .insert(adminsTable)
      .values({ name, phone, pin: hashedPin })
      .returning({ id: adminsTable.id, name: adminsTable.name, phone: adminsTable.phone, isActive: adminsTable.isActive, createdAt: adminsTable.createdAt });
    res.status(201).json(admin);
  } catch (err: any) {
    if (err.message?.includes("unique")) {
      res.status(409).json({ error: "conflict", message: "A phone number must be unique. This number is already registered to another admin." });
      return;
    }
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

/* PUT /admin-accounts/:id — update name, phone, isActive */
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = UpdateAdminBody.parse(req.body);

    if (updates.isActive === false) {
      const [{ total }] = await db.select({ total: count() }).from(adminsTable).where(eq(adminsTable.isActive, true));
      if (total <= 1) {
        res.status(400).json({ error: "bad_request", message: "Cannot deactivate the last active admin." });
        return;
      }
    }

    const [updated] = await db
      .update(adminsTable)
      .set(updates)
      .where(eq(adminsTable.id, id))
      .returning({ id: adminsTable.id, name: adminsTable.name, phone: adminsTable.phone, isActive: adminsTable.isActive, createdAt: adminsTable.createdAt });

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Admin not found" });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    if (err.message?.includes("unique")) {
      res.status(409).json({ error: "conflict", message: "A phone number must be unique. This number is already registered to another admin." });
      return;
    }
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

/* PUT /admin-accounts/:id/pin — change PIN */
router.put("/:id/pin", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { newPin } = ChangePinBody.parse(req.body);
    const hashed = hashPin(newPin);
    const [updated] = await db
      .update(adminsTable)
      .set({ pin: hashed })
      .where(eq(adminsTable.id, id))
      .returning({ id: adminsTable.id });
    if (!updated) {
      res.status(404).json({ error: "not_found", message: "Admin not found" });
      return;
    }
    res.json({ success: true, message: "PIN updated successfully." });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

/* DELETE /admin-accounts/:id — remove admin */
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [{ total }] = await db.select({ total: count() }).from(adminsTable);
    if (total <= 1) {
      res.status(400).json({ error: "bad_request", message: "Cannot delete the last admin account." });
      return;
    }
    await db.delete(adminsTable).where(eq(adminsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

export default router;
