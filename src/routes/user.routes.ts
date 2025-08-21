import { Router } from "express";
import { getMe, updateTelegramAlerts } from "../controllers/user.controller";

const router = Router();

router.get("/me", getMe);
// Add a new PATCH route to update settings
router.patch("/me/telegram-alerts", updateTelegramAlerts);

export default router;
