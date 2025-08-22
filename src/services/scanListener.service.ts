import WebSocket from "ws";
import { processNewScan } from "./scan.processor.service"; // We will create this next
import { config } from "../config/env";

const WEBSOCKET_URL = config.WEBSOCKET_STREAM_URL || "wss://fnfscan.xyz";

/**
 * Manages the WebSocket connection to the scan feed.
 */
class ScanListenerService {
  private ws: WebSocket | null = null;

  public start() {
    console.log("[Listener] Starting Scan Listener Service...");
    this.connect();
  }

  private connect() {
    if (!WEBSOCKET_URL) {
      console.error(
        "[Listener] WEBSOCKET_STREAM_URL is not defined in .env file. Aborting."
      );
      return;
    }

    this.ws = new WebSocket(WEBSOCKET_URL);

    this.ws.on("open", () => {
      console.log(
        "✅ [Listener] Successfully connected to the fnfscan.xyz WebSocket stream."
      );
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        // We only care about 'NEW_SCAN' events
        if (message.type === "NEW_SCAN" && message.data) {
          // Pass the entire data payload to the processor
          processNewScan(message.data);
        }
      } catch (error) {
        console.error("[Listener] Error processing incoming message:", error);
      }
    });

    this.ws.on("error", (error) => {
      console.error("[Listener] WebSocket error:", error);
    });

    this.ws.on("close", () => {
      console.warn(
        "[Listener] WebSocket connection closed. Attempting to reconnect in 5 seconds..."
      );
      // Clean up the old connection
      this.ws?.terminate();
      // Wait 5 seconds before trying to reconnect
      setTimeout(() => this.connect(), 5000);
    });
  }
}

// Create a single instance of the service to be used throughout the app
export const scanListenerService = new ScanListenerService();
