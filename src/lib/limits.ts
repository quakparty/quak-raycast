import type { Workspace } from "@quak/js";
import { useCachedPromise } from "@raycast/utils";
import { quak } from "./quak";
import { activeSlot } from "./slots";

// The API's limits for plays (GET /v1/workspace → limits); the defaults cover the first run before the answer
export type Limits = { textCharacters: number; talkSeconds: number };

const DEFAULT_LIMITS: Limits = { textCharacters: 1000, talkSeconds: 180 };

// GET /v1/workspace of a slot; hooks that ask at the same time share one request
const pending = new Map<number, Promise<Workspace>>();

function fetchWorkspace(slot: number): Promise<Workspace> {
  let request = pending.get(slot);
  if (!request) {
    request = quak(slot)
      .workspace.get()
      .then(({ data }) => data)
      .finally(() => pending.delete(slot));
    pending.set(slot, request);
  }
  return request;
}

// A slot's workspace (limits, playback defaults), cached across runs; undefined only before the very first answer
export function useWorkspaceDetails(slot = activeSlot()) {
  return useCachedPromise(fetchWorkspace, [slot], {
    // only limits and hints; the play itself reports a failure
    onError: () => undefined,
  });
}

// The limits of a slot's workspace, the active one by default
export function useLimits(slot = activeSlot()): Limits {
  const { data } = useWorkspaceDetails(slot);
  return { ...DEFAULT_LIMITS, ...data?.limits };
}
