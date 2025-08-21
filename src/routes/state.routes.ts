import { Router } from "express";
import { getFullState } from "../controllers/state.controller";

const router = Router();

// This will be mounted at /api/state, so this route handles GET /api/state
router.get("/", getFullState);

export default router;
