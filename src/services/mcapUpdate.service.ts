import * as cron from "node-cron";
import { TokenModel } from "../models/token.model";
import { fetchMultipleTokenData } from "./jupiter.service";
import { broadcastService } from "./broadcast.service";
import { TelegramAlertModel } from "../models/telegramAlert.model"; // NEW IMPORT
import { bot as telegramBot } from "./telegram.bot.service"; // NEW IMPORT
import { formatNumber } from "../utils/formatters"; // NEW IMPORT

const BATCH_SIZE = 100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CHECKPOINTS = [3, 10, 25, 50, 100]; // Define checkpoints here

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

            // NEW: Check and send checkpoint alerts for this token
            await this.checkAndSendCheckpointAlerts(fullTokenState);
          }
        }
      }
    } catch (error) {
      console.error("[Cron] Error during mcap update:", error);
    } finally {
      this.isTaskRunning = false;
    }
  }

  private async checkAndSendCheckpointAlerts(token: any) {
    try {
      const alerts = await TelegramAlertModel.find({ token: token._id });
      if (!alerts.length) return;

      for (const alert of alerts) {
        const multiple = token.currentMarketCap / alert.entryMcap;
        if (multiple < CHECKPOINTS[0] || multiple <= 0) continue; // No checkpoints crossed or invalid multiple

        const newCheckpoints: number[] = [];
        for (const checkpoint of CHECKPOINTS) {
          if (
            multiple >= checkpoint &&
            !alert.checkpointsHit.includes(checkpoint)
          ) {
            newCheckpoints.push(checkpoint);
          }
        }

        if (newCheckpoints.length > 0) {
          for (const checkpoint of newCheckpoints) {
            const updateMessage = `
🚀 *$${token.symbol} hit ${checkpoint}x since alert!*

Current MCAP: ${formatNumber(token.currentMarketCap)}
(From ${formatNumber(alert.entryMcap)} in ${alert.zoneName})

🧠 *Scans:* ${token.scanCount}
👥 *Groups:* ${token.groupCount}
👀 *Rick Views:* ${(token.rickViews || 0).toLocaleString()}
𝕏 *Posts:* ${token.xPostCount}
📈 *X Views:* ${(token.xPostViews || 0).toLocaleString()}
          `;

            try {
              await telegramBot.telegram.sendMessage(
                alert.chatId,
                updateMessage,
                {
                  parse_mode: "Markdown",
                  reply_parameters: { message_id: alert.messageId }, // Updated to reply_parameters
                }
              );
              console.log(
                `[McapUpdate] Sent checkpoint (${checkpoint}x) reply for ${token.symbol} to chat ID ${alert.chatId}`
              );
            } catch (error) {
              console.error(
                `[McapUpdate] Failed to send checkpoint reply to ${alert.chatId}:`,
                error
              );
            }
          }

          // Update the alert document with new checkpoints hit
          alert.checkpointsHit.push(...newCheckpoints);
          alert.markModified("checkpointsHit");
          await alert.save();
        }
      }
    } catch (error) {
      console.error(
        `[McapUpdate] Error checking/sending checkpoint alerts for token ${token._id}:`,
        error
      );
    }
  }
}

export const mcapUpdateService = new McapUpdateService();
