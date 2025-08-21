import * as cron from "node-cron";
import { TokenModel } from "../models/token.model";
import { getNewTweetsForToken } from "./twitter.service";
import { updateAttentionScore } from "./attentionScore.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class XPostTapperService {
  private job: cron.ScheduledTask;
  private isTapping: boolean = false;
  private clientToggle: "client1" | "client2" = "client1"; // To alternate between clients

  constructor() {
    // Run every 2 minutes
    this.job = cron.schedule("* * * * *", () => this.runTapper());
  }

  public start() {
    console.log("[Cron] Starting xPost Tapper Service...");
    this.job.start();
  }

  private async runTapper() {
    if (this.isTapping) {
      console.log(
        "[xPost Tapper] Skip run: Previous tapping cycle is still in progress."
      );
      return;
    }
    this.isTapping = true;
    console.log("[xPost Tapper] Starting new tapping cycle...");

    try {
      const activeTokens = await TokenModel.find({
        activeZones: { $ne: [] },
      })
        .select("mintAddress symbol latestTweetId")
        .lean();

      if (activeTokens.length === 0) {
        console.log("[xPost Tapper] No active tokens to tap.");
        return;
      }

      console.log(
        `[xPost Tapper] Found ${activeTokens.length} tokens to check for new posts.`
      );
      for (const token of activeTokens) {
        console.log(`[xPost Tapper] -> Checking ${token.symbol}`);

        const result = await getNewTweetsForToken(token, this.clientToggle);

        if (result.newPostCount > 0) {
          const updatedToken = await TokenModel.findOneAndUpdate(
            { mintAddress: token.mintAddress },
            {
              $inc: {
                xPostCount: result.newPostCount,
                xPostViews: result.newPostViews,
              },
              $set: { latestTweetId: result.latestTweetId },
            },
            { new: true }
          );
          console.log(
            `[xPost Tapper] ✅ Found ${result.newPostCount} new posts for ${token.symbol}.`
          );

          // --- RECALCULATE SCORE ---
          if (updatedToken) {
            await updateAttentionScore(updatedToken._id);
          }
        }

        // Alternate client for next request to distribute load and avoid rate limits
        this.clientToggle =
          this.clientToggle === "client1" ? "client2" : "client1";

        // Wait 20 seconds before checking the next token
        await sleep(10000);
      }
      console.log("[xPost Tapper] Finished tapping cycle.");
    } catch (error) {
      console.error("[xPost Tapper] Error during tapping cycle:", error);
    } finally {
      this.isTapping = false;
    }
  }
}

export const xPostTapperService = new XPostTapperService();
