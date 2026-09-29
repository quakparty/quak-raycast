import { LaunchProps, showHUD } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { quak } from "./lib/quak";

// Says the text with the workspace's defaults (speakers, voice, volume)
export default async function Command(props: LaunchProps<{ arguments: Arguments.Say }>) {
  try {
    await quak().play.text({ text: props.arguments.text });
    await showHUD("Quak: playing");
  } catch (error) {
    await showFailureToast(error, { title: "Could not play" });
  }
}
