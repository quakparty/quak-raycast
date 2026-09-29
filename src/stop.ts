import { showHUD } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { stopAll } from "./lib/stop";

// Stops everything on all speakers of the workspace
export default async function Command() {
  try {
    await showHUD(await stopAll());
  } catch (error) {
    await showFailureToast(error, { title: "Could not stop" });
  }
}
