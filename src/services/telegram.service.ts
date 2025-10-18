import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { config } from "../config/env";

const apiId = Number(config.TG_API_ID);
const apiHash = config.TG_API_HASH;

if (!apiId || !apiHash) {
  throw new Error("Missing TG_API_ID or TG_API_HASH from .env file");
}

const sessionPath = path.resolve(process.cwd(), "session.txt");
const sessionString = fs.existsSync(sessionPath)
  ? fs.readFileSync(sessionPath, "utf-8")
  : "";

export const tgClient = new TelegramClient(
  new StringSession(sessionString),
  apiId,
  apiHash,
  {
    connectionRetries: 5,
  }
);

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function getRecentChatIds() {
  if (!tgClient.connected) {
    console.error("Telegram client is not connected.");
    return;
  }

  console.log("Fetching recent dialogs...");
  const recentDialogs = [];
  try {
    for await (const dialog of tgClient.iterDialogs({ limit: 20 })) {
      if (dialog.entity) {
        // Access the username property, it might be undefined
        const username = (dialog.entity as any).username; // Cast to 'any' to access potential username

        recentDialogs.push({
          name: dialog.title,
          id: dialog.entity.id.toString(),
          username: username || "N/A", // Add username, default to 'N/A' if missing
          type: dialog.entity.className,
        });
      }
    }
    console.log("Recent Chat IDs, Names, and Usernames:", recentDialogs);
  } catch (error) {
    console.error("Error fetching dialogs:", error);
  }
}

// Example call (run after client connects)
// setTimeout(getRecentChatIds, 5000);

// You would call this function after the client is connected, e.g.,
// setTimeout(getRecentChatIds, 5000); // Call after 5 seconds

export async function initTelegramClient(): Promise<void> {
  console.log("[Telegram] Initializing client...");
  await tgClient.start({
    phoneNumber: async () => await prompt("📱 Enter your phone number: "),
    password: async () => await prompt("🔑 Enter 2FA password: "),
    phoneCode: async () => await prompt("✉️ Enter the code you received: "),
    onError: (err) => console.error("[Telegram] Login error:", err),
  });

  console.log("✅ [Telegram] Client connected successfully.");
  const session = (tgClient.session as StringSession).save();
  fs.writeFileSync(sessionPath, session, { encoding: "utf-8" });
  console.log("✅ [Telegram] Session saved to session.txt");

  await getRecentChatIds();
}
