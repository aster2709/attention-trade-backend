import { Router } from "express";
import { getHallOfFame } from "../controllers/hallOfFame.controller";

const router = Router();
router.get("/", getHallOfFame);
export default router;
