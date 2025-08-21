import { Request, Response } from "express";
import { TokenModel } from "../models/token.model";
import { broadcastService } from "../services/broadcast.service"; // <-- Reverted to direct import

export const getGlobalMetrics = async (req: Request, res: Response) => {
  try {
    const activeTokens = await TokenModel.find({
      activeZones: { $ne: [] },
    }).lean();

    const allRoiMultipliers: number[] = activeTokens
      .map((token) => {
        let maxRoiForToken = 0;
        Object.values(token.zoneState as any).forEach((state: any) => {
          if (state.entryMcap > 0) {
            const roi = state.athMcapSinceEntry / state.entryMcap;
            if (roi > maxRoiForToken) maxRoiForToken = roi;
          }
        });
        return maxRoiForToken;
      })
      .filter((roi) => roi > 0);

    allRoiMultipliers.sort((a, b) => a - b);

    let medianROI24h = 0;
    if (allRoiMultipliers.length > 0) {
      const mid = Math.floor(allRoiMultipliers.length / 2);
      medianROI24h =
        allRoiMultipliers.length % 2 !== 0
          ? allRoiMultipliers[mid]
          : (allRoiMultipliers[mid - 1] + allRoiMultipliers[mid]) / 2;
    }

    const globalStats = {
      medianROI24h: medianROI24h,
      maxROI24h:
        allRoiMultipliers.length > 0 ? Math.max(...allRoiMultipliers) : 0,
      activeTokenCount: activeTokens.length,
      activeUsers: broadcastService.getClientCount(), // <-- Use the singleton directly
    };

    res.status(200).json(globalStats);
  } catch (error) {
    console.error("Error fetching global metrics:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
