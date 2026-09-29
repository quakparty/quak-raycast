import { showHUD } from "@raycast/api";
import { showError } from "./lib/errors";
import { stopAll } from "./lib/stop";

// Stops everything on all speakers of the workspace
export default async function Command() {
  try {
    await showHUD(await stopAll());
  } catch (error) {
    await showError(error, "Could not stop");
  }
}
