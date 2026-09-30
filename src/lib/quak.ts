import { getPreferenceValues } from "@raycast/api";
import { Quak } from "@quak/js";
import pkg from "../../package.json";
import { KeyFormatError } from "./errors";

// Quak keys look like qk_key_…; anything else is a typo or pasted text, caught before a request
const KEY_PREFIX = "qk_key_";

// One client per command run; the API shows plays from here as "via raycast"
export function quak() {
  const apiKey = getPreferenceValues<Preferences>().apiKey.trim();
  if (!apiKey.startsWith(KEY_PREFIX)) throw new KeyFormatError();
  return new Quak({ apiKey, client: `raycast/${pkg.version}` });
}
