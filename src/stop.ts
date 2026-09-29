import { showHUD } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { quak } from "./lib/quak";

// Stops whatever plays on the workspace's default speakers
export default async function Command() {
  try {
    await quak().stop();
    await showHUD("Quak: stopped");
  } catch (error) {
    await showFailureToast(error, { title: "Could not stop" });
  }
}
