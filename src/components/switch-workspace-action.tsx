import { Action, ActionPanel, Icon, Keyboard, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { activeSlot, configuredSlots, setActiveSlot } from "../lib/slots";
import { listWorkspaces, slotName, type Workspace } from "../lib/workspaces";

export const SWITCH_WORKSPACE_SHORTCUT: Keyboard.Shortcut = {
  macOS: { modifiers: ["cmd", "shift"], key: "w" },
  Windows: { modifiers: ["ctrl", "shift"], key: "w" },
};

export type WorkspaceChoice = {
  // the active slot, for quak(slot) and as a dependency of the lists
  slot: number;
  // more than one key: show the switch
  multiple: boolean;
  // the configured workspaces by name (fallback names until the lookup answered)
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
    execute: multiple,
    // the fallback names stay; each list reports a bad key itself
    onError: () => undefined,
  });

  const workspaces = slots.map(
    (value) => lookup.data?.find((workspace) => workspace.slot === value) ?? { slot: value, name: slotName(value) },
  );
  const select = (value: number) => {
    if (value === slot) return;
    setActiveSlot(value);
    setSlot(value);
  };
  const active = workspaces.find((workspace) => workspace.slot === slot) ?? workspaces[0];
  return { slot, multiple, workspaces, active, select };
}

// The search bar's workspace switch; nothing with a single key
export function WorkspaceDropdown({ choice }: { choice: WorkspaceChoice }) {
  if (!choice.multiple) return null;
  return (
    <List.Dropdown tooltip="Workspace" value={String(choice.slot)} onChange={(value) => choice.select(Number(value))}>
      {choice.workspaces.map((workspace) => (
        <List.Dropdown.Item
          key={workspace.slot}
          value={String(workspace.slot)}
          title={workspace.name}
          icon={Icon.House}
        />
      ))}
    </List.Dropdown>
  );
}

// The same as an action, where the search bar already has another dropdown (Play Sound's tags)
export function SwitchWorkspaceAction({ choice }: { choice: WorkspaceChoice }) {
  if (!choice.multiple) return null;
  return (
    <ActionPanel.Submenu title="Switch Workspace" icon={Icon.House} shortcut={SWITCH_WORKSPACE_SHORTCUT}>
      {choice.workspaces.map((workspace) => (
        <Action
          key={workspace.slot}
          title={workspace.name}
          icon={workspace.slot === choice.slot ? Icon.CheckCircle : Icon.Circle}
          onAction={() => choice.select(workspace.slot)}
        />
      ))}
    </ActionPanel.Submenu>
  );
}
