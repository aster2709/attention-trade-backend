import { Router } from "express";
import { getGlobalMetrics } from "../controllers/metrics.controller";

const router = Router();
router.get("/", getGlobalMetrics);
export default router;
