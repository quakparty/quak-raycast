import { environment } from "@raycast/api";
import { spawn } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { windowsPowerShell } from "./player";

// The recording on Windows: assets/talk-recorder.ps1 in Windows PowerShell 5.1 (winmm.dll through MCI, nothing to
// install). Same folder protocol as the Swift helper on macOS; the result comes as one line of JSON on stdout, an error
// as "CODE: message" on stderr.

export type WindowsRecording = { path: string; seconds: number; reason: "stopped" | "limit" | "cancelled" };

const CODES = /^(MICROPHONE_DENIED|NO_MICROPHONE|RECORDING_FAILED): .*$/m;

// The script as -EncodedCommand (UTF-16LE, base64): no quoting, no execution policy, no file path on the command line.
// Comment lines and indentation go, the command line holds at most 32767 characters.
function encodedScript() {
  const script = readFileSync(join(environment.assetsPath, "talk-recorder.ps1"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join("\n");
  return Buffer.from(script, "utf16le").toString("base64");
}

export function recordWindows(directory: string, maxSeconds: number): Promise<WindowsRecording> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      windowsPowerShell(),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript()],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        // the folder and the limit from the environment, never from the script's text
        env: {
          ...process.env,
          QUAK_TALK_DIR: directory,
          QUAK_TALK_MAX: String(maxSeconds),
          QUAK_TALK_PARENT: String(process.pid),
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));

    // the script ends by itself without a heartbeat or parent; this only speeds it up
    const kill = () => child.kill();
    process.once("exit", kill);

    child.once("error", (error) => {
      process.off("exit", kill);
      reject(new Error(`RECORDING_FAILED: Could not start PowerShell (${error.message})`));
    });
    child.once("close", (code) => {
      process.off("exit", kill);
      const line = stdout.trim().split(/\r?\n/).pop() ?? "";
      if (code === 0) {
        try {
          const result = JSON.parse(line) as Partial<WindowsRecording>;
          resolve({
            // the path as given here, not as it went through the console's encoding
            path: join(directory, "audio.wav"),
            seconds: Number(result.seconds) || 0,
            reason: result.reason === "limit" || result.reason === "cancelled" ? result.reason : "stopped",
          });
          return;
        } catch {
          // falls through to the error
        }
      }
      const error = stderr.match(CODES)?.[0];
      const last = stderr.trim().split(/\r?\n/).pop();
      reject(new Error(error ?? `RECORDING_FAILED: ${last || `PowerShell ended with code ${code}`}`));
    });
  });
}
