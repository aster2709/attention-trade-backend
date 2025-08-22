import "dotenv/config";
import {
  TwitterOpenApi,
  TwitterOpenApiClient,
} from "twitter-openapi-typescript";
import { Token } from "../models/token.model";
import { config } from "../config/env";

// Simplified result type for our use case
export interface TwitterSearchResult {
  newPostCount: number;
  newPostViews: number;
  latestTweetId: string | null;
}

const credentials = {
  client1: {
    ct0: config.TWITTER_CT0,
    auth_token: config.TWITTER_AUTH_TOKEN,
  },
  client2: {
    ct0: config.TWITTER_CT0_2,
    auth_token: config.TWITTER_AUTH_TOKEN_2,
  },
};

const twitterClients: { [key: string]: TwitterOpenApiClient | null } = {
  client1: null,
  client2: null,
};

// Filtering rules from your snippet
const allowedSources = [
  "Twitter for iPhone",
  "Twitter for Android",
  "Twitter Web App",
];
const EXCLUDED_USERNAME_KEYWORDS = ["ai", "kol", "auto", "signal", "darkafeth"];
const EXCLUDED_TWEET_KEYWORDS = [
  "gmgn",
  "alert",
  "channel",
  "tg",
  "telegram",
  "🚨",
  "🔴",
  "#",
  "VIP",
  "rug",
  "tools",
  "trending",
  "🚀",
];

export async function getNewTweetsForToken(
  token: Pick<Token, "mintAddress" | "symbol" | "latestTweetId">,
  clientName: "client1" | "client2" = "client1"
): Promise<TwitterSearchResult> {
  const creds = credentials[clientName];
  if (!creds.ct0 || !creds.auth_token) {
    console.error(`[Twitter] Credentials for ${clientName} not found.`);
    return { newPostCount: 0, newPostViews: 0, latestTweetId: null };
  }

  try {
    if (!twitterClients[clientName]) {
      console.log(`[Twitter] Initializing ${clientName}...`);
      twitterClients[clientName] =
        await new TwitterOpenApi().getClientFromCookies(creds);
    }
    const client = twitterClients[clientName]!;

    const searchQueryBase = `${token.mintAddress} OR $${token.symbol}`;
    const rawQuery = token.latestTweetId
      ? `${searchQueryBase} since_id:${token.latestTweetId}`
      : searchQueryBase;

    const response = await client.getTweetApi().getSearchTimeline({
      rawQuery: rawQuery,
      count: 100,
      product: "Latest",
    });

    const newTweets = response.data.data;
    if (!newTweets || newTweets.length === 0) {
      return {
        newPostCount: 0,
        newPostViews: 0,
        latestTweetId: token.latestTweetId || null,
      };
    }

    let newPostCount = 0;
    let newPostViews = 0;
    let newLatestTweetIdInBatch: string | null = token.latestTweetId || null;

    for (const item of newTweets) {
      const author = item.user?.legacy;
      const tweet = item.tweet?.legacy;
      // We only want posts from verified (blue/gold check) accounts to filter some noise
      if (!tweet || !author || !item.user.isBlueVerified) continue;

      // Apply all filtering logic from your reference
      const source = item.tweet.source?.replace(/<[^>]*>?/gm, "") ?? "Unknown";
      if (!allowedSources.includes(source)) continue;

      const tweetText = tweet.fullText.toLowerCase();
      if (
        EXCLUDED_TWEET_KEYWORDS.some((keyword) => tweetText.includes(keyword))
      )
        continue;

      const usernameLower = author.screenName.toLowerCase();
      const nameLower = author.name.toLowerCase();
      if (
        EXCLUDED_USERNAME_KEYWORDS.some(
          (keyword) =>
            usernameLower.includes(keyword) || nameLower.includes(keyword)
        )
      )
        continue;

      // This tweet passed all filters
      newPostCount++;
      newPostViews += +(item.tweet.views?.count ?? 0);

      const currentTweetId = item.tweet.restId;
      if (
        !newLatestTweetIdInBatch ||
        BigInt(currentTweetId) > BigInt(newLatestTweetIdInBatch)
      ) {
        newLatestTweetIdInBatch = currentTweetId;
      }
    }

    return {
      newPostCount,
      newPostViews,
      latestTweetId: newLatestTweetIdInBatch,
    };
  } catch (error) {
    console.error(
      `[Twitter] Error searching for ${token.symbol} using ${clientName}:`,
      error
    );
    return {
      newPostCount: 0,
      newPostViews: 0,
      latestTweetId: token.latestTweetId || null,
    };
  }
}
