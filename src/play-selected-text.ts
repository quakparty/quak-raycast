import { getSelectedText, showToast, Toast } from "@raycast/api";
import { playWithFeedback } from "./lib/play";

// Plays the text selected in the frontmost app with the workspace's defaults, from anywhere (best with a hotkey)
export default async function Command() {
  let text: string;
  try {
    text = (await getSelectedText()).trim();
  } catch {
    text = "";
  }
  if (!text) {
    await showToast({
      style: Toast.Style.Failure,
      title: "No text selected",
      message: "Select a text in any app first.",
    });
    return;
  }
  await playWithFeedback({ kind: "text", text }, {}, "hud");
}
