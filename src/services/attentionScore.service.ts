import { TokenModel } from "../models/token.model";
import { ScanModel } from "../models/scan.model";
import { broadcastService } from "./broadcast.service";
import mongoose from "mongoose";

// --- Configuration for the formula ---
const WEIGHTS = { scans: 0.15, groups: 0.25, rick: 0.2, x: 0.4 };
const MAX_VALUES = {
  scans: 20,
  groups: 10,
  rickViews: 50000,
  xEngagement: 250000,
};

/**
 * Calculates, saves, and broadcasts an updated attention score for a given token.
 * This is our central, real-time scoring function.
 * @param tokenId The ObjectId of the token to update.
 */
export async function updateAttentionScore(
  tokenId: mongoose.Types.ObjectId
): Promise<void> {
  try {
    const token = await TokenModel.findById(tokenId);
    if (!token || token.activeZones.length === 0) {
      // If a token is no longer active, its score can be reset or ignored
      if (token && token.attentionScore !== 0) {
        token.attentionScore = 0;
        await token.save();
        broadcastService.broadcastStatsUpdate(token.mintAddress, {
          attentionScore: 0,
        });
      }
      return;
    }

    // Get recent scan stats for the token
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const statsResult = await ScanModel.aggregate([
      { $match: { token: tokenId, createdAt: { $gte: twoHoursAgo } } },
      {
        $group: {
          _id: "$token",
          scans_2h: { $sum: 1 },
          groups_2h: { $addToSet: "$groupId" },
        },
      },
    ]);

    const scanStats = statsResult[0] || { scans_2h: 0, groups_2h: [] };
    const distinctGroupsCount = scanStats.groups_2h.length;

    // --- Perform Calculation ---
    const scaledScans = Math.min(scanStats.scans_2h / MAX_VALUES.scans, 1);
    const scaledGroups = Math.min(distinctGroupsCount / MAX_VALUES.groups, 1);
    const scaledRick = Math.min(
      (token.rickViews || 0) / MAX_VALUES.rickViews,
      1
    );
    const xEngagement = token.xPostCount * 5000 + token.xPostViews;
    const scaledX = Math.min(xEngagement / MAX_VALUES.xEngagement, 1);

    const totalScore =
      scaledScans * WEIGHTS.scans +
      scaledGroups * WEIGHTS.groups +
      scaledRick * WEIGHTS.rick +
      scaledX * WEIGHTS.x;

    const newScore = Math.round(totalScore * 100);

    // --- Update, Save, and Broadcast if changed ---
    if (newScore !== token.attentionScore) {
      token.attentionScore = newScore;
      await token.save();

      broadcastService.broadcastStatsUpdate(token.mintAddress, {
        attentionScore: newScore,
      });
      console.log(`Score updated for ${token.symbol}: ${newScore}`);
    }
  } catch (error) {
    console.error(
      `[Attention Score] Error updating score for token ${tokenId}:`,
      error
    );
  }
}
