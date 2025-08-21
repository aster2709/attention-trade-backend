import { Request, Response } from "express";
import { TokenModel } from "../models/token.model";

export const getHallOfFame = async (req: Request, res: Response) => {
  try {
    const activeTokens = await TokenModel.find({
      activeZones: { $ne: [] },
    }).lean();

    const hallOfFameCandidates = activeTokens
      .map((token) => {
        let maxRoiForToken = 0;
        let entryMcapForMaxRoi = 0;
        let athMcapForMaxRoi = 0;

        Object.values(token.zoneState as any).forEach((state: any) => {
          if (state.entryMcap > 0) {
            const roi = state.athMcapSinceEntry / state.entryMcap;
            if (roi > maxRoiForToken) {
              maxRoiForToken = roi;
              entryMcapForMaxRoi = state.entryMcap;
              athMcapForMaxRoi = state.athMcapSinceEntry;
            }
          }
        });

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
    res.status(200).json(hallOfFame);
  } catch (error) {
    console.error("Error fetching hall of fame:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
