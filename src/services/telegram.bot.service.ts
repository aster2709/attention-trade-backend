import { Telegraf } from "telegraf";
import { UserModel } from "../models/user.model";
import crypto from "crypto";
import { config } from "../config/env";

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

/**
 * Starts the Telegram bot.
 */
export function startTelegramBot() {
  console.log("🤖 [Telegram Bot] Starting bot...");
  bot.launch();
  console.log("✅ [Telegram Bot] Bot is now polling for updates.");
}
