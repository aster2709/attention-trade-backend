import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./config/db";

// Import all services
import { scanListenerService } from "./services/scanListener.service";
import { mcapUpdateService } from "./services/mcapUpdate.service";
import { initTelegramClient } from "./services/telegram.service";
import { startTelegramListener } from "./services/telegramListener.service";
import { rickTapperService } from "./services/rickTapper.service";
import { xPostTapperService } from "./services/xPostTapper.service";
import { broadcastService } from "./services/broadcast.service";

// Import API routes
import zoneRoutes from "./routes/zones.routes";
import hallOfFameRoutes from "./routes/hallOfFame.routes";
import metricsRoutes from "./routes/metrics.routes";
import authRoutes from "./routes/auth.routes";
import telegramRoutes from "./routes/telegram.routes";
import userRoutes from "./routes/user.routes"; // <-- IMPORT

import { startTelegramBot } from "./services/telegram.bot.service";

const main = async () => {
  await connectDB();
  await initTelegramClient();

  const app = express();
  const PORT = process.env.PORT || 4000;

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use("/api/auth", authRoutes);
  app.use("/api/zones", zoneRoutes);
  app.use("/api/hall-of-fame", hallOfFameRoutes);
  app.use("/api/metrics", metricsRoutes);
  app.use("/api/telegram", telegramRoutes); // <-- ADD THIS
  app.use("/api/users", userRoutes); // <-- ADD THIS

  app.get("/", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "attention.trade-api",
      timestamp: new Date().toISOString(),
    });
  });

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);

    // Initialize the broadcast service singleton
    broadcastService.initialize(server);

    console.log("--- Starting background services ---");
    scanListenerService.start();
    mcapUpdateService.start();
    startTelegramListener();
    rickTapperService.start();
    xPostTapperService.start();
    startTelegramBot();
    console.log("--- All services are running ---");
  });
};

main().catch((error) => {
  console.error("💥 FATAL ERROR: Failed to start the application.", error);
  process.exit(1);
});
