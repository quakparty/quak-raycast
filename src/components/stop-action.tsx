import { Action, Icon, Keyboard } from "@raycast/api";
import { stopAllWithToast } from "../lib/stop";

export const STOP_SHORTCUT: Keyboard.Shortcut = {
  macOS: { modifiers: ["cmd"], key: "." },
  Windows: { modifiers: ["ctrl"], key: "." },
};

export const STOP_ALL_SHORTCUT: Keyboard.Shortcut = {
  macOS: { modifiers: ["cmd", "shift"], key: "." },
  Windows: { modifiers: ["ctrl", "shift"], key: "." },
};

// Stops everything, like the Stop command, without leaving the list
export function StopAction({ shortcut = STOP_SHORTCUT }: { shortcut?: Keyboard.Shortcut }) {
  return <Action title="Stop All Speakers" icon={Icon.Stop} shortcut={shortcut} onAction={stopAllWithToast} />;
}
