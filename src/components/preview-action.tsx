import { Action, Icon, Keyboard } from "@raycast/api";
import type { PlaySource } from "../lib/play";
import { previewWithDefaults, togglePreview } from "../lib/preview";

export const PREVIEW_SHORTCUT: Keyboard.Shortcut = {
  macOS: { modifiers: ["cmd"], key: "p" },
  Windows: { modifiers: ["ctrl"], key: "p" },
};

// What a list item previews, for "Stop Preview" on the one that runs
export function previewKey(source: PlaySource) {
  return source.kind === "text"
    ? `text:${source.text}`
    : source.kind === "talk"
      ? "talk"
      : `${source.kind}:${source.slug}`;
}

// Plays what Enter would play on this computer instead of the speakers; again stops it. running: the key of usePreview.
export function PreviewAction({ source, slot, running }: { source: PlaySource; slot: number; running?: string }) {
  const key = previewKey(source);
  const isRunning = running === key;
  return (
    <Action
      title={isRunning ? "Stop Preview" : "Preview"}
      icon={isRunning ? Icon.Stop : Icon.Headphones}
      shortcut={PREVIEW_SHORTCUT}
      onAction={() => togglePreview(key, () => previewWithDefaults(key, source, slot))}
    />
  );
}
