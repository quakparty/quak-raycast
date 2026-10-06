import {
  Action,
  Icon,
  Keyboard,
  LaunchProps,
  LaunchType,
  openExtensionPreferences,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { createDeeplink } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { showError } from "../lib/errors";
import { playWithDefaults } from "../lib/play";
import { keyState } from "../lib/key-state";
import { activeSlot, configuredSlots } from "../lib/slots";
import { cachedWorkspace, listWorkspaces, type Workspace } from "../lib/workspaces";

type Kind = "sound" | "clip";

// What a quicklink passes to its command: the slug and, with more than one key, the workspace's slug; never the key
type QuicklinkContext = { kind?: unknown; slug?: unknown; workspace?: unknown };

// Quicklinks run Play Selected Text, the extension's command without a window, in the background: Raycast stays closed
// and only the HUD shows. A view command (Play Sound, Play Clip) would open the window first. Older quicklinks to
// play-sound / play-clip still work through useQuicklinkPlay.
const QUICKLINK_COMMAND = "play-selected-text";

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
  const context = workspace?.slug ? { kind, slug, workspace: workspace.slug } : { kind, slug };
  const link = createDeeplink({ command: QUICKLINK_COMMAND, context, launchType: LaunchType.Background });
  return (
    <Action.CreateQuicklink
      title={`Create ${kind === "sound" ? "Sound" : "Clip"} Quicklink`}
      icon={Icon.Link}
      shortcut={QUICKLINK_SHORTCUT}
      quicklink={{
        name: workspace?.slug ? `Play ${name} (${workspace.name})` : `Play ${name}`,
        link,
        icon: Icon.Play,
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

// The quicklink's sound or clip from a launch context, or undefined when the launch isn't from a quicklink
export function quicklinkTarget(launchContext: unknown) {
  const context = launchContext as QuicklinkContext | undefined;
  const kind: Kind | undefined = context?.kind === "sound" || context?.kind === "clip" ? context.kind : undefined;
  const slug = typeof context?.slug === "string" ? context.slug : "";
  if (!kind || !slug) return undefined;
  return { kind, slug, workspace: typeof context?.workspace === "string" ? context.workspace : "" };
}

// Plays a quicklink's sound or clip without a window (Play Selected Text in the background): HUD on success, a toast on
// errors, a HUD pointing to the preferences when the key is unusable
export async function playQuicklink(target: { kind: Kind; slug: string; workspace: string }) {
  const slot = target.workspace ? await findSlot(target.workspace) : activeSlot();
  if (slot === undefined) return;
  if (keyState(slot) !== "ok") {
    await showHUD("Quak: add a valid API key in the extension preferences");
    return;
  }
  await playWithDefaults({ kind: target.kind, slug: target.slug, name: target.slug }, "hud", slot);
}
