import * as cron from "node-cron";
import { TokenModel } from "../models/token.model";
import { tgClient } from "./telegram.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class RickTapperService {
  private job: cron.ScheduledTask;
  private isTapping: boolean = false;

  constructor() {
    this.job = cron.schedule("* * * * *", () => this.runTapper());
  }

  public start() {
    console.log("[Cron] Starting Rick Tapper Service...");
    this.job.start();
  }

  private async runTapper() {
    if (this.isTapping) {
      console.log(
        "[Tapper] Skip run: Previous tapping cycle is still in progress."
      );
      return;
    }
    this.isTapping = true;
    console.log("[Tapper] Starting new tapping cycle...");

    try {
      // --- THIS IS THE CORRECTED QUERY ---
      // Find tokens where the activeZones array is not empty.
      const activeTokens = await TokenModel.find({
        activeZones: { $ne: [] },
      })
        .select("mintAddress symbol")
        .lean();

      if (activeTokens.length === 0) {
        console.log("[Tapper] No active tokens in any orbit to tap.");
        return;
      }

      console.log(
        `[Tapper] Found ${activeTokens.length} tokens to tap. Starting...`
      );
      for (const token of activeTokens) {
        console.log(
          `[Tapper] -> Tapping Rick for ${token.symbol} (${token.mintAddress})`
        );
        await tgClient.sendMessage("@RickBurpBot", {
          message: token.mintAddress,
        });

        await sleep(10000);
      }
      console.log("[Tapper] Finished tapping cycle.");
    } catch (error) {
      console.error("[Tapper] Error during tapping cycle:", error);
    } finally {
      this.isTapping = false;
    }
  }
}

export const rickTapperService = new RickTapperService();
