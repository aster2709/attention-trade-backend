// src/services/xPostTapper.service.ts
import { getPreEntryCandidateTokens } from "../utils/tokenCandidates"; // Adjust path as needed
import { TokenModel } from "../models/token.model";
import { getNewTweetsForToken } from "./twitter.service";
import { updateAttentionScore } from "./attentionScore.service";
import * as cron from "node-cron";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class XPostTapperService {
  private job: cron.ScheduledTask;
  private isTapping: boolean = false;
  private clientToggle: "client1" | "client2" = "client1";

  constructor() {
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
      const candidateTokenIds = await getPreEntryCandidateTokens();
      if (candidateTokenIds.length === 0) {
        console.log("[xPost Tapper] No pre-entry candidate tokens to check.");
        return;
      }

      const candidateTokens = await TokenModel.find({
        _id: { $in: candidateTokenIds },
      })
        .select("mintAddress symbol latestTweetId")
        .lean();

      console.log(
        `[xPost Tapper] Found ${candidateTokens.length} pre-entry tokens to check for new posts.`
      );
      for (const token of candidateTokens) {
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

          if (updatedToken) {
            await updateAttentionScore(updatedToken._id);
          }
        }

        this.clientToggle =
          this.clientToggle === "client1" ? "client2" : "client1";
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
