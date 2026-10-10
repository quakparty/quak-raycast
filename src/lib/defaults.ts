import { LocalStorage } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import type { PlayOptions, PlaySource } from "./play";
import { isVolume } from "./volume";
import { cachedWorkspace } from "./workspaces";

// The extension's own defaults: one set per play type and workspace slot, saved from the options form. They fill in
// what a plain play (Enter, quicklinks, Play Selected Text) leaves out; everything else comes from the workspace.
export type DefaultsKind = PlaySource["kind"];

// What LocalStorage keeps (never a key): the options and the workspace they were saved in
type Stored = { workspace?: string; options: PlayOptions };

function storageKey(kind: DefaultsKind, slot: number) {
  return `defaults:${kind}:${slot}`;
}

// Only the fields that are set; an empty set is no set. A volume the API no longer takes (saved when 1 to 9 still
// worked) falls back to the workspace's.
function clean(options: PlayOptions): PlayOptions {
  const result: PlayOptions = {};
  if (options.to?.length) result.to = options.to;
  if (options.volume !== undefined && isVolume(options.volume)) result.volume = options.volume;
  if (options.voice) result.voice = options.voice;
  if (options.effect) result.effect = options.effect;
  if (options.ambience) result.ambience = options.ambience;
  return result;
}

export function hasOptions(options: PlayOptions | undefined): options is PlayOptions {
  return Boolean(options && Object.keys(clean(options)).length);
}

// The saved set, or undefined; a set saved for another workspace (the slot got a different key) is ignored
export async function loadDefaults(kind: DefaultsKind, slot: number): Promise<PlayOptions | undefined> {
  try {
    const raw = await LocalStorage.getItem<string>(storageKey(kind, slot));
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Stored;
    const current = cachedWorkspace(slot)?.slug;
    if (stored.workspace && current && stored.workspace !== current) return undefined;
    return hasOptions(stored.options) ? clean(stored.options) : undefined;
  } catch {
    return undefined;
  }
}

// Saves the set; an empty one removes it. Returns whether a set is saved now.
export async function saveDefaults(kind: DefaultsKind, slot: number, options: PlayOptions) {
  if (!hasOptions(options)) {
    await resetDefaults(kind, slot);
    return false;
  }
  const stored: Stored = { workspace: cachedWorkspace(slot)?.slug, options: clean(options) };
  await LocalStorage.setItem(storageKey(kind, slot), JSON.stringify(stored));
  return true;
}

export async function resetDefaults(kind: DefaultsKind, slot: number) {
  await LocalStorage.removeItem(storageKey(kind, slot));
}

// The saved set of a type in a slot, for the lists' hint; revalidate after the form changed it
export function useDefaults(kind: DefaultsKind, slot: number) {
  return usePromise(loadDefaults, [kind, slot]);
}
