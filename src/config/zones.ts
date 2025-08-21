// src/config/zones.ts

export const ZONE_CRITERIA = {
  DEGEN_ORBIT: {
    name: "DEGEN_ORBIT",
    scans: 4,
    groups: 3,
    window: "2h",
    windowHours: 2,
  },
  MAINFRAME: {
    name: "MAINFRAME",
    scans: 12,
    groups: 6,
    window: "8h",
    windowHours: 8,
  },
  SENTIMENT_CORE: {
    name: "SENTIMENT_CORE",
    scans: 20,
    groups: 8,
    window: "24h",
    windowHours: 24,
  },
};
