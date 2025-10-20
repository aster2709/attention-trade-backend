import * as cron from "node-cron";
import { TokenModel } from "../models/token.model";
import { fetchMultipleTokenData, TokenMarketData } from "./jupiter.service";
import { broadcastService } from "./broadcast.service";
import { TelegramAlertModel } from "../models/telegramAlert.model"; // For checkpoint alerts
import { bot as telegramBot } from "./telegram.bot.service"; // For sending alerts
import { formatNumber } from "../utils/formatters";

const JUPITER_BATCH_SIZE = 100;
const BIRDEYE_BATCH_SIZE = 20;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TELEGRAM_RATE_LIMIT_DELAY = 35; // Milliseconds between sends (~28 msgs/sec)
const CHECKPOINTS = [3, 10, 25, 50, 100]; // Multiples for checkpoint alerts

class McapUpdateService {
  private job: cron.ScheduledTask;
  private isTaskRunning: boolean = false;

  constructor() {
    this.job = cron.schedule("*/20 * * * * *", () => this.runUpdate()); // Run every 20 seconds
  }

  public start() {
    console.log(
      "[Cron] Starting Mcap Update Service (Multi-Chain, 20s interval)..."
    );
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
      const tokensToUpdate = await TokenModel.find({
        activeZones: { $ne: [] },
      })
        .select("mintAddress activeZones") // Select necessary fields
        .lean();

      if (tokensToUpdate.length === 0) {
        console.log("[Cron] No active tokens to update.");
        this.isTaskRunning = false;
        return;
      }
      console.log(
        `[Cron] Found ${tokensToUpdate.length} active tokens to update.`
      );

      const solanaMints: string[] = [];
      const bscAddresses: string[] = [];
      tokensToUpdate.forEach((token) => {
        if (token.mintAddress.startsWith("0x")) {
          bscAddresses.push(token.mintAddress);
        } else {
          solanaMints.push(token.mintAddress);
        }
      });

      const allMarketData: TokenMarketData[] = [];
      const promises: Promise<TokenMarketData[]>[] = [];

      // Fetch Solana data (Jupiter)
      console.log(`[Cron] Processing ${solanaMints.length} Solana tokens...`);
      for (let i = 0; i < solanaMints.length; i += JUPITER_BATCH_SIZE) {
        const batch = solanaMints.slice(i, i + JUPITER_BATCH_SIZE);
        console.log(
          `[Cron] Fetching Solana batch ${
            Math.ceil(i / JUPITER_BATCH_SIZE) + 1
          }...`
        );
        promises.push(fetchMultipleTokenData(batch, "solana"));
        await sleep(500);
      }

      // Fetch BSC data (Birdeye V3)
      console.log(`[Cron] Processing ${bscAddresses.length} BSC tokens...`);
      for (let i = 0; i < bscAddresses.length; i += BIRDEYE_BATCH_SIZE) {
        const batch = bscAddresses.slice(i, i + BIRDEYE_BATCH_SIZE);
        console.log(
          `[Cron] Fetching BSC batch ${
            Math.ceil(i / BIRDEYE_BATCH_SIZE) + 1
          }...`
        );
        promises.push(fetchMultipleTokenData(batch, "bsc"));
        await sleep(1000);
      }

      const resultsArrays = await Promise.all(promises);
      allMarketData.push(...resultsArrays.flat());
      console.log(
        `[Cron] Fetched market data for ${allMarketData.length} tokens.`
      );

      const bulkOps = [];
      const updatedTokensForBroadcast: string[] = [];

      for (const marketData of allMarketData) {
        if (
          marketData.marketCap !== undefined &&
          marketData.marketCap !== null
        ) {
          const newMarketCap = marketData.marketCap;
          const tokenInDb = tokensToUpdate.find(
            (t) => t.mintAddress === marketData.mintAddress
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
              filter: { mintAddress: marketData.mintAddress },
              update: updateOperation,
            },
          });
          updatedTokensForBroadcast.push(marketData.mintAddress);
        }
      }

      if (bulkOps.length > 0) {
        const result = await TokenModel.bulkWrite(bulkOps);
        console.log(
          `[Cron] ✅ DB Market caps updated. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}.`
        );

        // Broadcast updates and check checkpoints
        for (const mintAddress of updatedTokensForBroadcast) {
          const fullTokenState = await TokenModel.findOne({ mintAddress }); // Need full Mongoose doc for checkpoint logic
          if (fullTokenState) {
            broadcastService.broadcastStatsUpdate(fullTokenState.mintAddress, {
              currentMarketCap: fullTokenState.currentMarketCap,
              zoneState: fullTokenState.zoneState,
            });
            // Check and send checkpoint alerts
            await this.checkAndSendCheckpointAlerts(fullTokenState);
          }
        }
        console.log(
          `[Cron] 📢 Processed broadcasts & checkpoints for ${updatedTokensForBroadcast.length} tokens.`
        );
      } else {
        console.log(
          "[Cron] No market cap data received or no updates needed for the current batch."
        );
      }
    } catch (error) {
      console.error("[Cron] Error during mcap update:", error);
    } finally {
      this.isTaskRunning = false;
      console.log("[Cron] Finished market cap update cycle.");
    }
  }

  /**
   * Checks if a token has crossed any ROI checkpoints since its initial alert
   * and sends Telegram replies concurrently and throttled.
   * @param token The full Mongoose document for the token.
   */
  private async checkAndSendCheckpointAlerts(token: any) {
    // Use 'any' or define a proper type extending Document
    try {
      // Find the initial alert message sent for this token to each user/chat
      const earliestAlerts = await TelegramAlertModel.aggregate([
        { $match: { token: token._id } }, // Filter by token
        { $sort: { createdAt: 1 } }, // Sort by creation time (earliest first)
        {
          $group: {
            _id: "$chatId", // Group by the recipient's chat ID
            alert: { $first: "$$ROOT" }, // Get the full document of the first alert to this chat
          },
        },
        { $replaceRoot: { newRoot: "$alert" } }, // Make the alert document the root of the output
      ]).exec();

      if (!earliestAlerts || earliestAlerts.length === 0) {
        // No initial alerts found for this token, nothing to do.
        return;
      }

      const sendPromises: Promise<any>[] = []; // Collect all message sending promises
      const updatesToDb: { alertId: any; checkpoints: number[] }[] = []; // Collect necessary DB updates

      for (const alert of earliestAlerts) {
        // Ensure entryMcap is valid before calculating multiple
        if (!alert.entryMcap || alert.entryMcap <= 0) {
          console.warn(
            `[McapUpdate] Invalid entryMcap (${alert.entryMcap}) for alert ${alert._id}. Skipping.`
          );
          continue;
        }

        const multiple = token.currentMarketCap / alert.entryMcap;

        // Skip if below the first checkpoint or if multiple is invalid/zero
        if (multiple < CHECKPOINTS[0] || multiple <= 0) {
          continue;
        }

        const newCheckpointsHit: number[] = [];
        for (const checkpoint of CHECKPOINTS) {
          // Check if the current multiple reaches the checkpoint AND
          // if this checkpoint hasn't been recorded for this alert yet
          if (
            multiple >= checkpoint &&
            !alert.checkpointsHit.includes(checkpoint)
          ) {
            newCheckpointsHit.push(checkpoint);
          }
        }

        // If new checkpoints were hit, prepare alerts and DB updates
        if (newCheckpointsHit.length > 0) {
          // Store the necessary info to update the DB later
          updatesToDb.push({
            alertId: alert._id,
            checkpoints: newCheckpointsHit,
          });

          // Create and collect send promises for each newly hit checkpoint
          for (const checkpoint of newCheckpointsHit) {
            // Construct the update message
            const updateMessage = `
🚀 *$${token.symbol} hit ${checkpoint}x since alert!*

Current MCAP: ${formatNumber(token.currentMarketCap)}

🧠 *Scans:* ${token.scanCount || 0}
👥 *Groups:* ${token.scannedInGroups?.length || 0}
👀 *Rick Views:* ${formatNumber(token.rickViews)}
𝕏 *Posts:* ${token.xPostCount || 0}
📈 *X Views:* ${formatNumber(token.xPostViews)}
            `.trim();

            // Push the promise to the array, don't await here
            sendPromises.push(
              telegramBot.telegram
                .sendMessage(alert.chatId, updateMessage, {
                  parse_mode: "Markdown",
                  // Reply to the original alert message
                  reply_parameters: { message_id: alert.messageId },
                })
                .catch((error) => {
                  // Handle potential errors for individual sends
                  console.error(
                    `[Telegram Send] Failed for chat ${alert.chatId} (Msg ${alert.messageId}, Token ${token.symbol}, ${checkpoint}x):`,
                    error.message || error
                  );
                  // We catch here so one failure doesn't stop all others
                })
            );
          }
        }
      }

      // --- Execute Sends Concurrently with Throttling ---
      if (sendPromises.length > 0) {
        console.log(
          `[McapUpdate] Sending ${sendPromises.length} checkpoint alerts concurrently for ${token.symbol}...`
        );
        // Iterate through the collected promises
        for (const sendPromise of sendPromises) {
          await sendPromise; // Wait for the current send operation to complete (or fail)
          await sleep(TELEGRAM_RATE_LIMIT_DELAY); // Pause to respect Telegram's rate limits
        }
        console.log(
          `[McapUpdate] Finished sending alerts for ${token.symbol}.`
        );
      }

      // --- Update Database Records in Bulk ---
      if (updatesToDb.length > 0) {
        const bulkDbOps = updatesToDb.map((update) => ({
          updateOne: {
            filter: { _id: update.alertId },
            // Add all newly hit checkpoints to the array for this alert
            update: {
              $push: { checkpointsHit: { $each: update.checkpoints } },
            },
          },
        }));
        await TelegramAlertModel.bulkWrite(bulkDbOps);
        console.log(
          `[McapUpdate] Updated checkpoints in DB for ${updatesToDb.length} alerts related to ${token.symbol}.`
        );
      }
    } catch (error) {
      console.error(
        `[McapUpdate] Error in checkAndSendCheckpointAlerts for token ${token.symbol} (${token._id}):`,
        error
      );
    }
  }
}

export const mcapUpdateService = new McapUpdateService();
