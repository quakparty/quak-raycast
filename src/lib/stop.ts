import { showToast, Toast } from "@raycast/api";
import { showError } from "./errors";
import { quak } from "./quak";

// Stops what plays on every speaker of the workspace ("all"), also clips of other apps; the active one by default
export async function stopAll(slot?: number) {
  const { data } = await quak(slot).stop({ to: ["all"] });
  const stopped = data.players.filter((player) => player.status !== "FAILED");
  return stopped.length ? `Stopped on ${stopped.map((player) => player.name).join(", ")}` : "Stopped";
}

// The same from inside a list, with a toast
export async function stopAllWithToast() {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Stopping…" });
  try {
    toast.title = await stopAll();
    toast.style = Toast.Style.Success;
  } catch (error) {
    await toast.hide();
    await showError(error, "Could not stop");
  }
}
