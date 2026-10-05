import { Action, Icon, Keyboard, LaunchProps, openExtensionPreferences, showToast, Toast } from "@raycast/api";
import { createDeeplink } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { showError } from "../lib/errors";
import { playWithDefaults } from "../lib/play";
import { keyState } from "../lib/key-state";
import { activeSlot, configuredSlots } from "../lib/slots";
import { cachedWorkspace, listWorkspaces, type Workspace } from "../lib/workspaces";

type Kind = "sound" | "clip";

// What a quicklink passes to its command: the slug and, with more than one key, the workspace's slug; never the key
type QuicklinkContext = { slug?: unknown; workspace?: unknown };

const COMMANDS: Record<Kind, string> = { sound: "play-sound", clip: "play-clip" };

export const QUICKLINK_SHORTCUT: Keyboard.Shortcut = {
  macOS: { modifiers: ["cmd", "shift"], key: "l" },
  Windows: { modifiers: ["ctrl", "shift"], key: "l" },
};

// A Raycast quicklink that plays this one sound or clip with your defaults. With more than one key it
// carries the workspace (passed only then), so it plays where it was made.
export function CreateQuicklinkAction({
  kind,
  slug,
  name,
  workspace,
}: {
  kind: Kind;
  slug: string;
  name: string;
  workspace?: Workspace;
}) {
  const context = workspace?.slug ? { slug, workspace: workspace.slug } : { slug };
  const link = createDeeplink({ command: COMMANDS[kind], context });
  return (
    <Action.CreateQuicklink
      title={`Create ${kind === "sound" ? "Sound" : "Clip"} Quicklink`}
      icon={Icon.Link}
      shortcut={QUICKLINK_SHORTCUT}
      quicklink={{
        name: workspace?.slug ? `Play ${name} (${workspace.name})` : `Play ${name}`,
        link,
        icon: kind === "sound" ? Icon.Music : Icon.Waveform,
      }}
    />
  );
}

// The slot whose key belongs to the workspace with this slug, from the cache when it knows it; undefined after an
// error toast
async function findSlot(workspace: string) {
  const cached = configuredSlots().find((slot) => cachedWorkspace(slot)?.slug === workspace);
  if (cached !== undefined) return cached;
  const { workspaces, errors } = await listWorkspaces();
  const match = workspaces.find((item) => item.slug === workspace);
  if (match) return match.slot;
  if (errors.length) {
    await showError(errors[0].error, "Could not play");
    return undefined;
  }
  await showToast({
    style: Toast.Style.Failure,
    title: `Workspace “${workspace}” is no longer set up`,
    message: "Add a key for it in the extension preferences.",
    primaryAction: { title: "Open Extension Preferences", onAction: () => openExtensionPreferences() },
  });
  return undefined;
}

// Launched from a quicklink: plays the slug right away, the HUD closes Raycast; on an error the list stays.
// A quicklink with a workspace plays there, one without in the active workspace. Returns whether that play is still
// running.
export function useQuicklinkPlay(kind: Kind, props: LaunchProps) {
  const context = props.launchContext as QuicklinkContext | undefined;
  const slug = typeof context?.slug === "string" ? context.slug : "";
  const workspace = typeof context?.workspace === "string" ? context.workspace : "";
  // without a workspace it plays in the active one; when that key is unusable, the list's key view says so, no toast
  const skip = !workspace && keyState(activeSlot()) !== "ok";
  const [isPlaying, setIsPlaying] = useState(Boolean(slug) && !skip);
  const started = useRef(false);

  useEffect(() => {
    if (!slug || skip || started.current) return;
    started.current = true;
    (async () => {
      const slot = workspace ? await findSlot(workspace) : undefined;
      if (workspace && slot === undefined) return;
      await playWithDefaults({ kind, slug, name: slug }, "hud", slot);
    })().finally(() => setIsPlaying(false));
  }, []);

  return isPlaying;
}
