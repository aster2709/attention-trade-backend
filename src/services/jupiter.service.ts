import axios from "axios";

// Updated return type for fetchMultipleTokenData
export interface TokenMarketData {
  mintAddress: string;
  marketCap?: number;
}

// Kept original interface for fetchTokenData which fetches more details
export interface JupiterTokenData extends TokenMarketData {
  name: string;
  symbol: string;
  logoURI?: string;
  creationTimestamp?: Date;
  launchpad?: string;
  metaLaunchpad?: string;
  partnerConfig?: string;
}

const JUPITER_API_ENDPOINT = "https://lite-api.jup.ag/tokens/v2/search?query=";
const BIRDEYE_V3_MULTI_ENDPOINT =
  "https://public-api.birdeye.so/defi/v3/token/market-data/multiple";
const BIRDEYE_V2_OVERVIEW_ENDPOINT =
  "https://public-api.birdeye.so/defi/token_overview"; // Keep for single fetch
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches detailed token metadata for a SINGLE address (used for initial discovery).
 * Uses Jupiter for Solana, Birdeye V2 for BSC.
 * @param address The mint/contract address.
 * @returns A promise resolving to detailed JupiterTokenData or null.
 */
export const fetchTokenData = async (
  address: string
): Promise<JupiterTokenData | null> => {
  if (address.startsWith("0x")) {
    // --- BSC (EVM) Address Logic using Birdeye V2 ---
    if (!BIRDEYE_API_KEY) {
      console.error("[Birdeye V2] Error: BIRDEYE_API_KEY not configured.");
      return null;
    }
    try {
      const response = await axios.get(
        `${BIRDEYE_V2_OVERVIEW_ENDPOINT}?address=${address}`,
        { headers: { "x-chain": "bsc", "X-API-KEY": BIRDEYE_API_KEY } }
      );
      if (!response.data.success || !response.data.data) {
        console.warn(`[Birdeye V2] No data found for address: ${address}`);
        return null;
      }
      const tokenData = response.data.data;
      return {
        mintAddress: tokenData.address,
        name: tokenData.name,
        symbol: tokenData.symbol,
        logoURI: tokenData.logoURI,
        marketCap: tokenData.marketCap,
        // creationTimestamp is not reliably available in this Birdeye endpoint
      };
    } catch (error) {
      console.error(`[Birdeye V2] Failed for address ${address}:`, error);
      return null;
    }
  } else {
    // --- Solana Address Logic using Jupiter ---
    try {
      const response = await axios.get(`${JUPITER_API_ENDPOINT}${address}`);
      const tokens = response.data;
      if (!tokens || tokens.length === 0) {
        console.warn(`[Jupiter] No data found for mint: ${address}`);
        return null;
      }
      const tokenData = tokens[0];
      return {
        mintAddress: tokenData.id,
        name: tokenData.name,
        symbol: tokenData.symbol,
        logoURI: tokenData.icon,
        marketCap: tokenData.mcap,
        creationTimestamp: tokenData.firstPool?.createdAt
          ? new Date(tokenData.firstPool.createdAt)
          : undefined,
        launchpad: tokenData.launchpad,
        metaLaunchpad: tokenData.metaLaunchpad,
        partnerConfig: tokenData.partnerConfig,
      };
    } catch (error) {
      console.error(`[Jupiter] Failed for mint ${address}:`, error);
      return null;
    }
  }
};

/**
 * Fetches market cap data for MULTIPLE addresses for a SPECIFIC chain.
 * Uses Jupiter for Solana (up to 100), Birdeye V3 for BSC (up to 20).
 * Batching (splitting into 100s or 20s) must be done by the CALLER.
 * @param addresses An array of addresses for the specified chain.
 * @param chain The chain ('solana' or 'bsc').
 * @returns A promise resolving to an array of TokenMarketData objects.
 */
export const fetchMultipleTokenData = async (
  addresses: string[],
  chain: "solana" | "bsc"
): Promise<TokenMarketData[]> => {
  if (addresses.length === 0) {
    return [];
  }

  if (chain === "solana") {
    // --- Solana Bulk Fetch using Jupiter ---
    try {
      const query = addresses.join(",");
      const response = await axios.get(`${JUPITER_API_ENDPOINT}${query}`);
      const tokens = response.data;

      if (!tokens || !Array.isArray(tokens) || tokens.length === 0) return [];

      // Only return address and market cap
      return tokens.map((tokenData: any) => ({
        mintAddress: tokenData.id,
        marketCap: tokenData.mcap,
      }));
    } catch (error) {
      console.error(`[Jupiter Batch] Failed for batch.`, error);
      return [];
    }
  } else if (chain === "bsc") {
    // --- BSC Bulk Fetch using Birdeye V3 ---
    if (!BIRDEYE_API_KEY) {
      console.error("[Birdeye V3] Error: BIRDEYE_API_KEY not configured.");
      return [];
    }
    try {
      const addressList = addresses.join(",");
      const response = await axios.get(
        `${BIRDEYE_V3_MULTI_ENDPOINT}?list_address=${addressList}`,
        { headers: { "x-chain": "bsc", "X-API-KEY": BIRDEYE_API_KEY } }
      );

      if (!response.data.success || !response.data.data) {
        console.warn(`[Birdeye V3] No data returned for batch: ${addressList}`);
        return [];
      }

      const marketDataMap = response.data.data;
      const results: TokenMarketData[] = [];

      // Iterate over the response map and format the data
      for (const address in marketDataMap) {
        if (marketDataMap.hasOwnProperty(address)) {
          results.push({
            mintAddress: marketDataMap[address].address,
            marketCap: marketDataMap[address].market_cap,
          });
        }
      }
      return results;
    } catch (error) {
      console.error(`[Birdeye V3 Batch] Failed for batch.`, error);
      return [];
    }
  } else {
    console.error(`[Multi-Chain] Invalid chain specified: ${chain}`);
    return [];
  }
};
