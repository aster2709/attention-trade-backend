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

// New: Pre-entry criteria (relaxed thresholds for proactive tapping)
export const PRE_ENTRY_CRITERIA = {
  DEGEN_ORBIT: {
    scans: ZONE_CRITERIA.DEGEN_ORBIT.scans - 1, // e.g., 3
    groups: ZONE_CRITERIA.DEGEN_ORBIT.groups - 1, // e.g., 2
    windowHours: ZONE_CRITERIA.DEGEN_ORBIT.windowHours,
  },
  MAINFRAME: {
    scans: ZONE_CRITERIA.MAINFRAME.scans - 1, // e.g., 11
    groups: ZONE_CRITERIA.MAINFRAME.groups - 1, // e.g., 5
    windowHours: ZONE_CRITERIA.MAINFRAME.windowHours,
  },
  SENTIMENT_CORE: {
    scans: ZONE_CRITERIA.SENTIMENT_CORE.scans - 1, // e.g., 19
    groups: ZONE_CRITERIA.SENTIMENT_CORE.groups - 1, // e.g., 7
    windowHours: ZONE_CRITERIA.SENTIMENT_CORE.windowHours,
  },
};
