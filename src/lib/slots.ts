import { Cache, getPreferenceValues } from "@raycast/api";
import { createHash } from "crypto";

// Up to three keys, one per workspace: the required API Key and two optional ones. A slot is the index of its field.
const FIELDS = ["apiKey", "apiKey2", "apiKey3"] as const;
const TITLES = ["API Key", "Second Workspace", "Third Workspace"];

type KeyPreferences = Partial<Record<(typeof FIELDS)[number], string>>;

// The active slot is shared by all commands and read synchronously, so it lives in Raycast's Cache (never a key, only
// the index). Its own namespace keeps it apart from the cached lists.
const cache = new Cache({ namespace: "workspace" });
const ACTIVE = "active";

// The raw value of a key field, trimmed; empty when not set
export function keyField(slot: number) {
  return (getPreferenceValues<KeyPreferences>()[FIELDS[slot]] ?? "").trim();
}

// A short hash of a slot's key (never the key itself): ties cached data and a rejection to that key
export function keyHash(slot: number) {
  return createHash("sha256").update(keyField(slot)).digest("hex").slice(0, 16);
}

// The title of a key field, for error messages
export function keyFieldTitle(slot: number) {
  return TITLES[slot];
}

// The slots with a key; the first is always there (required)
export function configuredSlots() {
  return FIELDS.map((_, slot) => slot).filter((slot) => slot === 0 || keyField(slot) !== "");
}

// The workspace the commands use; the first key when none was picked or its field is empty now
export function activeSlot() {
  const slot = Number(cache.get(ACTIVE));
  return configuredSlots().includes(slot) ? slot : 0;
}

export function setActiveSlot(slot: number) {
  cache.set(ACTIVE, String(slot));
}
