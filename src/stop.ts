import { PopToRootType, showHUD } from "@raycast/api";
import { showError } from "./lib/errors";
import { activeSlot } from "./lib/slots";
import { stopAll } from "./lib/stop";
import { workspaceSuffix } from "./lib/workspaces";

// Stops everything on all speakers of the active workspace; with more than one key the HUD names it
export default async function Command() {
  const slot = activeSlot();
  try {
    await showHUD(`${await stopAll(slot)}${await workspaceSuffix(slot)}`, { popToRootType: PopToRootType.Immediate });
  } catch (error) {
    await showError(error, "Could not stop");
  }
}
