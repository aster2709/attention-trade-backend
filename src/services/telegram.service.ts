import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH as string;

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
}
