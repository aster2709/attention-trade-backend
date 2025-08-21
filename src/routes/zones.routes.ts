import { Router } from "express";
import { getZoneTokens } from "../controllers/zones.controller";

const router = Router();
router.get("/", getZoneTokens);
export default router;
