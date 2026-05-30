// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  preferences: {
    allow: {
      view: "auth.id != null && auth.id == data.creatorId",
      create: "auth.id != null && auth.id == data.creatorId",
      update: "auth.id != null && auth.id == data.creatorId",
      delete: "auth.id != null && auth.id == data.creatorId",
    },
  },
  ledgers: {
    allow: {
      view: "auth.id != null && auth.id == data.creatorId",
      create: "auth.id != null && auth.id == data.creatorId",
      update: "auth.id != null && auth.id == data.creatorId",
      delete: "auth.id != null && auth.id == data.creatorId",
    },
  },
  entries: {
    allow: {
      view: "auth.id != null && auth.id == data.creatorId",
      create: "auth.id != null && auth.id == data.creatorId",
      update: "auth.id != null && auth.id == data.creatorId",
      delete: "auth.id != null && auth.id == data.creatorId",
    },
  },
} satisfies InstantRules;

export default rules;
