import "dotenv/config";
import * as cron from "node-cron";
import axios from "axios";
import { UserModel } from "../models/user.model";
import { sendTokenGateDisabledAlert } from "./telegram.bot.service"; // We'll add sendTokenGateDisabledAlert next
import { ZONE_CRITERIA } from "../config/zones";

const ATTN_MINT = process.env.ATTN_TOKEN_MINT_ADDRESS;
const REQUIRED_AMOUNT = parseFloat(
  process.env.TOKEN_GATE_HOLDING_AMOUNT || "250000"
);
const JUP_HOLDINGS_API = "https://lite-api.jup.ag/ultra/v1/holdings/";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches the UI amount of a specific token held by a wallet using Jupiter API.
 * @param walletAddress The Solana wallet address.
 * @param tokenMint The mint address of the token to check.
 * @returns The UI amount held, or 0 if not found or error.
 */
async function getTokenBalance(
  walletAddress: string,
  tokenMint: string
): Promise<number> {
  if (!walletAddress || !tokenMint) return 0;
  try {
    const response = await axios.get(`${JUP_HOLDINGS_API}${walletAddress}`);
    const holdings = response.data;

    // Find the specific token in the response
    const tokenAccounts = holdings?.tokens?.[tokenMint];

    if (
      tokenAccounts &&
      Array.isArray(tokenAccounts) &&
      tokenAccounts.length > 0
    ) {
      // Sum up the uiAmount from all accounts holding this token
      const totalUiAmount = tokenAccounts.reduce(
        (sum, account) => sum + (account.uiAmount || 0),
        0
      );
      return totalUiAmount;
    }
    return 0; // Token not found in holdings
  } catch (error: any) {
    // Handle API errors gracefully (e.g., rate limits, invalid address)
    if (error.response?.status === 404) {
      // Wallet not found or has no holdings JUP knows about
      // console.log(`[TokenGate] Wallet ${walletAddress} not found or no relevant holdings via Jupiter.`);
    } else {
      console.error(
        `[TokenGate] Error fetching holdings for ${walletAddress}:`,
        error.message
      );
    }
    return 0; // Return 0 on error
  }
}

class TokenGateService {
  private job: cron.ScheduledTask;
  private isRunning: boolean = false;

  constructor() {
    // Schedule to run once every hour (adjust '0 * * * *' as needed)
    this.job = cron.schedule("* * * * *", () => this.runCheck());
  }

  public start() {
    if (!ATTN_MINT || !REQUIRED_AMOUNT) {
      console.error(
        "[TokenGate] ATTN_TOKEN_MINT_ADDRESS or TOKEN_GATE_HOLDING_AMOUNT not set in .env. Service disabled."
      );
      return;
    }
    console.log(
      `[Cron] Starting Token Gate Service (Requires ${REQUIRED_AMOUNT} $ATTN)...`
    );
    this.job.start();
  }

  private async runCheck() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[TokenGate] Running hourly check...");

    try {
      // Find users who have Telegram linked AND have at least one alert enabled
      const usersToCheck = await UserModel.find({
        walletAddress: { $exists: true },
        "telegram.chatId": { $exists: true },
        // Check if any alert setting is true
        $or: Object.keys(ZONE_CRITERIA).map((zone) => ({
          [`telegram.alertSettings.${zone}`]: true,
        })),
      });

      console.log(
        `[TokenGate] Found ${usersToCheck.length} users with active Telegram alerts to check.`
      );

      for (const user of usersToCheck) {
        if (!user.telegram) continue; // Should not happen due to query, but safety check

        const balance = await getTokenBalance(user.walletAddress!, ATTN_MINT!);
        console.log(
          `[TokenGate] Wallet ${user.walletAddress} balance: ${balance} $ATTN`
        );

        if (balance < REQUIRED_AMOUNT) {
          console.log(
            `[TokenGate] User ${
              user.telegram.username || user.telegram.chatId
            } below threshold. Disabling alerts.`
          );

          // Disable all alerts
          let settingsChanged = false;
          for (const zoneName in ZONE_CRITERIA) {
            if (user.telegram.alertSettings[zoneName] === true) {
              user.telegram.alertSettings[zoneName] = false;
              settingsChanged = true;
            }
          }

          if (settingsChanged) {
            user.markModified("telegram.alertSettings");
            await user.save();

            // Send notification
            await sendTokenGateDisabledAlert(
              user.telegram.chatId,
              REQUIRED_AMOUNT
            );
          }
        }

        // Rate limit API calls
        await sleep(200); // ~5 calls per second
      }
    } catch (error) {
      console.error("[TokenGate] Error during check:", error);
    } finally {
      this.isRunning = false;
      console.log("[TokenGate] Finished check.");
    }
  }
}

export const tokenGateService = new TokenGateService();
