import { init } from "@instantdb/react";

// The InstantDB App ID you provisioned
const APP_ID = "e9d23170-74ee-4b98-bb2f-16b982d711c9";

export const db = init({ appId: APP_ID });

// Helper to interact with the current user's isolated data graph
// For DailyTally, since we want a single-user vibe without auth yet,
// we will just use a hardcoded device ID or generic ID for the preferences/ledgers to tie them.
export const DEVICE_ID = "local-device";
