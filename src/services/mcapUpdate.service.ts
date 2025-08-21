import * as cron from "node-cron";
import { TokenModel } from "../models/token.model";
import { fetchMultipleTokenData } from "./jupiter.service";
import { broadcastService } from "./broadcast.service";

const BATCH_SIZE = 100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class McapUpdateService {
  private job: cron.ScheduledTask;
  private isTaskRunning: boolean = false;

  constructor() {
    this.job = cron.schedule("*/20 * * * * *", () => this.runUpdate());
  }

  public start() {
    console.log("[Cron] Starting Mcap Update Service (20s interval)...");
    this.job.start();
  }

  private async runUpdate() {
    if (this.isTaskRunning) {
      console.log(
        "[Cron] Skip run: Previous mcap update task is still in progress."
      );
      return;
    }

    this.isTaskRunning = true;
    console.log("[Cron] Running scheduled market cap update...");

    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);

      const exclusionQuery = {
        $nor: [
          { createdAt: { $lt: twoHoursAgo }, currentMarketCap: { $lt: 10000 } },
          {
            createdAt: { $lt: eightHoursAgo },
            currentMarketCap: { $lt: 30000 },
          },
        ],
      };

      // Fetch mint and activeZones for all eligible tokens
      const tokensToUpdate = await TokenModel.find(exclusionQuery)
        .select("mintAddress activeZones")
        .lean();

      const mints = tokensToUpdate.map((t) => t.mintAddress);
      if (mints.length === 0) {
        console.log("[Cron] No active tokens to update.");
        return;
      }
      console.log(`[Cron] Found ${mints.length} active tokens to update.`);

      const bulkOps = [];
      const updatedTokensForBroadcast: any[] = []; // <-- Store updates for broadcasting

      for (let i = 0; i < mints.length; i += BATCH_SIZE) {
        const batch = mints.slice(i, i + BATCH_SIZE);
        const jupiterData = await fetchMultipleTokenData(batch);

        for (const tokenData of jupiterData) {
          if (tokenData.marketCap !== undefined) {
            const newMarketCap = tokenData.marketCap;
            const tokenInDb = tokensToUpdate.find(
              (t) => t.mintAddress === tokenData.mintAddress
            );
            const activeZones = tokenInDb?.activeZones || [];

            const updateOperation: any = {
              $set: { currentMarketCap: newMarketCap },
            };

            // Dynamically build $max updates for each active zone's ATH
            if (activeZones.length > 0) {
              activeZones.forEach((zone) => {
                const athField = `zoneState.${zone}.athMcapSinceEntry`;
                if (!updateOperation.$max) updateOperation.$max = {};
                updateOperation.$max[athField] = newMarketCap;
              });
            }

            bulkOps.push({
              updateOne: {
                filter: { mintAddress: tokenData.mintAddress },
                update: updateOperation,
              },
            });

            // --- PREPARE DATA FOR BROADCAST ---
            updatedTokensForBroadcast.push({
              mintAddress: tokenData.mintAddress,
              currentMarketCap: tokenData.marketCap,
            });
          }
        }

        console.log(
          `[Cron] Processed batch ${Math.ceil(i / BATCH_SIZE)}. Waiting 2s...`
        );
        await sleep(2000);
      }

      if (bulkOps.length > 0) {
        const result = await TokenModel.bulkWrite(bulkOps);
        console.log(
          `[Cron] ✅ Market caps updated. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}.`
        );

        // --- BROADCAST ALL STAT UPDATES ---
        // We do this after the DB is successfully updated.
        for (const updatedToken of updatedTokensForBroadcast) {
          // We need to fetch the full new state to send to the frontend
          const fullTokenState = await TokenModel.findOne({
            mintAddress: updatedToken.mintAddress,
          }).lean();
          if (fullTokenState) {
            broadcastService.broadcastStatsUpdate(fullTokenState.mintAddress, {
              currentMarketCap: fullTokenState.currentMarketCap,
              zoneState: fullTokenState.zoneState,
            });
          }
        }
        console.log(
          `[Cron] 📢 Broadcasted stats updates for ${updatedTokensForBroadcast.length} tokens.`
        );
      } else {
        console.log(
          "[Cron] No market cap data returned from Jupiter for the current batch."
        );
      }
    } catch (error) {
      console.error("[Cron] Error during mcap update:", error);
    } finally {
      this.isTaskRunning = false;
    }
  }
}

export const mcapUpdateService = new McapUpdateService();
