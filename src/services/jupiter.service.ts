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

/**
 * Fetches token metadata from the Jupiter API for a given mint address.
 * @param mintAddress The mint address of the Solana token.
 * @returns A promise that resolves to a structured JupiterTokenData object or null if not found.
 */
export const fetchTokenData = async (
  mintAddress: string
): Promise<JupiterTokenData | null> => {
  try {
    const response = await axios.get(`${JUPITER_API_ENDPOINT}${mintAddress}`);
    const tokens = response.data;

    // The API returns an array. If it's empty, the token wasn't found.
    if (!tokens || tokens.length === 0) {
      console.warn(`[Jupiter] No data found for mint: ${mintAddress}`);
      return null;
    }

    const tokenData = tokens[0];

    // Map the API response to our clean, structured object.
    const formattedData: JupiterTokenData = {
      mintAddress: tokenData.id,
      name: tokenData.name,
      symbol: tokenData.symbol,
      logoURI: tokenData.icon,
      marketCap: tokenData.mcap,
      // The creation timestamp is nested inside the 'firstPool' object
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
      `[Jupiter] Failed to fetch data for mint: ${mintAddress}`,
      error
    );
    return null; // Return null on error to prevent crashes downstream.
  }
};

// ... (keep the existing fetchTokenData function and JupiterTokenData interface)

/**
 * Fetches token metadata from the Jupiter API for multiple mint addresses.
 * @param mintAddresses An array of mint addresses.
 * @returns A promise that resolves to an array of structured JupiterTokenData objects.
 */
export const fetchMultipleTokenData = async (
  mintAddresses: string[]
): Promise<JupiterTokenData[]> => {
  if (mintAddresses.length === 0) {
    return [];
  }

  try {
    const query = mintAddresses.join(",");
    const response = await axios.get(`${JUPITER_API_ENDPOINT}${query}`);
    const tokens = response.data;

    if (!tokens || tokens.length === 0) {
      return [];
    }

    // Map the API response to our clean, structured objects
    const formattedData = tokens.map((tokenData: any) => ({
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

    return formattedData;
  } catch (error) {
    console.error(`[Jupiter] Failed to fetch data for batch.`, error);
    return []; // Return an empty array on error
  }
};
