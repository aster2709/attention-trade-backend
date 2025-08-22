// src/config/env.ts
import "dotenv/config";

// Interface for type safety
interface EnvConfig {
  PORT: number;
  MONGO_URI: string;
  WEBSOCKET_STREAM_URL: string;
  TG_BOT_TOKEN: string;
  TG_API_ID: number;
  TG_API_HASH: string;
  TWITTER_CT0: string;
  TWITTER_AUTH_TOKEN: string;
  TWITTER_CT0_2: string;
  TWITTER_AUTH_TOKEN_2: string;
}

/**
 * Validates and returns environment variables.
 * Throws an error if a required variable is missing or invalid.
 */
function getSanitizedConfig(): EnvConfig {
  const requiredVars = [
    "MONGO_URI",
    "WEBSOCKET_STREAM_URL",
    "TG_BOT_TOKEN",
    "TG_API_ID",
    "TG_API_HASH",
    "TWITTER_CT0",
    "TWITTER_AUTH_TOKEN",
    "TWITTER_CT0_2",
    "TWITTER_AUTH_TOKEN_2",
  ];

  for (const requiredVar of requiredVars) {
    if (!process.env[requiredVar]) {
      throw new Error(
        `[ENV Validation] Missing required environment variable: ${requiredVar}`
      );
    }
  }

  const port = parseInt(process.env.PORT || "4000", 10);
  if (isNaN(port)) {
    throw new Error("[ENV Validation] PORT must be a number.");
  }

  const apiId = parseInt(process.env.TG_API_ID!, 10);
  if (isNaN(apiId)) {
    throw new Error("[ENV Validation] TG_API_ID must be a number.");
  }

  return {
    PORT: port,
    MONGO_URI: process.env.MONGO_URI!,
    WEBSOCKET_STREAM_URL: process.env.WEBSOCKET_STREAM_URL!,
    TG_BOT_TOKEN: process.env.TG_BOT_TOKEN!,
    TG_API_ID: apiId,
    TG_API_HASH: process.env.TG_API_HASH!,
    TWITTER_CT0: process.env.TWITTER_CT0!,
    TWITTER_AUTH_TOKEN: process.env.TWITTER_AUTH_TOKEN!,
    TWITTER_CT0_2: process.env.TWITTER_CT0_2!,
    TWITTER_AUTH_TOKEN_2: process.env.TWITTER_AUTH_TOKEN_2!,
  };
}

// Export a frozen, immutable config object
export const config = Object.freeze(getSanitizedConfig());
