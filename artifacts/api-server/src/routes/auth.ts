import { Router, type IRouter } from "express";
import { db } from "../../../lib/db/src/index.js";
import { residentsTable, vendorsTable, ridersTable, agentsTable, financeSettingsTable, adminsTable } from "../../../lib/db/src/schema/index.js";
import { eq, count } from "drizzle-orm";
import { LoginBody } from "../../../lib/api-zod/src/index.js";
import { createHash } from "crypto";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dormi-secret-key-2026-change-me";

const router: IRouter = Router();

const ADMIN_PIN  = "1234";
const VENDOR_PIN = "5678";
const RIDER_PIN  = "9012";
const AGENT_PIN  = "3456";
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

async function getAccountantPin(): Promise<string | null> {
  const [settings] = await db.select({ accountantPin: financeSettingsTable.accountantPin }).from(financeSettingsTable).limit(1);
  return settings?.accountantPin ?? null;
}

/* ── Auto-seed default admin if table is empty ──────────────────────────── */
export async function seedDefaultAdmin() {
  try {
    const [{ total }] = await db.select({ total: count() }).from(adminsTable);
    if (total === 0) {
      await db.insert(adminsTable).values({
        name: "Admin",
        phone: "0244567890",
        pin: hashPin(ADMIN_PIN),
      });
      console.log("[auth] Default admin seeded — phone: 0244567890, PIN: 1234");
    }
  } catch (err) {
    console.error("[auth] Failed to seed default admin:", err);
  }
}

router.post("/login", async (req, res) => {
  try {
    const body = LoginBody.parse(req.body);
    const { phone, role, pin } = body;

    if (role === "admin") {
      const [{ total }] = await db.select({ total: count() }).from(adminsTable);

      if (total === 0) {
        /* Legacy fallback: no admins in DB yet — any phone + default PIN */
        if (pin !== ADMIN_PIN) {
          res.status(401).json({ error: "unauthorized", message: "Invalid PIN" });
          return;
        }
        const token = jwt.sign(
          { id: 0, name: "Admin", phone, role: "admin" },
          JWT_SECRET,
          { expiresIn: "7d" }
        );
        res.json({ user: { id: 0, name: "Admin", phone, role: "admin" }, role: "admin", token });
        return;
      }

      /* DB-backed admin login */
      const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.phone, phone)).limit(1);
      if (!admin) {
        res.status(401).json({ error: "unauthorized", message: "Phone number not registered as admin." });
        return;
      }
      if (!admin.isActive) {
        res.status(401).json({ error: "unauthorized", message: "Your admin account has been suspended." });
        return;
      }
      if (!verifyPin(pin ?? "", admin.pin, ADMIN_PIN)) {
        res.status(401).json({ error: "unauthorized", message: "Invalid PIN" });
        return;
      }
      const token = jwt.sign(
        { id: admin.id, name: admin.name, phone: admin.phone, role: "admin" },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      res.json({
        user: { id: admin.id, name: admin.name, phone: admin.phone, role: "admin" },
        role: "admin",
        token,
      });
      return;
    }

    if (role === "resident") {
      const [resident] = await db.select().from(residentsTable).where(eq(residentsTable.phone, phone)).limit(1);
      if (!resident) {
        res.status(401).json({ error: "unauthorized", message: "Phone not registered. Please sign up first." });
        return;
      }
      const token = jwt.sign(
        { id: resident.id, name: resident.fullName, phone: resident.phone, role: "resident" },
        JWT_SECRET,
        { expiresIn: "30d" }
      );
      res.json({
        user: { id: resident.id, name: resident.fullName, phone: resident.phone, role: "resident", photoUrl: resident.photoUrl },
        role: "resident",
        token,
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
      const token = jwt.sign(
        { id: vendor.id, name: vendor.name, phone: vendor.phone, role: "vendor" },
        JWT_SECRET,
        { expiresIn: "14d" }
      );
      res.json({
        user: { id: vendor.id, name: vendor.name, phone: vendor.phone, role: "vendor", photoUrl: vendor.photoUrl },
        role: "vendor",
        token,
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
      const token = jwt.sign(
        { id: rider.id, name: rider.name, phone: rider.phone, role: "rider" },
        JWT_SECRET,
        { expiresIn: "14d" }
      );
      res.json({
        user: { id: rider.id, name: rider.name, phone: rider.phone, role: "rider", photoUrl: rider.photoUrl },
        role: "rider",
        token,
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
      const token = jwt.sign(
        { id: agent.id, name: agent.name, phone: agent.phone, role: "agent" },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      res.json({
        user: { id: agent.id, name: agent.name, phone: agent.phone, role: "agent", photoUrl: agent.photoUrl },
        role: "agent",
        token,
      });
      return;
    }

    if (role === "accountant") {
      const storedPin = await getAccountantPin();
      if (!verifyPin(pin ?? "", storedPin, ACCOUNTANT_PIN)) {
        res.status(401).json({ error: "unauthorized", message: "Invalid PIN" });
        return;
      }
      const token = jwt.sign(
        { id: 0, name: "Accountant", phone, role: "accountant" },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      res.json({
        user: { id: 0, name: "Accountant", phone, role: "accountant" },
        role: "accountant",
        token,
      });
      return;
    }

    res.status(400).json({ error: "bad_request", message: "Invalid role" });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

/* Admin: reset accountant PIN */
router.put("/reset-accountant-pin", async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || pin.length < 4) {
      res.status(400).json({ error: "bad_request", message: "PIN must be at least 4 digits" });
      return;
    }
    const hashed = hashPin(pin);
    let [settings] = await db.select().from(financeSettingsTable).limit(1);
    if (!settings) {
      [settings] = await db.insert(financeSettingsTable).values({ accountantPin: hashed }).returning();
    } else {
      [settings] = await db.update(financeSettingsTable)
        .set({ accountantPin: hashed, updatedAt: new Date() })
        .where(eq(financeSettingsTable.id, settings.id))
        .returning();
    }
    res.json({ success: true, message: "Accountant PIN updated" });
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
