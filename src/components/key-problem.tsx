import { Action, ActionPanel, Detail, Icon, Keyboard, openExtensionPreferences } from "@raycast/api";
import { KEYS_URL } from "../lib/errors";
import { clearKeyRejection, type KeyState } from "../lib/key-state";
import { keyFieldTitle } from "../lib/slots";
import { SwitchWorkspaceAction, type WorkspaceChoice } from "./switch-workspace-action";

const TITLES: Record<Exclude<KeyState, "ok">, string> = {
  missing: "API key missing",
  malformed: "API key not valid",
  rejected: "API key not valid",
  scope: "API key has too few rights",
};

// The same steps as the onboarding (help.md)
const STEPS = [
  "### Get your API key",
  "",
  `1. Open [Settings → API keys](${KEYS_URL}) on quak.party`,
  "2. Create a key with scope **play**",
  "3. Paste it in the extension preferences",
].join("\n");

// One line on what is wrong with which field
function reason(state: Exclude<KeyState, "ok">, field: string) {
  switch (state) {
    case "missing":
      return `The field **${field}** in the extension preferences is empty.`;
    case "malformed":
      return `The field **${field}** doesn't hold a Quak API key. Paste the whole key, it begins with \`qk_key_\`.`;
    case "rejected":
      return `quak.party doesn't accept the key in **${field}**. It may have been deleted.`;
    case "scope":
      return `The key in **${field}** can't play. Create one with scope **play** in Settings → API keys on quak.party.`;
  }
}

// What a command shows instead of its content while the active workspace's key is missing, malformed or rejected:
// the onboarding's steps, Enter opens the preferences. No cached data, so it looks like the very first launch.
export function KeyProblem({ state, choice }: { state: Exclude<KeyState, "ok">; choice: WorkspaceChoice }) {
  const field = keyFieldTitle(choice.slot);
  const markdown = [
    `## ${TITLES[state]}`,
    reason(state, field),
    STEPS,
    choice.multiple
      ? `Or switch to another workspace with Switch Workspace (\`${process.platform === "win32" ? "Ctrl+Shift+W" : "⌘⇧W"}\`).`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const rejected = state === "rejected" || state === "scope";
  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
          <Action.OpenInBrowser
            title="Get API Key"
            icon={Icon.Key}
            url={KEYS_URL}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
          {rejected && (
            <Action
              title="Try Again"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={() => clearKeyRejection(choice.slot)}
            />
          )}
          <SwitchWorkspaceAction choice={choice} />
        </ActionPanel>
      }
    />
  );
}
