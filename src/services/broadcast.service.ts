import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

class BroadcastService {
  private static _instance: BroadcastService;
  private wss!: WebSocketServer;

  private constructor() {}

  public static get instance(): BroadcastService {
    if (!BroadcastService._instance) {
      BroadcastService._instance = new BroadcastService();
    }
    return BroadcastService._instance;
  }

  public initialize(server: Server): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ server });

    this.wss.on("connection", (ws: WebSocket) => {
      console.log(
        `🔌 [Broadcast] New client connected. Total clients: ${this.getClientCount()}`
      );
      ws.on("close", () => {
        console.log(
          `🔌 [Broadcast] Client disconnected. Total clients: ${this.getClientCount()}`
        );
      });
    });

    console.log("✅ [Broadcast] WebSocket server initialized.");
  }

  public getClientCount(): number {
    return this.wss?.clients.size || 0;
  }

  private broadcast(data: object): void {
    if (!this.wss) return;
    const payload = JSON.stringify(data);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  public broadcastZoneEntry(token: any): void {
    this.broadcast({
      type: "ZONE_ENTRY",
      payload: {
        zone: token.activeZones[token.activeZones.length - 1],
        tokenData: token,
      },
    });
  }

  public broadcastZoneExit(mintAddress: string, zone: string): void {
    this.broadcast({
      type: "ZONE_EXIT",
      payload: { mintAddress, zone },
    });
  }

  public broadcastStatsUpdate(mintAddress: string, updatedStats: object): void {
    this.broadcast({
      type: "TOKEN_STATS_UPDATE",
      payload: { mintAddress, updatedStats },
    });
  }
}

export const broadcastService = BroadcastService.instance;
