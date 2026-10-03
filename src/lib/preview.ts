import { showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { loadDefaults } from "./defaults";
import { showError } from "./errors";
import { PlayOptions, PlaySource, sendPlay } from "./play";
import { downloadAudio, Playback, playFile, removeFile } from "./player";
import { activeSlot } from "./slots";

// A preview: the API makes the audio (preview: true, nothing plays on Sonos) and this computer plays it. Only one at a
// time; a new one stops the one before.

type Current = { key: string; abort: AbortController; playback?: Playback; path?: string; toast?: Toast };

let current: Current | undefined;
const listeners = new Set<(key: string | undefined) => void>();

function notify() {
  for (const listener of listeners) listener(current?.key);
}

// What a preview is called in its toast
function previewName(source: PlaySource) {
  if (source.kind === "text") return source.text.length > 40 ? `“${source.text.slice(0, 40)}…”` : `“${source.text}”`;
  if (source.kind === "talk") return "your recording";
  return source.name;
}

// Ends the preview (loading or playing) and deletes its file; the toast goes with it
export function stopPreview() {
  const preview = current;
  if (!preview) return;
  current = undefined;
  preview.abort.abort();
  preview.playback?.stop();
  if (preview.path) removeFile(preview.path);
  preview.toast?.hide();
  notify();
}

// Previews with exactly these options. key names what is previewed, for the actions' "Stop Preview".
export async function startPreview(key: string, source: PlaySource, options: PlayOptions, slot = activeSlot()) {
  stopPreview();
  const preview: Current = { key, abort: new AbortController() };
  current = preview;
  notify();
  const live = () => current === preview;
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Loading preview…",
    primaryAction: { title: "Stop Preview", onAction: () => live() && stopPreview() },
  });
  if (!live()) return toast.hide();
  preview.toast = toast;
  try {
    const { play } = await sendPlay(source, options, slot, true);
    if (!live()) return;
    if (!play.audioUrl) throw new Error("The preview has no audio");
    const path = await downloadAudio(play.audioUrl, preview.abort.signal);
    if (!live()) return removeFile(path);
    preview.path = path;
    preview.playback = playFile(path);
    toast.title = `Previewing ${previewName(source)}`;
    await preview.playback.done;
    if (live()) stopPreview();
  } catch (error) {
    if (!live()) return;
    stopPreview();
    await showError(error, "Could not preview");
  }
}

// A preview like Enter's play: your defaults for this type and workspace, the workspace's for the rest
export async function previewWithDefaults(key: string, source: PlaySource, slot = activeSlot()) {
  return startPreview(key, source, (await loadDefaults(source.kind, slot)) ?? {}, slot);
}

// The key of the preview that runs now, for the actions' title; stops it when the view goes away
export function usePreview() {
  const [key, setKey] = useState(current?.key);
  useEffect(() => {
    listeners.add(setKey);
    return () => {
      listeners.delete(setKey);
      stopPreview();
    };
  }, []);
  return key;
}

// Starts this preview, or stops it when it runs already
export function togglePreview(key: string, start: () => Promise<void>) {
  if (current?.key === key) {
    stopPreview();
    return;
  }
  return start();
}
