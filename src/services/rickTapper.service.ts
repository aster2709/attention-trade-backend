// src/services/rickTapper.service.ts
import { getPreEntryCandidateTokens } from "../utils/tokenCandidates"; // Adjust path as needed
import { TokenModel } from "../models/token.model";
import { tgClient } from "./telegram.service";
import * as cron from "node-cron";

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
    // console.log("[Tapper] Starting new tapping cycle...");

    try {
      const candidateTokenIds = await getPreEntryCandidateTokens();
      if (candidateTokenIds.length === 0) {
        console.log("[Tapper] No pre-entry candidate tokens to tap.");
        return;
      }

      const candidateTokens = await TokenModel.find({
        _id: { $in: candidateTokenIds },
      })
        .select("mintAddress symbol")
        .lean();

      // console.log(
      //   `[Tapper] Found ${candidateTokens.length} pre-entry tokens to tap. Starting...`
      // );
      for (const token of candidateTokens) {
        // console.log(
        //   `[Tapper] -> Tapping Rick for ${token.symbol} (${token.mintAddress})`
        // );
        await tgClient.sendMessage("@RickBurpBot", {
          message: token.mintAddress,
        });

        await sleep(10000);
      }
      // console.log("[Tapper] Finished tapping cycle.");
    } catch (error) {
      console.error("[Tapper] Error during tapping cycle:", error);
    } finally {
      this.isTapping = false;
    }
  }
}

export const rickTapperService = new RickTapperService();
