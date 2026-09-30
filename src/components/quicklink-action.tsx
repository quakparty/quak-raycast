import { Action, Icon, Keyboard, LaunchProps } from "@raycast/api";
import { createDeeplink } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { playWithFeedback } from "../lib/play";

type Kind = "sound" | "clip";

// What a quicklink passes to its command: only the slug, never the key
type QuicklinkContext = { slug?: unknown };

const COMMANDS: Record<Kind, string> = { sound: "play-sound", clip: "play-clip" };

export const QUICKLINK_SHORTCUT: Keyboard.Shortcut = {
  macOS: { modifiers: ["cmd", "shift"], key: "l" },
  Windows: { modifiers: ["ctrl", "shift"], key: "l" },
};

// A Raycast quicklink that plays this one sound or clip with the workspace's defaults
export function CreateQuicklinkAction({ kind, slug, name }: { kind: Kind; slug: string; name: string }) {
  const link = createDeeplink({ command: COMMANDS[kind], context: { slug } });
  return (
    <Action.CreateQuicklink
      title="Create Quicklink"
      icon={Icon.Link}
      shortcut={QUICKLINK_SHORTCUT}
      quicklink={{ name: `Play ${name}`, link, icon: kind === "sound" ? Icon.Music : Icon.Waveform }}
    />
  );
}

// Launched from a quicklink: plays the slug right away, the HUD closes Raycast; on an error the list stays.
// Returns whether that play is still running.
export function useQuicklinkPlay(kind: Kind, props: LaunchProps) {
  const context = props.launchContext as QuicklinkContext | undefined;
  const slug = typeof context?.slug === "string" ? context.slug : "";
  const [isPlaying, setIsPlaying] = useState(Boolean(slug));
  const started = useRef(false);

  useEffect(() => {
    if (!slug || started.current) return;
    started.current = true;
    playWithFeedback({ kind, slug, name: slug }, {}, "hud").finally(() => setIsPlaying(false));
  }, []);

  return isPlaying;
}
