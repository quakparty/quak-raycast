import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readdirSync, rmSync, statSync } from "fs";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";

// Plays audio files on this computer with what the system brings: afplay on macOS, WPF's MediaPlayer through
// PowerShell on Windows. No Raycast imports here, so the process handling can be tried outside Raycast.

const PREFIX = "quak-preview-";
// Leftovers of a command that died before it could clean up
const STALE_MS = 10 * 60 * 1000;

// Waits until the file is open (at most 10 s), plays it and waits for its length; without a length it gives up after
// 200 s (more than the longest play). The path comes from the environment, never from the script's text.
const WINDOWS_SCRIPT = [
  "Add-Type -AssemblyName PresentationCore",
  "$p = New-Object System.Windows.Media.MediaPlayer",
  "$p.Open([uri]$env:QUAK_PREVIEW_FILE)",
  "$i = 0",
  "while (-not $p.NaturalDuration.HasTimeSpan -and $i -lt 100) { Start-Sleep -Milliseconds 100; $i++ }",
  "$p.Play()",
  "if ($p.NaturalDuration.HasTimeSpan) { $ms = [int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 300 } else { $ms = 200000 }",
  "Start-Sleep -Milliseconds $ms",
  "$p.Close()",
].join("; ");

export type Playback = {
  // Resolves once the process ended: at the end of the audio, stopped or failed
  done: Promise<void>;
  // Ends the process; safe to call more than once
  stop: () => void;
};

// Runs a command until it ends or stop() kills it
export function runProcess(command: string, args: string[], env?: NodeJS.ProcessEnv): Playback {
  const child = spawn(command, args, { stdio: "ignore", windowsHide: true, env: env ?? process.env });
  let stopped = false;
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (stopped || code === 0) resolve();
      else reject(new Error(`The audio player ended with code ${code}`));
    });
  });
  const kill = () => child.kill();
  process.once("exit", kill);
  done.finally(() => process.off("exit", kill)).catch(() => undefined);
  return {
    done,
    stop: () => {
      if (stopped || child.exitCode !== null) return;
      stopped = true;
      kill();
    },
  };
}

// Plays a local file with the system's player
export function playFile(path: string): Playback {
  if (process.platform === "win32") {
    const root = process.env.SystemRoot ?? "C:\\Windows";
    const powershell = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    return runProcess(powershell, ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT], {
      ...process.env,
      QUAK_PREVIEW_FILE: path,
    });
  }
  return runProcess("/usr/bin/afplay", [path]);
}

const TYPES: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
};

// The file's extension, for players that go by it: from the link, else from the content type, else mp3
function extension(url: string, type: string | null) {
  try {
    const fromPath = extname(new URL(url).pathname).toLowerCase();
    if (/^\.[a-z0-9]{2,4}$/.test(fromPath)) return fromPath;
  } catch {
    // not a link, use the type
  }
  return TYPES[(type ?? "").split(";")[0].trim()] ?? ".mp3";
}

// Downloads the audio into a temp file of its own and returns its path
export async function downloadAudio(url: string, signal?: AbortSignal) {
  sweep();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not download the audio (${response.status})`);
  const path = join(tmpdir(), `${PREFIX}${randomUUID()}${extension(url, response.headers.get("content-type"))}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

export function removeFile(path: string) {
  try {
    rmSync(path, { force: true });
  } catch {
    // Windows may still hold it for a moment; the next sweep removes it
  }
}

// Removes temp files of earlier runs that could not clean up
export function sweep() {
  const root = tmpdir();
  try {
    for (const name of readdirSync(root)) {
      if (!name.startsWith(PREFIX)) continue;
      const path = join(root, name);
      if (Date.now() - statSync(path).mtimeMs > STALE_MS) removeFile(path);
    }
  } catch {
    // best effort
  }
}
