import { Router } from "express";
import { getTokenLeaderboard } from "../controllers/fnfscan.controller";

const router = Router();
router.get("/:token", getTokenLeaderboard);
export default router;
