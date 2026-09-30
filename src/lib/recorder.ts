import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { record } from "swift:../../swift";

const PREFIX = "quak-talk-";
// Leftovers of a command that died before it could clean up
const STALE_MS = 10 * 60 * 1000;

export type Recording = { path: string; seconds: number; reason: "stopped" | "limit" | "cancelled" };

export type Recorder = {
  // Resolves once the helper stopped: by stop(), at the limit or cancelled
  result: Promise<Recording>;
  // True once the microphone records (after a permission prompt, if there was one)
  isStarted: () => boolean;
  // Stop and keep the audio
  stop: () => void;
  // Stop, discard the audio and delete the temp folder; safe to call more than once
  dispose: () => void;
};

// Error codes of the Swift helper (the text before the colon)
export type RecorderErrorCode = "MICROPHONE_DENIED" | "NO_MICROPHONE" | "RECORDING_FAILED";

export function recorderErrorCode(error: unknown): RecorderErrorCode | undefined {
  const message = error instanceof Error ? error.message : String(error);
  return (["MICROPHONE_DENIED", "NO_MICROPHONE", "RECORDING_FAILED"] as const).find((code) => message.startsWith(code));
}

// Starts the Swift helper, which records the microphone into a temp folder. It runs as its own process and is steered
// through files there (see swift/Sources/Recorder.swift): a heartbeat from here, a stop file with "send" or "cancel".
// Without a heartbeat for 3 s (the command unloaded) it stops and deletes everything by itself.
// The recording stops at maxSeconds, the API's talkSeconds.
export function startRecording(maxSeconds: number): Recorder {
  sweep();
  const directory = mkdtempSync(join(tmpdir(), PREFIX));
  const heartbeat = join(directory, "heartbeat");
  writeFileSync(heartbeat, "");
  const timer = setInterval(() => {
    const now = new Date();
    try {
      utimesSync(heartbeat, now, now);
    } catch {
      // the helper already removed the folder
    }
  }, 500);

  // the heartbeat runs until dispose(), so a kept recording (options form) is not swept by another run
  const result = record(directory, maxSeconds) as Promise<Recording>;
  const command = (value: "send" | "cancel") => {
    try {
      writeFileSync(join(directory, "stop"), value);
    } catch {
      // the folder is gone, nothing records any more
    }
  };
  const remove = () => rmSync(directory, { recursive: true, force: true });

  return {
    result,
    isStarted: () => existsSync(join(directory, "started")),
    stop: () => command("send"),
    dispose: () => {
      clearInterval(timer);
      command("cancel");
      result.then(remove, remove);
    },
  };
}

// Removes temp folders of earlier runs that could not clean up
function sweep() {
  const root = tmpdir();
  try {
    for (const name of readdirSync(root)) {
      if (!name.startsWith(PREFIX)) continue;
      const path = join(root, name);
      const heartbeat = join(path, "heartbeat");
      const touched = statSync(existsSync(heartbeat) ? heartbeat : path).mtimeMs;
      if (Date.now() - touched > STALE_MS) rmSync(path, { recursive: true, force: true });
    }
  } catch {
    // best effort
  }
}
