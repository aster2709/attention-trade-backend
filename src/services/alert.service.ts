import mongoose from "mongoose";
import { TokenModel, Token } from "../models/token.model";
import { ScanModel } from "../models/scan.model";
import { UserModel } from "../models/user.model";
import { broadcastService } from "./broadcast.service";
import { ZONE_CRITERIA } from "../config/zones";
import { updateAttentionScore } from "./attentionScore.service";
import { bot as telegramBot } from "./telegram.bot.service";
import { formatNumber } from "../utils/formatters";

type ZoneName = keyof typeof ZONE_CRITERIA;

/**
 * Sends a formatted Telegram alert to a specific user.
 * @param chatId The user's Telegram chat ID.
 * @param token The token that entered the zone.
 * @param zoneName The name of the zone entered.
 */
const sendTelegramAlert = async (
  chatId: number,
  token: Token,
  zoneName: ZoneName
) => {
  const zoneState = token.zoneState[zoneName];
  if (!zoneState) return;

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

*First Seen:* ${formatNumber(zoneState.entryMcap)}
*ATH Since Entry:* ${formatNumber(zoneState.athMcapSinceEntry)}

🧠 *Scans:* ${token.scanCount}
👥 *Groups:* ${token.groupCount}
👀 *Rick Views:* ${(token.rickViews || 0).toLocaleString()}
𝕏 *Posts:* ${token.xPostCount}
📈 *X Views:* ${(token.xPostViews || 0).toLocaleString()}

\`${token.mintAddress}\`
    `;

  // Create inline keyboard for trade links
  const tradeLinks = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Trade on AXI",
            url: `https://axiom.trade/t/${token.mintAddress}`,
          },
          {
            text: "View on DEX",
            url: `https://dexscreener.com/solana/${token.mintAddress}`,
          },
        ],
      ],
    },
  };

  try {
    // Send a photo with the caption and trade links
    await telegramBot.telegram.sendPhoto(chatId, logo, {
      caption: message,
      parse_mode: "Markdown",
      ...tradeLinks,
    });
    console.log(
      `[Alerts] Sent Telegram alert for ${token.symbol} to chat ID ${chatId}`
    );
  } catch (error) {
    console.error(
      `[Alerts] Failed to send Telegram alert to ${chatId}:`,
      error
    );
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
      zonesEntered.forEach((zone) => {
        tokenDoc.zoneState[zone] = {
          entryMcap: tokenDoc.currentMarketCap,
          athMcapSinceEntry: tokenDoc.currentMarketCap,
          entryTimestamp: now,
        };
      });
    }

    if (zonesExited.length > 0) {
      zonesExited.forEach((zone) => {
        delete (tokenDoc.zoneState as any)[zone]; // Type assertion for deletion
        broadcastService.broadcastZoneExit(tokenDoc.mintAddress, zone);
      });
    }

    if (zonesEntered.length > 0 || zonesExited.length > 0) {
      tokenDoc.activeZones = newActiveZones;
      tokenDoc.markModified("zoneState");
      await tokenDoc.save();

      const token = await TokenModel.findById(tokenId).lean();
      if (!token) return;

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
              await sendTelegramAlert(user.telegram.chatId, token, zone);
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
