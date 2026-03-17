import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import residentsRouter from "./residents";
import itemsRouter from "./items";
import pricingRouter from "./pricing";
import ordersRouter from "./orders";
import vendorsRouter from "./vendors";
import ridersRouter from "./riders";
import adminRouter from "./admin";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/residents", residentsRouter);
router.use("/items", itemsRouter);
router.use("/pricing", pricingRouter);
router.use("/orders", ordersRouter);
router.use("/vendors", vendorsRouter);
router.use("/riders", ridersRouter);
router.use("/admin", adminRouter);
router.use("/storage", storageRouter);

export default router;
