import { NewMessage, NewMessageEvent } from "telegram/events";
import { tgClient } from "./telegram.service"; // Ensure tgClient is correctly imported and initialized
import { TokenModel } from "../models/token.model";
import { updateAttentionScore } from "./attentionScore.service";

const RICK_USER_ID = "6126376117";
const SOURCE_GROUP_CHAT_ID = process.env.SOURCE_GROUP_CHAT_ID; // Load from .env
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID; // Load from .env

/**
 * Parses Rick Views from a message.
 * @param message The message text.
 * @returns The view count or null.
 */
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

/**
 * Extracts the first Solana (base58, 32-44 chars) or EVM (0x..., 42 chars) address found.
 * @param message The message text.
 * @returns The extracted address string or null.
 */
function extractAddress(message: string): string | null {
  // Regex combines Solana and EVM address patterns
  const addressMatch = message.match(
    /([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})/
  );
  return addressMatch ? addressMatch[0] : null;
}

/**
 * Checks if an address is an EVM address.
 * @param address The address string.
 * @returns True if it's an EVM address, false otherwise.
 */
function isEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Starts the Telegram message listener and handles incoming messages.
 */
export function startTelegramListener() {
  console.log("[Telegram] Starting message listener...");

  if (!SOURCE_GROUP_CHAT_ID || !TARGET_CHAT_ID) {
    console.warn(
      "[Telegram] SOURCE_GROUP_CHAT_ID or TARGET_CHAT_ID not set in .env. BSC address forwarding disabled."
    );
  }

  tgClient.addEventHandler(async (event: NewMessageEvent) => {
    try {
      const message = event.message;
      const senderId = message?.senderId?.toString();
      const chatId = message?.chatId?.toString();
      const messageText = message?.message;

      if (!messageText || !senderId || !chatId) {
        return; // Ignore messages without text, sender, or chat ID
      }

      console.log(
        `[Listener] New message from ${senderId} in chat ${chatId}: ${messageText}`
      );

      // --- Logic for Rick Bot Messages ---
      if (senderId === RICK_USER_ID) {
        console.log("[Listener] Processing Rick Bot message...");
        const address = extractAddress(messageText);
        console.log(`[Listener] Extracted address: ${address}`);
        if (!address) {
          console.log(
            "[Listener] Rick message detected, but no address found."
          );
          return;
        }

        const rickViews = parseRickViews(messageText);
        if (rickViews === null) {
          console.log(
            `[Listener] Could not parse Rick views for address: ${address}`
          );
          return;
        }

        const updateResult = await TokenModel.findOneAndUpdate(
          { mintAddress: address }, // Find by either Solana or EVM address
          { $set: { rickViews: rickViews } },
          { new: true }
        );

        if (updateResult) {
          console.log(
            `✅ [Listener] Updated Rick views for ${updateResult.symbol} (${address}) to ${rickViews}`
          );
          await updateAttentionScore(updateResult._id);
        } else {
          console.log(
            `[Listener] Received Rick views for address ${address}, but token not found in DB.`
          );
        }
        return; // Processed Rick message, stop here
      }

      // --- Logic for Forwarding EVM Addresses from Source Group ---
      if (
        SOURCE_GROUP_CHAT_ID &&
        chatId === SOURCE_GROUP_CHAT_ID &&
        TARGET_CHAT_ID
      ) {
        console.log(
          "[Listener] Processing message from source group for EVM address..."
        );
        const address = extractAddress(messageText);
        console.log(`[Listener] Extracted address: ${address}`);

        console.log(
          `[Listener] Checking if address is valid EVM address... is: ${isEvmAddress(
            address || "null"
          )}`
        );
        // Check if a valid EVM address was found
        if (address && isEvmAddress(address)) {
          console.log(
            `[Listener] EVM address ${address} found in source group ${chatId}. Forwarding...`
          );
          try {
            await tgClient.sendMessage(+TARGET_CHAT_ID, { message: address });
            console.log(
              `✅ [Listener] Forwarded EVM address ${address} to target chat ${TARGET_CHAT_ID}.`
            );
          } catch (forwardError) {
            console.error(
              `[Listener] Failed to forward EVM address ${address}:`,
              forwardError
            );
          }
        }
        // No return here, message might contain other info (or might not be relevant)
      }
    } catch (error) {
      console.error("[Listener] Error processing Telegram message:", error);
    }
  }, new NewMessage({}));
}
