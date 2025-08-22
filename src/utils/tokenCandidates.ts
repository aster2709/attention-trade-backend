// src/utils/tokenCandidates.ts
import { ScanModel } from "../models/scan.model";
import { PRE_ENTRY_CRITERIA } from "../config/zones";
import mongoose from "mongoose";

export async function getPreEntryCandidateTokens(): Promise<
  mongoose.Types.ObjectId[]
> {
  const now = new Date();
  const candidateTokenIds: Set<mongoose.Types.ObjectId> = new Set();

  // Aggregate for all zones' pre-entry criteria
  const results = await ScanModel.aggregate([
    {
      $facet: {
        degenOrbit: [
          {
            $match: {
              createdAt: {
                $gte: new Date(
                  now.getTime() -
                    PRE_ENTRY_CRITERIA.DEGEN_ORBIT.windowHours * 3600 * 1000
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
          {
            $match: {
              scans: { $gte: PRE_ENTRY_CRITERIA.DEGEN_ORBIT.scans },
              $expr: {
                $gte: [
                  { $size: "$groups" },
                  PRE_ENTRY_CRITERIA.DEGEN_ORBIT.groups,
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
        mainframe: [
          {
            $match: {
              createdAt: {
                $gte: new Date(
                  now.getTime() -
                    PRE_ENTRY_CRITERIA.MAINFRAME.windowHours * 3600 * 1000
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
          {
            $match: {
              scans: { $gte: PRE_ENTRY_CRITERIA.MAINFRAME.scans },
              $expr: {
                $gte: [
                  { $size: "$groups" },
                  PRE_ENTRY_CRITERIA.MAINFRAME.groups,
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
        sentimentCore: [
          {
            $match: {
              createdAt: {
                $gte: new Date(
                  now.getTime() -
                    PRE_ENTRY_CRITERIA.SENTIMENT_CORE.windowHours * 3600 * 1000
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
          {
            $match: {
              scans: { $gte: PRE_ENTRY_CRITERIA.SENTIMENT_CORE.scans },
              $expr: {
                $gte: [
                  { $size: "$groups" },
                  PRE_ENTRY_CRITERIA.SENTIMENT_CORE.groups,
                ],
              },
            },
          },
          { $project: { _id: 1 } },
        ],
      },
    },
  ]);

  // Collect unique token IDs across all zones
  const facets = results[0];
  Object.values(facets)
    .flat()
    .forEach((doc: any) => {
      candidateTokenIds.add(doc._id);
    });

  return Array.from(candidateTokenIds);
}
