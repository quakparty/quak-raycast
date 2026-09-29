import { getPreferenceValues } from "@raycast/api";
import { Quak } from "@quak/js";
import pkg from "../../package.json";

// One client per command run; the API shows plays from here as "via raycast"
export function quak() {
  const { apiKey } = getPreferenceValues<Preferences>();
  return new Quak({ apiKey, client: `raycast/${pkg.version}` });
}
