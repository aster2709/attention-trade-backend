import * as cron from "node-cron";
import { TokenModel } from "../models/token.model";
import { ScanModel } from "../models/scan.model";
import { ZONE_CRITERIA } from "../config/zones";
import { broadcastService } from "./broadcast.service";
import { updateAttentionScore } from "./attentionScore.service"; // Import for score update

type ZoneName = keyof typeof ZONE_CRITERIA;

class ZoneReevaluationService {
  private job: cron.ScheduledTask;
  private isRunning: boolean = false;

  constructor() {
    this.job = cron.schedule("*/5 * * * *", () => this.runReevaluation());
  }

  public start() {
    console.log("[Cron] Starting Zone Reevaluation Service...");
    this.job.start();
  }

  private async runReevaluation() {
    if (this.isRunning) {
      console.log(
        "[Reevaluation] Skip run: Previous cycle is still in progress."
      );
      return;
    }
    this.isRunning = true;
    console.log("[Reevaluation] Starting zone reevaluation cycle...");

    try {
      const activeTokens = await TokenModel.find({
        activeZones: { $ne: [] },
      }).lean();
      if (activeTokens.length === 0) {
        console.log("[Reevaluation] No active tokens to reevaluate.");
        return;
      }

      console.log(
        `[Reevaluation] Found ${activeTokens.length} active tokens to reevaluate.`
      );

      for (const token of activeTokens) {
        const tokenId = token._id;
        const oldActiveZones = [...token.activeZones];

        const now = new Date();
        const results = await ScanModel.aggregate([
          { $match: { token: tokenId } },
          {
            $facet: {
              degenOrbit: [
                {
                  $match: {
                    createdAt: {
                      $gte: new Date(
                        now.getTime() -
                          ZONE_CRITERIA.DEGEN_ORBIT.windowHours * 3600 * 1000
                      ),
                    },
                  },
                },
                {
                  $group: {
                    _id: "$token",
                    scans: { $sum: 1 },
                    groups: { $addToSet: "$groupId" },
                  },
                },
              ],
              mainframe: [
                {
                  $match: {
                    createdAt: {
                      $gte: new Date(
                        now.getTime() -
                          ZONE_CRITERIA.MAINFRAME.windowHours * 3600 * 1000
                      ),
                    },
                  },
                },
                {
                  $group: {
                    _id: "$token",
                    scans: { $sum: 1 },
                    groups: { $addToSet: "$groupId" },
                  },
                },
              ],
              sentimentCore: [
                {
                  $match: {
                    createdAt: {
                      $gte: new Date(
                        now.getTime() -
                          ZONE_CRITERIA.SENTIMENT_CORE.windowHours * 3600 * 1000
                      ),
                    },
                  },
                },
                {
                  $group: {
                    _id: "$token",
                    scans: { $sum: 1 },
                    groups: { $addToSet: "$groupId" },
                  },
                },
              ],
            },
          },
        ]);

        const statsMap = {
          DEGEN_ORBIT: results[0]?.degenOrbit[0] || { scans: 0, groups: [] },
          MAINFRAME: results[0]?.mainframe[0] || { scans: 0, groups: [] },
          SENTIMENT_CORE: results[0]?.sentimentCore[0] || {
            scans: 0,
            groups: [],
          },
        };

        const newActiveZones: string[] = [];
        (Object.keys(ZONE_CRITERIA) as ZoneName[]).forEach((zoneName) => {
          const criteria = ZONE_CRITERIA[zoneName];
          const currentStats = statsMap[zoneName];
          if (
            currentStats.scans >= criteria.scans &&
            currentStats.groups.length >= criteria.groups
          ) {
            newActiveZones.push(criteria.name);
          }
        });

        const zonesExited = oldActiveZones.filter(
          (z) => !newActiveZones.includes(z)
        ) as ZoneName[];
        if (zonesExited.length > 0) {
          const tokenDoc = await TokenModel.findById(tokenId);
          if (!tokenDoc) continue;

          zonesExited.forEach((zone) => {
            delete (tokenDoc.zoneState as any)[zone];
            broadcastService.broadcastZoneExit(token.mintAddress, zone);
          });

          tokenDoc.activeZones = newActiveZones;
          tokenDoc.markModified("zoneState");
          await tokenDoc.save();

          // Update attention score directly instead of re-running full alerts
          await updateAttentionScore(tokenId);
          console.log(
            `[Reevaluation] Removed ${
              token.symbol
            } from zones: ${zonesExited.join(", ")}`
          );
        }
      }

      console.log("[Reevaluation] Finished zone reevaluation cycle.");
    } catch (error) {
      console.error("[Reevaluation] Error during reevaluation cycle:", error);
    } finally {
      this.isRunning = false;
    }
  }
}

export const zoneReevaluationService = new ZoneReevaluationService();
