import { Router, type IRouter } from "express";
import { authenticate, authorize } from "../middlewares/auth.js";
import {
  buildPnl, buildBalanceSheet, buildCashFlow, buildTrialBalance, buildGlDetail,
} from "../lib/reports.js";

const router: IRouter = Router();

router.use(authenticate, authorize(["admin", "accountant"]));

// GET /financial-reports/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/pnl", async (req, res) => {
  try {
    const from = req.query.from as string;
    const to = req.query.to as string;
    if (!from || !to) { res.status(400).json({ error: "bad_request", message: "from and to required" }); return; }
    res.json(await buildPnl({ from, to }));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /financial-reports/balance-sheet?asOf=YYYY-MM-DD
router.get("/balance-sheet", async (req, res) => {
  try {
    const asOf = req.query.asOf as string;
    if (!asOf) { res.status(400).json({ error: "bad_request", message: "asOf required" }); return; }
    res.json(await buildBalanceSheet(asOf));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /financial-reports/cash-flow?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/cash-flow", async (req, res) => {
  try {
    const from = req.query.from as string;
    const to = req.query.to as string;
    if (!from || !to) { res.status(400).json({ error: "bad_request", message: "from and to required" }); return; }
    res.json(await buildCashFlow({ from, to }));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /financial-reports/trial-balance?asOf=YYYY-MM-DD
router.get("/trial-balance", async (req, res) => {
  try {
    const asOf = req.query.asOf as string;
    if (!asOf) { res.status(400).json({ error: "bad_request", message: "asOf required" }); return; }
    res.json(await buildTrialBalance(asOf));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

// GET /financial-reports/gl-detail?accountCode=...&from=...&to=...
router.get("/gl-detail", async (req, res) => {
  try {
    const accountCode = req.query.accountCode as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    if (!accountCode || !from || !to) { res.status(400).json({ error: "bad_request", message: "accountCode, from, to required" }); return; }
    res.json(await buildGlDetail(accountCode, { from, to }));
  } catch (err: any) {
    res.status(500).json({ error: "server_error", message: err.message });
  }
});

export default router;
