import { useCachedPromise } from "@raycast/utils";
import { unwrap } from "@quak/js";
import { quak } from "./quak";
import { activeSlot } from "./slots";

// The API's limits for plays (GET /v1/workspace → limits); the defaults cover the first run before the answer
export type Limits = { textCharacters: number; talkSeconds: number };

const DEFAULT_LIMITS: Limits = { textCharacters: 1000, talkSeconds: 180 };

// The limits of a slot's workspace, the active one by default
export function useLimits(slot = activeSlot()): Limits {
  const { data } = useCachedPromise(
    async (slot: number) => {
      const { data } = await unwrap(quak(slot).api.GET("/v1/workspace"));
      return { ...DEFAULT_LIMITS, ...(data as { limits?: Partial<Limits> }).limits };
    },
    [slot],
    // only the limits; the play itself reports a failure
    { onError: () => undefined },
  );
  return data ?? DEFAULT_LIMITS;
}
