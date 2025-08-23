import { Request, Response } from "express";
import { TokenModel } from "../models/token.model";
import { TelegramAlertModel } from "../models/telegramAlert.model"; // NEW IMPORT

export const getHallOfFame = async (req: Request, res: Response) => {
  try {
    // Get unique token IDs from all Telegram alerts
    const alerts = await TelegramAlertModel.distinct("token");
    if (!alerts.length) {
      return res.status(200).json([]); // No tokens with past alerts
    }

    // Fetch all tokens that have ever entered a zone
    const allTokens = await TokenModel.find({
      _id: { $in: alerts },
    }).lean();

    const hallOfFameCandidates = allTokens
      .map((token) => {
        let maxRoiForToken = 0;
        let entryMcapForMaxRoi = 0;
        let athMcapForMaxRoi = 0;

        // Calculate ROI based on current zoneState (proxy for now)
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

        // Only include tokens with valid ROI data
        if (maxRoiForToken > 0) {
          return {
            mintAddress: token.mintAddress,
            symbol: token.symbol,
            logoURI: token.logoURI,
            roiMultiplier: maxRoiForToken,
            entryMcap: entryMcapForMaxRoi,
            athMcap: athMcapForMaxRoi,
          };
        }
        return null; // Exclude tokens with no valid ROI
      })
      .filter(
        (candidate): candidate is NonNullable<typeof candidate> =>
          candidate !== null
      ) // Type guard
      .sort((a, b) => b.roiMultiplier - a.roiMultiplier);

    const hallOfFame = hallOfFameCandidates.slice(0, 5);
    res.status(200).json(hallOfFame);
  } catch (error) {
    console.error("Error fetching hall of fame:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
