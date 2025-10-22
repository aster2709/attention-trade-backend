import { Telegraf } from "telegraf";
import { UserModel } from "../models/user.model";
import crypto from "crypto";
import { config } from "../config/env";
import { formatNumber } from "../utils/formatters";

const BOT_TOKEN = config.TG_BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("TG_BOT_TOKEN is not defined in the .env file.");
}

export const bot = new Telegraf(BOT_TOKEN);

/**
 * Handles the /link command from a user in Telegram.
 */
bot.command("link", async (ctx) => {
  const chatId = ctx.chat.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;

  // Generate a unique, short, and user-friendly code
  const linkCode = crypto.randomBytes(3).toString("hex").toUpperCase();
  const linkCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // Code expires in 5 minutes

  // Store this information in the user's document
  // We find by chatId and create/update the record (upsert)
  await UserModel.findOneAndUpdate(
    { "telegram.chatId": chatId },
    {
      $set: {
        "telegram.username": username,
        "telegram.firstName": firstName,
        "telegram.linkCode": linkCode,
        "telegram.linkCodeExpires": linkCodeExpires,
      },
    },
    { upsert: true, new: true }
  );

  // Reply to the user with their code
  await ctx.reply(
    `Your one-time linking code is: \`${linkCode}\`\n\n` +
      `Enter this code on the attention.trade website to link your wallet. This code will expire in 5 minutes.`,
    { parse_mode: "Markdown" }
  );
});

bot.on("message", (ctx) => {
  const chat = ctx.chat;
  if (chat.type.endsWith("group")) {
    console.log(
      `📍 Group detected: ${(chat as any)?.title as any} (${chat.id})`
    );
  }
});

/**
 * Sends an alert for the first time a token is scanned.
 * @param token The newly created token object.
 * @param groupName The name of the group where the token was first scanned.
 */
export async function sendFirstScanAlert(token: any, groupName: string) {
  // Add the "Scanned In" field to the message
  const message = `
*$${token.symbol.toUpperCase()}* (${token.name}) ✨

*Scanned In:* ${groupName} 
*MCap:* $${formatNumber(token.currentMarketCap || 0).toLocaleString()}


\`${token.mintAddress}\`
`;

  // Create inline keyboard for trade links
  const tradeLinks = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "AXI",
            url: `https://axiom.trade/t/${token.mintAddress}`,
          },
          {
            text: token.mintAddress.includes("pump") ? "PUMP" : "PHO",
            url: token.mintAddress.includes("pump")
              ? `https://pump.fun/coin/${token.mintAddress}`
              : `https://photon-sol.tinyastro.io/en/lp/${token.mintAddress}`,
          },
          {
            text: "DEX",
            url: `https://dexscreener.com/solana/${token.mintAddress}`,
          },
        ],
      ],
    },
  };

  try {
    const logo = token.logoURI || "https://i.imgur.com/v81nW21.png";
    await bot.telegram.sendPhoto(847122773, logo, {
      caption: message,
      parse_mode: "Markdown",
      ...tradeLinks,
    });
    console.log(
      `✅ [Telegram Bot] Sent first scan alert for $${token.symbol} to admin.`
    );
  } catch (error) {
    console.error(
      `[Telegram Bot] Failed to send first scan alert for $${token.symbol}:`,
      error
    );
  }
}

export async function sendTokenGateDisabledAlert(
  chatId: number,
  requiredAmount: number
) {
  const message =
    `⚠️ Your attention.trade Telegram alerts have been *disabled*.\n\n` +
    `Holding at least *${requiredAmount.toLocaleString()} $ATTN* is required to receive alerts.\n\n` +
    `You can re-enable alerts in the zone settings on the website once you meet the requirement.`;

  try {
    await bot.telegram.sendMessage(chatId, message, { parse_mode: "Markdown" });
    console.log(
      `✅ [Telegram Bot] Sent token gate disabled alert to chat ${chatId}.`
    );
  } catch (error: any) {
    // Avoid spamming logs if the user blocked the bot after the check ran
    if (!error.message?.includes("Forbidden: bot was blocked by the user")) {
      console.error(
        `[Telegram Bot] Failed to send token gate disabled alert to chat ${chatId}:`,
        error
      );
    }
  }
}

/**
 * Starts the Telegram bot.
 */
export function startTelegramBot() {
  console.log("🤖 [Telegram Bot] Starting bot...");
  bot.launch();
  console.log("✅ [Telegram Bot] Bot is now polling for updates.");
}
