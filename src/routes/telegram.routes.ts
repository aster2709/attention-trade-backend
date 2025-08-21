import { Router } from "express";
import { linkTelegramAccount } from "../controllers/telegram.controller";

const router = Router();
router.post("/link", linkTelegramAccount);
export default router;
