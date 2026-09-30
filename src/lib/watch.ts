import type { Play } from "@quak/js";
import { useEffect, useState } from "react";
import { apiKey, WATCH_URL } from "./quak";

const RECONNECT_MS = 3000;

type Message = { type: "ready" } | { type: "play"; data: Play } | { type: "ping" } | { type: "error"; code: string };

// Every change of a play as it happens, from the API's WebSocket; `connected` tells when to fall back to polling
export function useLivePlays() {
  const [plays, setPlays] = useState<Record<string, Play>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    function connect() {
      let key: string;
      try {
        key = apiKey();
      } catch {
        return; // the list itself reports the key
      }
      socket = new WebSocket(WATCH_URL);
      socket.onopen = () => socket?.send(JSON.stringify({ type: "auth", apiKey: key }));
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as Message;
        if (message.type === "ready") setConnected(true);
        if (message.type === "play") setPlays((current) => ({ ...current, [message.data.id]: message.data }));
      };
      socket.onclose = (event) => {
        setConnected(false);
        // 4001: key rejected, 4401: ticket rejected; no point in trying again
        if (!closed && event.code !== 4001 && event.code !== 4401) retry = setTimeout(connect, RECONNECT_MS);
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return { plays, connected };
}
