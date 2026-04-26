import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { authenticate, authorize } from "../middlewares/auth.js";
import { listLocks, lockPeriod, unlockPeriod, isPeriodLocked } from "../lib/periodLocks.js";

const router: IRouter = Router();

// All period-lock endpoints are admin-only.
router.use(authenticate, authorize(["admin"]));

// GET /period-locks — list all locks (active by default)
router.get("/", async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly !== "false"; // default true
    const rows = await listLocks({ activeOnly });
    res.json(rows.map(r => ({
      id: r.id,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      lockedBy: r.lockedBy,
      lockedByName: r.lockedByName,
      lockedAt: r.lockedAt.toISOString(),
      lockReason: r.lockReason,
      unlockedBy: r.unlockedBy,
      unlockedByName: r.unlockedByName,
      unlockedAt: r.unlockedAt ? r.unlockedAt.toISOString() : null,
      unlockReason: r.unlockReason,
      active: r.active,
    })));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /period-locks/check?date=YYYY-MM-DD — is this date inside an active lock?
router.get("/check", async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    if (!date) return res.status(400).json({ error: "bad_request", message: "missing date query param" });
    const locked = await isPeriodLocked(date);
    res.json({ date, locked });
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// POST /period-locks — create a new lock. Admin-only.
const LockBody = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  reason: z.string().max(500).optional(),
});

router.post("/", async (req, res) => {
  try {
    const body = LockBody.parse(req.body);
    const u = (req as any).user as { id: number; name: string };
    if (body.periodEnd < body.periodStart) {
      return res.status(400).json({ error: "bad_request", message: "periodEnd must be on or after periodStart" });
    }
    const row = await lockPeriod({
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      reason: body.reason ?? null,
      lockedBy: u.id ?? 0,
      lockedByName: u.name ?? "Admin",
    });
    res.status(201).json(row);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

// POST /period-locks/:id/unlock — flip active=false. Admin-only.
const UnlockBody = z.object({
  reason: z.string().max(500).optional(),
});

router.post("/:id/unlock", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "bad_request", message: "invalid lock id" });
    const body = UnlockBody.parse(req.body);
    const u = (req as any).user as { id: number; name: string };
    const row = await unlockPeriod({
      lockId: id,
      reason: body.reason ?? null,
      unlockedBy: u.id ?? 0,
      unlockedByName: u.name ?? "Admin",
    });
    res.json(row);
  } catch (err: any) {
    res.status(400).json({ error: "bad_request", message: err.message });
  }
});

export default router;
