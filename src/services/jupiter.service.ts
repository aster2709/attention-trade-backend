import axios from "axios";

// A type definition for the structured data we expect back from this service.
export interface JupiterTokenData {
  mintAddress: string;
  name: string;
  symbol: string;
  logoURI?: string;
  marketCap?: number;
  creationTimestamp?: Date;
  launchpad?: string;
  metaLaunchpad?: string;
  partnerConfig?: string;
}

const JUPITER_API_ENDPOINT = "https://lite-api.jup.ag/tokens/v2/search?query=";
const BIRDEYE_API_URL = "https://public-api.birdeye.so/defi/token_overview";
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY; // Ensure this is in your .env file

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches token metadata from the appropriate API based on the address format.
 * @param address The mint address (Solana) or contract address (BSC).
 * @returns A promise that resolves to a structured JupiterTokenData object or null if not found.
 */
export const fetchTokenData = async (
  address: string
): Promise<JupiterTokenData | null> => {
  // --- BSC (EVM) Address Logic ---
  if (address.startsWith("0x")) {
    if (!BIRDEYE_API_KEY) {
      console.error(
        "[Birdeye] Error: BIRDEYE_API_KEY is not configured in your .env file."
      );
      return null;
    }
    try {
      const response = await axios.get(
        `${BIRDEYE_API_URL}?address=${address}`,
        {
          headers: {
            "x-chain": "bsc",
            "X-API-KEY": BIRDEYE_API_KEY,
          },
        }
      );

      if (!response.data.success || !response.data.data) {
        console.warn(`[Birdeye] No data found for address: ${address}`);
        return null;
      }

      const tokenData = response.data.data;

      // Map the Birdeye API response to our clean, structured object.
      const formattedData: JupiterTokenData = {
        mintAddress: tokenData.address,
        name: tokenData.name,
        symbol: tokenData.symbol,
        logoURI: tokenData.logoURI,
        marketCap: tokenData.marketCap,
      };
      return formattedData;
    } catch (error) {
      console.error(
        `[Birdeye] Failed to fetch data for address: ${address}`,
        error
      );
      return null;
    }
  }

  // --- Solana Address Logic (Existing) ---
  else {
    try {
      const response = await axios.get(`${JUPITER_API_ENDPOINT}${address}`);
      const tokens = response.data;

      if (!tokens || tokens.length === 0) {
        console.warn(`[Jupiter] No data found for mint: ${address}`);
        return null;
      }

      const tokenData = tokens[0];

      // Map the Jupiter API response to our clean, structured object.
      const formattedData: JupiterTokenData = {
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
      return formattedData;
    } catch (error) {
      console.error(
        `[Jupiter] Failed to fetch data for mint: ${address}`,
        error
      );
      return null;
    }
  }
};

/**
 * Fetches token metadata from appropriate APIs for multiple mint/contract addresses.
 * @param mintAddresses An array of Solana mint addresses and/or BSC contract addresses.
 * @returns A promise that resolves to an array of structured JupiterTokenData objects.
 */
export const fetchMultipleTokenData = async (
  mintAddresses: string[]
): Promise<JupiterTokenData[]> => {
  if (mintAddresses.length === 0) {
    return [];
  }

  // 1. Split addresses by chain
  const solanaAddresses: string[] = [];
  const bscAddresses: string[] = [];

  mintAddresses.forEach((addr) => {
    if (addr.startsWith("0x")) {
      bscAddresses.push(addr);
    } else {
      solanaAddresses.push(addr);
    }
  });

  const promises: Promise<JupiterTokenData[]>[] = [];

  // 2. Create promise for Solana (Jupiter) batch request
  if (solanaAddresses.length > 0) {
    const solanaPromise = (async () => {
      try {
        const query = solanaAddresses.join(",");
        const response = await axios.get(`${JUPITER_API_ENDPOINT}${query}`);
        const tokens = response.data;

        if (!tokens || tokens.length === 0) return [];

        return tokens.map((tokenData: any) => ({
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
        }));
      } catch (error) {
        console.error(`[Jupiter] Failed to fetch data for batch.`, error);
        return [];
      }
    })();
    promises.push(solanaPromise);
  }

  // 3. Create promise for BSC (Birdeye) sequential requests
  if (bscAddresses.length > 0) {
    if (!BIRDEYE_API_KEY) {
      console.warn("[Birdeye] API key not set. Skipping BSC address fetch.");
    } else {
      const bscPromise = (async () => {
        const results: JupiterTokenData[] = [];
        for (const address of bscAddresses) {
          // fetchTokenData already handles single lookups perfectly
          const tokenData = await fetchTokenData(address);
          if (tokenData) {
            results.push(tokenData);
          }
          await sleep(110); // Respect rate limit (10 rps)
        }
        return results;
      })();
      promises.push(bscPromise);
    }
  }

  // 4. Execute all promises and combine results
  try {
    const results = await Promise.all(promises);
    return results.flat();
  } catch (error) {
    console.error(`[Multi-Chain] Error fetching combined token data`, error);
    return [];
  }
};
