import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { residentsTable, vendorsTable, ridersTable, agentsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { createHash } from "crypto";

const router: IRouter = Router();

const ADMIN_PIN = "1234";
const VENDOR_PIN = "5678";
const RIDER_PIN = "9012";
const AGENT_PIN = "3456";
const ACCOUNTANT_PIN = "2468";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

function verifyPin(input: string, stored: string | null, fallback: string): boolean {
  if (stored) {
    return hashPin(input) === stored;
  }
  return input === fallback;
}

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
        user: { id: 0, name: "Admin", phone, role: "admin" },
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
        user: { id: resident.id, name: resident.fullName, phone: resident.phone, role: "resident", photoUrl: resident.photoUrl },
        role: "resident",
        token: `resident-${resident.id}`,
      });
      return;
    }

    if (role === "vendor") {
      const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.phone, phone)).limit(1);
      if (!vendor) {
        res.status(401).json({ error: "unauthorized", message: "Vendor phone not found" });
        return;
      }
      if (!verifyPin(pin ?? "", vendor.pin, VENDOR_PIN)) {
        res.status(401).json({ error: "unauthorized", message: "Invalid vendor PIN" });
        return;
      }
      res.json({
        user: { id: vendor.id, name: vendor.name, phone: vendor.phone, role: "vendor", photoUrl: vendor.photoUrl },
        role: "vendor",
        token: `vendor-${vendor.id}`,
      });
      return;
    }

    if (role === "rider") {
      const [rider] = await db.select().from(ridersTable).where(eq(ridersTable.phone, phone)).limit(1);
      if (!rider) {
        res.status(401).json({ error: "unauthorized", message: "Rider phone not found" });
        return;
      }
      if (!verifyPin(pin ?? "", rider.pin, RIDER_PIN)) {
        res.status(401).json({ error: "unauthorized", message: "Invalid rider PIN" });
        return;
      }
      res.json({
        user: { id: rider.id, name: rider.name, phone: rider.phone, role: "rider", photoUrl: rider.photoUrl },
        role: "rider",
        token: `rider-${rider.id}`,
      });
      return;
    }

    if (role === "agent") {
      const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.phone, phone)).limit(1);
      if (!agent) {
        res.status(401).json({ error: "unauthorized", message: "Agent phone not found. Contact your admin." });
        return;
      }
      if (!agent.isActive) {
        res.status(401).json({ error: "unauthorized", message: "Your account has been suspended. Contact admin." });
        return;
      }
      if (!verifyPin(pin ?? "", agent.pin, AGENT_PIN)) {
        res.status(401).json({ error: "unauthorized", message: "Invalid PIN" });
        return;
      }
      res.json({
        user: { id: agent.id, name: agent.name, phone: agent.phone, role: "agent", photoUrl: agent.photoUrl },
        role: "agent",
        token: `agent-${agent.id}`,
      });
      return;
    }

    if (role === "accountant") {
      if (pin !== ACCOUNTANT_PIN) {
        res.status(401).json({ error: "unauthorized", message: "Invalid PIN" });
        return;
      }
      res.json({
        user: { id: 0, name: "Accountant", phone, role: "accountant" },
        role: "accountant",
        token: "accountant-token",
      });
      return;
    }

    res.status(400).json({ error: "bad_request", message: "Invalid role" });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
