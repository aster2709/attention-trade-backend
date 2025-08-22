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
      return;
    }

    this.isTaskRunning = true;

    try {
      // --- THIS IS THE FIX ---
      // We now query directly for tokens that are in at least one zone.
      const tokensToUpdate = await TokenModel.find({
        activeZones: { $ne: [] },
      })
        .select("mintAddress activeZones")
        .lean();

      if (tokensToUpdate.length === 0) {
        this.isTaskRunning = false;
        return;
      }

      const mints = tokensToUpdate.map((t) => t.mintAddress);
      const bulkOps = [];
      const updatedTokensForBroadcast: any[] = [];

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

            if (activeZones.length > 0) {
              updateOperation.$max = {};
              activeZones.forEach((zone) => {
                const athField = `zoneState.${zone}.athMcapSinceEntry`;
                updateOperation.$max[athField] = newMarketCap;
              });
            }

            bulkOps.push({
              updateOne: {
                filter: { mintAddress: tokenData.mintAddress },
                update: updateOperation,
              },
            });

            updatedTokensForBroadcast.push({
              mintAddress: tokenData.mintAddress,
            });
          }
        }
        await sleep(2000);
      }

      if (bulkOps.length > 0) {
        await TokenModel.bulkWrite(bulkOps);

        for (const updatedToken of updatedTokensForBroadcast) {
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
      }
    } catch (error) {
      console.error("[Cron] Error during mcap update:", error);
    } finally {
      this.isTaskRunning = false;
    }
  }
}

export const mcapUpdateService = new McapUpdateService();
