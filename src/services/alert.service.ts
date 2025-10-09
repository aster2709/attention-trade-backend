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

/**
 * Sends a formatted Telegram alert to a specific user.
 * @param chatId The user's Telegram chat ID.
 * @param token The token that entered the zone.
 * @param zoneName The name of the zone entered.
 * @returns The sent message ID, or null if failed.
 */
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

  // Construct the rich message using Markdown
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
    // Send a photo with the caption and trade links
    const sentMessage = await telegramBot.telegram.sendPhoto(chatId, logo, {
      caption: message,
      parse_mode: "Markdown",
      ...tradeLinks,
    });
    console.log(
      `[Alerts] Sent Telegram alert for ${token.symbol} to chat ID ${chatId}`
    );

    return sentMessage.message_id; // Return message ID for storage
  } catch (error) {
    console.error(
      `[Alerts] Failed to send Telegram alert to ${chatId}:`,
      error
    );
    return null;
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

      // Use the tokenDoc directly instead of querying again with .lean()
      const token = tokenDoc;

      if (zonesEntered.length > 0) {
        broadcastService.broadcastZoneEntry(token);

        for (const zone of zonesEntered) {
          const usersToAlert = await UserModel.find({
            "telegram.chatId": { $exists: true },
            [`telegram.alertSettings.${zone}`]: true,
          }).lean();

          console.log(
            `[Alerts] Found ${usersToAlert.length} users to alert for ${token.symbol} entering ${zone}`
          );
          for (const user of usersToAlert) {
            if (user.telegram?.chatId) {
              const messageId = await sendTelegramAlert(
                user.telegram.chatId,
                token,
                zone
              );
              if (messageId) {
                // NEW: Store the sent alert
                await TelegramAlertModel.create({
                  user: user._id,
                  token: token._id,
                  zoneName: zone,
                  chatId: user.telegram.chatId,
                  messageId,
                  entryMcap: token.zoneState[zone].entryMcap,
                  checkpointsHit: [],
                });
              }
            }
          }
        }
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
