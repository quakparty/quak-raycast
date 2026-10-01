import { Action, ActionPanel, Icon, Keyboard, openExtensionPreferences } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { activeSlot, configuredSlots, setActiveSlot } from "../lib/slots";
import { cachedWorkspace, listWorkspaces, slotName, type Workspace } from "../lib/workspaces";

export const SWITCH_WORKSPACE_SHORTCUT: Keyboard.Shortcut = {
  macOS: { modifiers: ["cmd", "shift"], key: "w" },
  Windows: { modifiers: ["ctrl", "shift"], key: "w" },
};

export type WorkspaceChoice = {
  // the active slot, for quak(slot) and as a dependency of the lists
  slot: number;
  // more than one key: show the switch and the workspace's name
  multiple: boolean;
  // the configured workspaces by name (cached or fallback names until the lookup answered)
  workspaces: Workspace[];
  // the active workspace
  active: Workspace;
  select: (slot: number) => void;
};

// The active workspace and the others; with one key nothing is looked up
export function useWorkspace(): WorkspaceChoice {
  const slots = configuredSlots();
  const multiple = slots.length > 1;
  const [slot, setSlot] = useState(activeSlot);
  const lookup = useCachedPromise(async (list: number[]) => (await listWorkspaces(list)).workspaces, [slots], {
    // also with one key, for the name in the actions; cached, so only the first run asks
    // the fallback names stay; each list reports a bad key itself
    onError: () => undefined,
  });

  const workspaces = slots.map(
    (value) =>
      lookup.data?.find((workspace) => workspace.slot === value) ?? {
        slot: value,
        ...(cachedWorkspace(value) ?? { name: slotName(value) }),
      },
  );
  const select = (value: number) => {
    if (value === slot) return;
    setActiveSlot(value);
    setSlot(value);
  };
  const active = workspaces.find((workspace) => workspace.slot === slot) ?? workspaces[0];
  return { slot, multiple, workspaces, active, select };
}

// Switches the workspace for all commands, from any list's actions (also its empty view); nothing with a single key
export function SwitchWorkspaceAction({ choice }: { choice: WorkspaceChoice }) {
  if (!choice.multiple) return null;
  return (
    <ActionPanel.Submenu title="Switch Workspace" icon={Icon.House} shortcut={SWITCH_WORKSPACE_SHORTCUT}>
      {choice.workspaces.map((workspace) => (
        <Action
          key={workspace.slot}
          title={workspace.name}
          icon={workspace.slot === choice.slot ? Icon.Checkmark : Icon.Circle}
          onAction={() => choice.select(workspace.slot)}
        />
      ))}
    </ActionPanel.Submenu>
  );
}

// The actions every list offers at the end, under the active workspace's name: switch the workspace (more than one
// key) and open the preferences
export function ExtensionActions({ choice }: { choice: WorkspaceChoice }) {
  return (
    <ActionPanel.Section title={`Workspace: ${choice.active.name}`}>
      <SwitchWorkspaceAction choice={choice} />
      <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
    </ActionPanel.Section>
  );
}
