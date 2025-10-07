import { TokenModel } from "../models/token.model";
import { ScanModel } from "../models/scan.model";
import { fetchTokenData } from "./jupiter.service";
import { checkAndTriggerAlerts } from "./alert.service";
import { sendFirstScanAlert } from "./telegram.bot.service";

interface FnfScanPayload {
  token: {
    mintAddress: string;
  };
  groupProfile: {
    platformId: string;
    name: string;
  };
  sourcePlatform: "discord" | "telegram";
}

/**
 * Processes a new scan payload. It checks if the token is new,
 * fetches metadata if needed, and saves the token and scan info to the database.
 * Finally, it triggers the alert check.
 * @param scanPayload The raw data object from the 'NEW_SCAN' websocket message.
 */
export const processNewScan = async (
  scanPayload: FnfScanPayload
): Promise<void> => {
  try {
    const {
      token: { mintAddress },
      groupProfile,
      sourcePlatform,
    } = scanPayload;

    // 1. Check if we are already tracking this token.
    let token = await TokenModel.findOne({ mintAddress: mintAddress });

    // 2. LOGIC FOR A NEW TOKEN
    if (!token) {
      console.log(
        `✨ New token discovered: ${mintAddress}. Fetching metadata...`
      );
      const jupiterData = await fetchTokenData(mintAddress);

      if (!jupiterData) {
        console.error(
          `[Processor] Could not retrieve metadata for new token ${mintAddress}. Aborting scan processing.`
        );
        return;
      }

      // Create the new token document in our database
      token = await TokenModel.create({
        mintAddress: jupiterData.mintAddress,
        name: jupiterData.name,
        symbol: jupiterData.symbol,
        logoURI: jupiterData.logoURI,
        creationTimestamp: jupiterData.creationTimestamp,
        launchpad: jupiterData.launchpad,
        // The initial currentMarketCap is set from the Jupiter data
        currentMarketCap: jupiterData.marketCap || 0,
      });
      console.log(`✅ Token ${token.symbol} created successfully.`);

      // Pass the groupProfile.name to the alert function
      await sendFirstScanAlert(token, groupProfile.name); // <-- UPDATED THIS LINE
    }

    // 3. Create the Scan document
    await ScanModel.create({
      token: token._id,
      source: sourcePlatform,
      groupId: groupProfile.platformId,
      groupName: groupProfile.name,
    });

    // --- 4. EFFICIENTLY UPDATE TOKEN COUNTS ---
    // This single, atomic operation is sent to the database.
    await TokenModel.findByIdAndUpdate(token._id, {
      $inc: { scanCount: 1 }, // Atomically increment scanCount by 1
      $addToSet: { scannedInGroups: groupProfile.platformId }, // Add groupId if it's not already in the array
    });

    console.log(
      `📝 Scan logged for ${token.symbol} in group "${groupProfile.name}"`
    );

    // 4. Trigger the alert check after all data is saved.
    await checkAndTriggerAlerts(token._id);
  } catch (error) {
    console.error(
      "[Processor] An unexpected error occurred during scan processing:",
      error
    );
  }
};
