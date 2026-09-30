import { getPreferenceValues } from "@raycast/api";
import { DEFAULT_BASE_URL, Quak } from "@quak/js";
import pkg from "../../package.json";
import { KeyFormatError } from "./errors";

// Quak keys look like qk_key_…; anything else is a typo or pasted text, caught before a request
const KEY_PREFIX = "qk_key_";

// The key from the preferences, checked for its format
export function apiKey() {
  const key = getPreferenceValues<Preferences>().apiKey.trim();
  if (!key.startsWith(KEY_PREFIX)) throw new KeyFormatError();
  return key;
}

// The live status of plays (docs/plays.md#live-status in quak-api)
export const WATCH_URL = `${DEFAULT_BASE_URL.replace(/^http/, "ws")}/v1/plays/watch`;

// One client per command run; the API shows plays from here as "via raycast"
export function quak() {
  return new Quak({ apiKey: apiKey(), client: `raycast/${pkg.version}` });
}
