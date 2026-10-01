import { Quak } from "@quak/js";
import pkg from "../../package.json";
import { KeyFormatError } from "./errors";
import { activeSlot, keyField, keyFieldTitle } from "./slots";

// Quak keys look like qk_key_…; anything else is a typo or pasted text, caught before a request
const KEY_PREFIX = "qk_key_";

// The key of a slot (the active workspace by default), checked for its format
export function apiKey(slot = activeSlot()) {
  const key = keyField(slot);
  if (!key.startsWith(KEY_PREFIX)) throw new KeyFormatError(slot === 0 ? undefined : keyFieldTitle(slot));
  return key;
}

// A client for a slot (the active workspace by default); the API shows plays from here as "via raycast"
export function quak(slot = activeSlot()) {
  return new Quak({ apiKey: apiKey(slot), client: `raycast/${pkg.version}` });
}
