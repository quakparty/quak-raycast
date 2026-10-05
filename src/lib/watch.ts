import type { Play, Watch } from "@quak/js";
import { useEffect, useState } from "react";
import { quak } from "./quak";

// Every change of a play as it happens, from the API's WebSocket; `connected` tells when to fall back to polling.
// A new slot (another workspace) starts over with its own connection. The client reconnects by itself, but not after
// a rejected key. Not connected while the key is known to be unusable (enabled false).
export function useLivePlays(slot: number, enabled = true) {
  const [plays, setPlays] = useState<Record<string, Play>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setPlays({});
    setConnected(false);
    if (!enabled) return;
    let watch: Watch;
    try {
      watch = quak(slot).watch({
        onReady: () => setConnected(true),
        onPlay: (play) => setPlays((current) => ({ ...current, [play.id]: play })),
        onClose: () => setConnected(false),
        // the list reports a rejected key with its own request
        onError: () => undefined,
      });
    } catch {
      return; // a malformed key; the list itself reports it
    }
    return () => watch.close();
  }, [slot, enabled]);

  return { plays, connected };
}
