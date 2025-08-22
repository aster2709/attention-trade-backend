import { TokenModel } from "../models/token.model";
import { ScanModel } from "../models/scan.model";
import mongoose from "mongoose";
import { broadcastService } from "./broadcast.service";
import { ZONE_CRITERIA } from "../config/zones";
import { updateAttentionScore } from "./attentionScore.service";

// Define a type for our zone names to satisfy TypeScript
type ZoneName = keyof typeof ZONE_CRITERIA;

export const checkAndTriggerAlerts = async (
  tokenId: mongoose.Types.ObjectId
) => {
  try {
    const token = await TokenModel.findById(tokenId);
    if (!token) return;

    const oldActiveZones = token.activeZones || [];
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
    );
    // Corrected logic
    const zonesExited = oldActiveZones.filter(
      (z) => !newActiveZones.includes(z)
    );

    if (zonesEntered.length > 0) {
      zonesEntered.forEach((zone) => {
        token.zoneState[zone] = {
          entryMcap: token.currentMarketCap,
          athMcapSinceEntry: token.currentMarketCap,
          entryTimestamp: now,
        };
      });
    }

    if (zonesExited.length > 0) {
      zonesExited.forEach((zone) => {
        delete token.zoneState[zone];
        broadcastService.broadcastZoneExit(token.mintAddress, zone);
      });
    }

    if (zonesEntered.length > 0 || zonesExited.length > 0) {
      token.activeZones = newActiveZones;
      token.markModified("zoneState");
      await token.save();

      if (zonesEntered.length > 0) {
        broadcastService.broadcastZoneEntry(token);
      }
    }

    await updateAttentionScore(token._id);
  } catch (error) {
    console.error(
      `[Alerts] Error checking alerts for token ${tokenId}:`,
      error
    );
  }
};
