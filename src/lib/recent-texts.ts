import type { Play } from "@quak/js";
import { useCachedPromise } from "@raycast/utils";
import { type KeyedSlot, useKey, useWipe } from "./key-state";
import { quak } from "./quak";

// How many text plays to look at, and how many different texts to offer
const PAGE_SIZE = 50;
const MAX_TEXTS = 10;

// A text said before; plain JSON, because the cache stores JSON
export type RecentText = { text: string; createdAt: string };

// The text of a text play while the API still has it (it goes with the audio)
function textOf(play: Play) {
  if (play.type !== "TEXT" || play.params.textExpired === true) return undefined;
  const text = play.params.text;
  return typeof text === "string" && text.trim() ? text.trim() : undefined;
}

// The workspace's recent texts, newest first, each text once
async function fetchRecentTexts({ slot }: KeyedSlot): Promise<RecentText[]> {
  const { data } = await quak(slot).plays.list({ type: "TEXT", limit: PAGE_SIZE });
  const seen = new Set<string>();
  const texts: RecentText[] = [];
  for (const play of data) {
    const text = textOf(play);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    texts.push({ text, createdAt: play.createdAt });
    if (texts.length === MAX_TEXTS) break;
  }
  return texts;
}

// Recent texts of a slot's workspace, cached across runs and refreshed in the background
export function useRecentTexts(slot: number) {
  const key = useKey(slot);
  // only suggestions; other failures stay quiet
  const recent = useCachedPromise(fetchRecentTexts, [key.arg], { keepPreviousData: true, ...key.options() });
  useWipe(key.state, recent);
  return recent;
}
