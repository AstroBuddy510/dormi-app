import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { residentsTable, vendorsTable, ridersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";

const router: IRouter = Router();

const ADMIN_PHONE = "0000000000";
const ADMIN_PIN = "1234";
const VENDOR_PIN = "5678";
const RIDER_PIN = "9012";

router.post("/login", async (req, res) => {
  try {
    const body = LoginBody.parse(req.body);
    const { phone, role, pin } = body;

    if (role === "admin") {
      if (pin !== ADMIN_PIN) {
        res.status(401).json({ error: "unauthorized", message: "Invalid PIN" });
        return;
      }
      res.json({
        user: { id: 0, name: "Admin", phone: ADMIN_PHONE, role: "admin" },
        role: "admin",
        token: "admin-token",
      });
      return;
    }

    if (role === "resident") {
      const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.phone, phone)).limit(1);
      if (!resident) {
        res.status(401).json({ error: "unauthorized", message: "Phone not registered. Please sign up first." });
        return;
      }
      res.json({
        user: { id: resident.id, name: resident.fullName, phone: resident.phone, role: "resident" },
        role: "resident",
        token: `resident-${resident.id}`,
      });
      return;
    }

    if (role === "vendor") {
      if (pin !== VENDOR_PIN) {
        res.status(401).json({ error: "unauthorized", message: "Invalid vendor PIN" });
        return;
      }
      const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.phone, phone)).limit(1);
      if (!vendor) {
        res.status(401).json({ error: "unauthorized", message: "Vendor phone not found" });
        return;
      }
      res.json({
        user: { id: vendor.id, name: vendor.name, phone: vendor.phone, role: "vendor" },
        role: "vendor",
        token: `vendor-${vendor.id}`,
      });
      return;
    }

    if (role === "rider") {
      if (pin !== RIDER_PIN) {
        res.status(401).json({ error: "unauthorized", message: "Invalid rider PIN" });
        return;
      }
      const [rider] = await db.select().from(ridersTable).where(eq(ridersTable.phone, phone)).limit(1);
      if (!rider) {
        res.status(401).json({ error: "unauthorized", message: "Rider phone not found" });
        return;
      }
      res.json({
        user: { id: rider.id, name: rider.name, phone: rider.phone, role: "rider" },
        role: "rider",
        token: `rider-${rider.id}`,
      });
      return;
    }

    res.status(400).json({ error: "bad_request", message: "Invalid role" });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
