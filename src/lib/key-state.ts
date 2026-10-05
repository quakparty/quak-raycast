import { Cache } from "@raycast/api";
import { QuakError } from "@quak/js";
import { useEffect, useSyncExternalStore } from "react";
import { KeyFormatError } from "./errors";
import { KEY_PREFIX } from "./quak";
import { keyField, keyHash } from "./slots";
import { forgetWorkspace } from "./workspaces";

// Whether a slot's key can be used: "missing" and "malformed" come from the preference (no request), "rejected"
// (401) and "scope" (403 ERROR_INSUFFICIENT_SCOPE) from an answer of the API
export type KeyState = "ok" | "missing" | "malformed" | "rejected" | "scope";
type Rejection = "rejected" | "scope";

// A rejection is remembered per slot, tied to a hash of its key (never the key): a new key starts over, and the other
// commands know at once without asking again. Its own namespace keeps it apart from the cached lists.
const cache = new Cache({ namespace: "keys" });
type Stored = { key: string; reason: Rejection };

function storedRejection(slot: number): Rejection | undefined {
  try {
    const stored = JSON.parse(cache.get(`rejected:${slot}`) ?? "null") as Stored | null;
    return stored && stored.key === keyHash(slot) ? stored.reason : undefined;
  } catch {
    return undefined;
  }
}

// The state of a slot's key, read synchronously
export function keyState(slot: number): KeyState {
  const key = keyField(slot);
  if (!key) return "missing";
  if (!key.startsWith(KEY_PREFIX)) return "malformed";
  return storedRejection(slot) ?? "ok";
}

// What an error says about the key, if anything
function rejection(error: unknown): Rejection | undefined {
  if (!(error instanceof QuakError)) return undefined;
  if (error.status === 401) return "rejected";
  if (error.status === 403 && error.code === "ERROR_INSUFFICIENT_SCOPE") return "scope";
  return undefined;
}

// Remembers a rejected key for its slot and forgets the slot's workspace name. True when the error was about the key
// (also a malformed one), so a list leaves the message to its key view instead of a toast.
export function noteKeyError(slot: number, error: unknown) {
  if (error instanceof KeyFormatError) return true;
  const reason = rejection(error);
  if (!reason) return false;
  if (storedRejection(slot) !== reason) {
    cache.set(`rejected:${slot}`, JSON.stringify({ key: keyHash(slot), reason } satisfies Stored));
    forgetWorkspace(slot);
  }
  return true;
}

// Try Again: the lists ask the API once more
export function clearKeyRejection(slot: number) {
  cache.remove(`rejected:${slot}`);
}

const subscribe = (onChange: () => void) => cache.subscribe(() => onChange());

// The first argument of a cached request: the slot and its key's hash, so cached data belongs to that key and a new
// key never shows the old one's
export type KeyedSlot = { slot: number; key: string };

// A slot's key for cached requests: its state (updates when a request gets rejected), the argument for the request and
// its options. Only an ok key sends requests; a rejection from any of them switches every list to its key view and
// replaces the toast.
export function useKey(slot: number) {
  const state = useSyncExternalStore(subscribe, () => keyState(slot));
  const arg: KeyedSlot = { slot, key: keyHash(slot) };
  const options = (onError?: (error: Error) => void) => ({
    execute: state === "ok",
    onError: (error: Error) => {
      if (!noteKeyError(slot, error)) onError?.(error);
    },
  });
  return { state, ok: state === "ok", arg, options };
}

// What useWipe needs of a cached request; a method, so useCachedPromise's mutate fits
type Wipeable<T> = {
  data: T;
  mutate(update?: undefined, options?: { optimisticUpdate?: (data: T) => T; shouldRevalidateAfter?: boolean }): unknown;
};

// After a rejection the request's cached data goes, so nothing of it shows again, not even after Try Again
export function useWipe<T>(state: KeyState, result: Wipeable<T>) {
  const stale = (state === "rejected" || state === "scope") && result.data !== undefined;
  useEffect(() => {
    if (stale) result.mutate(undefined, { optimisticUpdate: () => undefined as T, shouldRevalidateAfter: false });
  }, [stale]);
}
