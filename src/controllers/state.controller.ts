import { Request, Response } from "express";
import { TokenModel } from "../models/token.model";

export const getFullState = async (req: Request, res: Response) => {
  try {
    // 1. GET ALL ACTIVE TOKENS FOR THE ZONES
    // The .lean() query now automatically includes the new `attentionScore` field.
    const activeTokens = await TokenModel.find({
      activeZones: { $ne: [] },
    }).lean();

    const zones: Record<string, any[]> = {
      DEGEN_ORBIT: [],
      MAINFRAME: [],
      SENTIMENT_CORE: [],
    };

    activeTokens.forEach((token) => {
      token.activeZones.forEach((zone) => {
        if (zones[zone]) {
          // The full 'token' object, including attentionScore, is pushed here.
          zones[zone].push(token);
        }
      });
    });

    // 2. CALCULATE HALL OF FAME & GLOBAL STATS
    let allRoiMultipliers: number[] = [];
    const hallOfFameCandidates = activeTokens
      .map((token) => {
        let maxRoiForToken = 0;
        let entryMcapForMaxRoi = 0;
        let athMcapForMaxRoi = 0;

        Object.values(token.zoneState).forEach((state: any) => {
          if (state.entryMcap > 0) {
            const roi = state.athMcapSinceEntry / state.entryMcap;
            if (roi > maxRoiForToken) {
              maxRoiForToken = roi;
              entryMcapForMaxRoi = state.entryMcap;
              athMcapForMaxRoi = state.athMcapSinceEntry;
            }
          }
        });

        if (maxRoiForToken > 0) {
          allRoiMultipliers.push(maxRoiForToken);
        }

        return {
          mintAddress: token.mintAddress,
          symbol: token.symbol,
          logoURI: token.logoURI,
          roiMultiplier: maxRoiForToken,
          entryMcap: entryMcapForMaxRoi,
          athMcap: athMcapForMaxRoi,
        };
      })
      .sort((a, b) => b.roiMultiplier - a.roiMultiplier);

    const hallOfFame = hallOfFameCandidates.slice(0, 5);

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
      maxROI24h: hallOfFame.length > 0 ? hallOfFame[0].roiMultiplier : 0,
      activeTokenCount: activeTokens.length,
    };

    // 3. SEND THE FINAL PAYLOAD
    res.status(200).json({
      zones,
      hallOfFame,
      globalStats,
    });
  } catch (error) {
    console.error("Error fetching full state:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
