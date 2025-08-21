import { Request, Response } from "express";
import { TokenModel } from "../models/token.model";
import { ZONE_CRITERIA } from "../config/zones";

export const getZoneTokens = async (req: Request, res: Response) => {
  try {
    const activeTokens = await TokenModel.find({
      activeZones: { $ne: [] },
    }).lean();

    // Initialize the response structure with criteria from our central config
    const zonesResponse: any = {
      DEGEN_ORBIT: { criteria: ZONE_CRITERIA.DEGEN_ORBIT, tokens: [] },
      MAINFRAME: { criteria: ZONE_CRITERIA.MAINFRAME, tokens: [] },
      SENTIMENT_CORE: { criteria: ZONE_CRITERIA.SENTIMENT_CORE, tokens: [] },
    };

    // Distribute tokens into their respective zones
    activeTokens.forEach((token) => {
      token.activeZones.forEach((zone) => {
        if (zonesResponse[zone]) {
          zonesResponse[zone].tokens.push(token);
        }
      });
    });

    res.status(200).json(zonesResponse);
  } catch (error) {
    console.error("Error fetching zone tokens:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
