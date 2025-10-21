import mongoose from "mongoose";
import { TokenModel, Token } from "../models/token.model";
import { ScanModel } from "../models/scan.model";
import { UserModel } from "../models/user.model";
import { TelegramAlertModel } from "../models/telegramAlert.model"; // NEW IMPORT
import { broadcastService } from "./broadcast.service";
import { ZONE_CRITERIA } from "../config/zones";
import { updateAttentionScore } from "./attentionScore.service";
import { bot as telegramBot } from "./telegram.bot.service";
import { formatNumber } from "../utils/formatters";
import { fetchTokenData } from "./jupiter.service"; // Import Jupiter service

type ZoneName = keyof typeof ZONE_CRITERIA;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TELEGRAM_RATE_LIMIT_DELAY = 45; // Milliseconds between sends (~28 msgs/sec)

const sendTelegramAlert = async (
  chatId: number,
  token: Token,
  zoneName: ZoneName
) => {
  const zoneState = token.zoneState[zoneName];
  if (!zoneState) return null;

  const logo = token.logoURI || "https://i.imgur.com/v81nW21.png";
  const zoneTitle = {
    DEGEN_ORBIT: "🧪 Degen Orbit",
    MAINFRAME: "📡 Mainframe Zone",
    SENTIMENT_CORE: "🧠 Sentiment Core",
  }[zoneName];
  const message = `
*${zoneTitle} Alert* 🚀

*$${token.symbol}* has entered the zone!

*Mcap:* ${formatNumber(zoneState.entryMcap)}

🧠 *Scans:* ${token.scanCount}
👥 *Groups:* ${token.groupCount}
👀 *Rick Views:* ${(token.rickViews || 0).toLocaleString()}
𝕏 *Posts:* ${token.xPostCount}
📈 *X Views:* ${(token.xPostViews || 0).toLocaleString()}

\`${token.mintAddress}\`
    `;

  let tradeLinks: any;
  if (token.mintAddress.startsWith("0x")) {
    tradeLinks = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "DEX",
              url: `https://dexscreener.com/bsc/${token.mintAddress}`,
            },
            {
              text: "GMGN",
              url: `https://gmgn.ai/bsc/token/attn_${token.mintAddress}`,
            },
          ],
        ],
      },
    };
  } else {
    tradeLinks = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "DEX",
              url: `https://dexscreener.com/solana/${token.mintAddress}`,
            },
            {
              text: "GMGN",
              url: `https://gmgn.ai/sol/token/attn_${token.mintAddress}`,
            },
          ],
        ],
      },
    };
  }

  try {
    const sentMessage = await telegramBot.telegram.sendPhoto(chatId, logo, {
      caption: message,
      parse_mode: "Markdown",
      ...tradeLinks,
    });
    console.log(
      `[Alerts] Sent Telegram alert for ${token.symbol} to chat ID ${chatId}`
    );
    return sentMessage.message_id; // Return message ID for storage
  } catch (error: any) {
    console.error(
      `[Alerts] Failed to send Telegram alert to ${chatId}:`,
      error.message || error
    );

    // --- THIS IS THE FIX for Blocked Users ---
    if (
      error.message &&
      error.message.includes("Forbidden: bot was blocked by the user")
    ) {
      console.warn(
        `[Alerts] User ${chatId} blocked the bot. Disabling all alerts.`
      );
      try {
        const user = await UserModel.findOne({ "telegram.chatId": chatId });
        if (user && user.telegram) {
          // Set all zone alerts to false for this user
          user.telegram.alertSettings = {
            DEGEN_ORBIT: false,
            MAINFRAME: false,
            SENTIMENT_CORE: false,
          };
          user.markModified("telegram.alertSettings");
          await user.save();
          console.log(`[Alerts] Disabled alerts for user ${chatId}.`);
        }
      } catch (dbError) {
        console.error(
          `[Alerts] Failed to disable alerts for user ${chatId} after block:`,
          dbError
        );
      }
    }
    // --- END FIX ---

    return null; // Indicate failure
  }
};

export const checkAndTriggerAlerts = async (
  tokenId: mongoose.Types.ObjectId
) => {
  try {
    const tokenDoc = await TokenModel.findById(tokenId);
    if (!tokenDoc) return;

    const oldActiveZones = [...tokenDoc.activeZones];
    const now = new Date();

    const results = await ScanModel.aggregate([
      { $match: { token: tokenId } },
      {
        $group: {
          _id: "$token",
          scans_2h: {
            $sum: {
              $cond: [
                {
                  $gte: [
                    "$createdAt",
                    new Date(
                      now.getTime() -
                        ZONE_CRITERIA.DEGEN_ORBIT.windowHours * 3600 * 1000
                    ),
                  ],
                },
                1,
                0,
              ],
            },
          },
          groups_2h: {
            $addToSet: {
              $cond: [
                {
                  $gte: [
                    "$createdAt",
                    new Date(
                      now.getTime() -
                        ZONE_CRITERIA.DEGEN_ORBIT.windowHours * 3600 * 1000
                    ),
                  ],
                },
                "$groupId",
                null,
              ],
            },
          },
          scans_8h: {
            $sum: {
              $cond: [
                {
                  $gte: [
                    "$createdAt",
                    new Date(
                      now.getTime() -
                        ZONE_CRITERIA.MAINFRAME.windowHours * 3600 * 1000
                    ),
                  ],
                },
                1,
                0,
              ],
            },
          },
          groups_8h: {
            $addToSet: {
              $cond: [
                {
                  $gte: [
                    "$createdAt",
                    new Date(
                      now.getTime() -
                        ZONE_CRITERIA.MAINFRAME.windowHours * 3600 * 1000
                    ),
                  ],
                },
                "$groupId",
                null,
              ],
            },
          },
          scans_24h: {
            $sum: {
              $cond: [
                {
                  $gte: [
                    "$createdAt",
                    new Date(
                      now.getTime() -
                        ZONE_CRITERIA.SENTIMENT_CORE.windowHours * 3600 * 1000
                    ),
                  ],
                },
                1,
                0,
              ],
            },
          },
          groups_24h: {
            $addToSet: {
              $cond: [
                {
                  $gte: [
                    "$createdAt",
                    new Date(
                      now.getTime() -
                        ZONE_CRITERIA.SENTIMENT_CORE.windowHours * 3600 * 1000
                    ),
                  ],
                },
                "$groupId",
                null,
              ],
            },
          },
        },
      },
    ]);

    const stats = results[0] || {};
    const statsMap = {
      DEGEN_ORBIT: {
        scans: stats.scans_2h || 0,
        groups: (stats.groups_2h || []).filter((g: any) => g !== null).length,
      },
      MAINFRAME: {
        scans: stats.scans_8h || 0,
        groups: (stats.groups_8h || []).filter((g: any) => g !== null).length,
      },
      SENTIMENT_CORE: {
        scans: stats.scans_24h || 0,
        groups: (stats.groups_24h || []).filter((g: any) => g !== null).length,
      },
    };

    const newActiveZones: string[] = [];
    (Object.keys(ZONE_CRITERIA) as ZoneName[]).forEach((zoneName) => {
      const criteria = ZONE_CRITERIA[zoneName];
      const currentStats = statsMap[zoneName];
      if (
        currentStats.scans >= criteria.scans &&
        currentStats.groups >= criteria.groups
      ) {
        newActiveZones.push(criteria.name);
      }
    });

    const zonesEntered = newActiveZones.filter(
      (z) => !oldActiveZones.includes(z)
    ) as ZoneName[];
    const zonesExited = oldActiveZones.filter(
      (z) => !newActiveZones.includes(z)
    );

    if (zonesEntered.length > 0) {
      // Fetch the latest MCAP from Jupiter
      const jupiterData = await fetchTokenData(tokenDoc.mintAddress);
      const latestMarketCap =
        jupiterData?.marketCap || tokenDoc.currentMarketCap;

      zonesEntered.forEach((zone) => {
        tokenDoc.zoneState[zone] = {
          entryMcap: latestMarketCap, // Use the latest MCAP
          athMcapSinceEntry: latestMarketCap,
          entryTimestamp: now,
        };
      });
    }

    if (zonesExited.length > 0) {
      zonesExited.forEach((zone) => {
        delete (tokenDoc.zoneState as any)[zone];
        broadcastService.broadcastZoneExit(tokenDoc.mintAddress, zone);
      });
    }

    if (zonesEntered.length > 0 || zonesExited.length > 0) {
      tokenDoc.activeZones = newActiveZones;
      tokenDoc.markModified("zoneState");
      await tokenDoc.save();

      const token = tokenDoc.toObject({ virtuals: true }); // Use plain object with virtuals

      if (zonesEntered.length > 0) {
        broadcastService.broadcastZoneEntry(token);

        const alertTasks: { user: any; zone: ZoneName; entryMcap: number }[] =
          [];

        for (const zone of zonesEntered) {
          const usersToAlert = await UserModel.find({
            "telegram.chatId": { $exists: true },
            [`telegram.alertSettings.${zone}`]: true,
          }).lean(); // Fetch users who want alerts for this zone

          console.log(
            `[Alerts] Found ${usersToAlert.length} users to alert for ${token.symbol} entering ${zone}`
          );

          usersToAlert.forEach((user) => {
            if (user.telegram?.chatId) {
              alertTasks.push({
                user: user,
                zone: zone,
                entryMcap: token.zoneState[zone].entryMcap,
              });
            }
          });
        }

        // --- THIS IS THE FIX for Concurrent Sending ---
        if (alertTasks.length > 0) {
          console.log(
            `[Alerts] Sending ${alertTasks.length} zone entry alerts concurrently for ${token.symbol}...`
          );
          const alertCreationData: any[] = []; // Collect data to create TelegramAlert docs

          for (const task of alertTasks) {
            // Call sendTelegramAlert but don't await the result directly
            const messageIdPromise = sendTelegramAlert(
              task.user.telegram.chatId,
              token,
              task.zone
            );

            // Store the promise result and necessary data
            alertCreationData.push(
              messageIdPromise.then((messageId) => ({
                messageId: messageId, // Will be null if failed or blocked
                user: task.user,
                zone: task.zone,
                entryMcap: task.entryMcap,
                token: token,
              }))
            );

            // Apply throttling *between starting* sends
            await sleep(TELEGRAM_RATE_LIMIT_DELAY);
          }

          // Wait for all send attempts to finish
          const results = await Promise.all(alertCreationData);

          // Create TelegramAlert documents only for successful sends
          const successfulAlerts = results.filter((r) => r.messageId !== null);
          if (successfulAlerts.length > 0) {
            const bulkCreateOps = successfulAlerts.map((r) => ({
              user: r.user._id,
              token: r.token._id,
              zoneName: r.zone,
              chatId: r.user.telegram.chatId,
              messageId: r.messageId,
              entryMcap: r.entryMcap,
              checkpointsHit: [],
            }));
            await TelegramAlertModel.insertMany(bulkCreateOps);
            console.log(
              `[Alerts] Stored ${successfulAlerts.length} successful alert records for ${token.symbol}.`
            );
          }
        }
        // --- END FIX ---
      }
    }

    await updateAttentionScore(tokenDoc._id);
  } catch (error) {
    console.error(
      `[Alerts] Error checking alerts for token ${tokenId}:`,
      error
    );
  }
};
