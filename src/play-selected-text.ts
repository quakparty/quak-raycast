import { getSelectedText, LaunchProps, showToast, Toast } from "@raycast/api";
import { playQuicklink, quicklinkTarget } from "./components/quicklink-action";
import { playWithDefaults } from "./lib/play";

// Plays the text selected in the frontmost app with your defaults for texts (else the workspace's), from anywhere (best with a hotkey)
// Also the target of the quicklinks for sounds and clips: without a window, they play here in the background
export default async function Command(props: LaunchProps) {
  const target = quicklinkTarget(props.launchContext);
  if (target) {
    await playQuicklink(target);
    return;
  }
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
  await playWithDefaults({ kind: "text", text }, "hud");
}
