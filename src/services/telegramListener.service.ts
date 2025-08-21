import { NewMessage, NewMessageEvent } from "telegram/events";
import { tgClient } from "./telegram.service";
import { TokenModel } from "../models/token.model";
import { updateAttentionScore } from "./attentionScore.service";

// --- CHANGE 1: Store Rick's ID as a string for easy comparison ---
const RICK_USER_ID = "6126376117";

function parseRickViews(message: string): number | null {
  const viewMatch = message.match(/👀\s*([\d.]+K?)/i);
  if (!viewMatch || !viewMatch[1]) return null;

  const viewString = viewMatch[1].toUpperCase();
  let rickViews: number;

  if (viewString.endsWith("K")) {
    rickViews = Math.round(parseFloat(viewString.slice(0, -1)) * 1000);
  } else {
    rickViews = parseInt(viewString, 10);
  }

  return isNaN(rickViews) ? null : rickViews;
}

function extractMint(message: string): string | null {
  const mintMatch = message.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  return mintMatch ? mintMatch[0] : null;
}

export function startTelegramListener() {
  console.log("[Telegram] Starting message listener...");
  tgClient.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const message = event.message;
      const senderId = message.senderId;

      // --- CHANGE 2: Compare the senderId by converting it to a string ---
      if (
        !message?.message ||
        !senderId ||
        senderId.toString() !== RICK_USER_ID
      ) {
        return; // Ignore if not a text message from Rick
      }

      const mint = extractMint(message.message);
      if (!mint) return;

      const rickViews = parseRickViews(message.message);
      if (rickViews === null) {
        console.log(`[Listener] Could not parse Rick views for mint: ${mint}`);
        return;
      }

      const updateResult = await TokenModel.findOneAndUpdate(
        { mintAddress: mint },
        { $set: { rickViews: rickViews } },
        { new: true } // Return the updated document
      );
      console.log(
        `✅ [Listener] Updated Rick views for ${mint} to ${rickViews}`
      );

      // --- RECALCULATE SCORE ---
      if (updateResult) {
        await updateAttentionScore(updateResult._id);
      }
    } catch (error) {
      console.error("[Listener] Error processing message:", error);
    }
  }, new NewMessage({}));
}
