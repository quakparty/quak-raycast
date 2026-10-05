import { Action, ActionPanel, Detail, Icon, open, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { PlayOptionsForm } from "./components/play-options-form";
import { useWorkspace } from "./components/switch-workspace-action";
import { formatClock } from "./lib/format";
import { playWithDefaults } from "./lib/play";
import { useDefaults } from "./lib/defaults";
import { useLimits } from "./lib/limits";
import { Recorder, Recording, recorderErrorCode, startRecording } from "./lib/recorder";
import { targetsLine, useTargets } from "./lib/targets";

const WINDOWS = process.platform === "win32";

const PRIVACY_URL = WINDOWS
  ? "ms-settings:privacy-microphone"
  : "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

type Phase = "starting" | "recording" | "recorded" | "sending" | "failed";

const ERRORS = {
  MICROPHONE_DENIED: {
    title: "No access to the microphone",
    message: WINDOWS
      ? "Allow desktop apps to access the microphone in Settings → Privacy & security → Microphone and check that it is not muted, then open Talk again."
      : "Allow Raycast in System Settings → Privacy & Security → Microphone, then open Talk again.",
  },
  NO_MICROPHONE: { title: "No microphone found", message: "Connect a microphone and open Talk again." },
  RECORDING_FAILED: { title: "Could not record", message: "The microphone did not start." },
};

// Records at once: Enter stops and sends with your defaults, ⌘↵ stops and opens the options,
// Esc discards the recording. Stops by itself at the API's limit.
export default function Command() {
  const { push } = useNavigation();
  // no switch here, it records right away; with more than one key the text names the active workspace
  const choice = useWorkspace();
  // own defaults for talk: Enter's title and the text say so
  const defaults = useDefaults("talk", choice.slot);
  const own = Boolean(defaults.data);
  // where Enter sends it, shown before sending
  const targets = useTargets(choice.slot, defaults);
  const recorder = useRef<Recorder>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  // fixed at the start: the cached limit, or the default on the very first run
  const maxSeconds = useRef(useLimits().talkSeconds).current;
  const [startedAt, setStartedAt] = useState<number>();
  const [now, setNow] = useState(Date.now());
  // the length once the recording stopped
  const [recorded, setRecorded] = useState<number>();
  const [error, setError] = useState<(typeof ERRORS)[keyof typeof ERRORS]>();

  useEffect(() => {
    const current = startRecording(maxSeconds);
    recorder.current = current;
    const timer = setInterval(() => {
      // one timestamp for both, so the clock never starts below zero
      const at = Date.now();
      setNow(at);
      if (current.isStarted()) {
        setStartedAt((value) => value ?? at);
        setPhase((value) => (value === "starting" ? "recording" : value));
      }
    }, 200);

    current.result.then(
      (recording) => {
        clearInterval(timer);
        if (recording.reason === "limit") {
          setRecorded(recording.seconds);
          setPhase("recorded");
          showToast({
            style: Toast.Style.Success,
            title: `Stopped at ${formatClock(maxSeconds)}`,
            message: "Send it or discard it",
          });
        }
      },
      async (reason) => {
        clearInterval(timer);
        const code = recorderErrorCode(reason) ?? "RECORDING_FAILED";
        const details = ERRORS[code];
        setError(details);
        setPhase("failed");
        await showToast({
          style: Toast.Style.Failure,
          title: details.title,
          message:
            code === "RECORDING_FAILED" && reason instanceof Error
              ? reason.message.replace(/^RECORDING_FAILED:\s*/, "")
              : details.message,
          primaryAction:
            code === "MICROPHONE_DENIED"
              ? { title: "Open Privacy Settings", onAction: () => open(PRIVACY_URL) }
              : undefined,
        });
      },
    );

    // Esc, closing Raycast or leaving the command: stop the helper and delete the audio
    return () => {
      clearInterval(timer);
      current.dispose();
    };
  }, []);

  // Stops the helper and waits for the file; null when nothing was kept
  async function finish(): Promise<Recording | null> {
    const current = recorder.current;
    if (!current) return null;
    current.stop();
    try {
      const recording = await current.result;
      if (recording.reason === "cancelled") return null;
      setRecorded(recording.seconds);
      return recording;
    } catch {
      return null;
    }
  }

  async function send() {
    const recording = await finish();
    if (!recording) return;
    setPhase("sending");
    // on success the HUD closes Raycast, on an error the recording stays for another try
    await playWithDefaults({ kind: "talk", path: recording.path, seconds: recording.seconds }, "hud", choice.slot);
    setPhase("recorded");
  }

  async function sendWithOptions() {
    const recording = await finish();
    if (!recording) return;
    setPhase("recorded");
    push(
      <PlayOptionsForm
        source={{ kind: "talk", path: recording.path, seconds: recording.seconds }}
        onDefaultsChange={defaults.revalidate}
      />,
    );
  }

  const elapsed = recorded ?? (startedAt ? Math.min(Math.max(0, (now - startedAt) / 1000), maxSeconds) : 0);
  const left = maxSeconds - elapsed;

  return (
    <Detail
      isLoading={phase === "starting" || phase === "sending"}
      markdown={markdown(
        phase,
        elapsed,
        left,
        maxSeconds,
        own,
        [
          // the warning stands out: Enter would fail
          targets && (targets.source === "none" ? `**${targetsLine(targets)}**` : targetsLine(targets)),
          choice.multiple ? choice.active.name : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
        error,
      )}
      actions={
        phase === "recording" || phase === "recorded" ? (
          <ActionPanel>
            <Action
              title={`${phase === "recording" ? "Stop and Talk" : "Talk"}${own ? " with Your Defaults" : ""}`}
              icon={Icon.Play}
              onAction={send}
            />
            <Action title="Talk with Options…" icon={Icon.Gear} onAction={sendWithOptions} />
          </ActionPanel>
        ) : phase === "failed" && error === ERRORS.MICROPHONE_DENIED ? (
          <ActionPanel>
            <Action title="Open Privacy Settings" icon={Icon.Lock} onAction={() => open(PRIVACY_URL)} />
          </ActionPanel>
        ) : undefined
      }
    />
  );
}

function markdown(
  phase: Phase,
  elapsed: number,
  left: number,
  maxSeconds: number,
  own: boolean,
  // "Plays on Wohnzimmer, Küche · Personal" (the workspace with more than one key)
  where: string,
  error?: { title: string; message: string },
) {
  // short and scannable: state and clock as the heading, the keys as one line of key caps
  const enter = own ? "Send with your defaults" : "Send";
  const keys = `\`↵\` ${enter}   ·   \`${WINDOWS ? "Ctrl+↵" : "⌘↵"}\` Options   ·   \`Esc\` Discard`;
  const lines = (...items: string[]) => items.filter(Boolean).join("\n\n");
  switch (phase) {
    case "starting":
      return lines(
        "# Starting the microphone…",
        WINDOWS ? "" : "The first time, macOS asks whether Raycast may use it.",
      );
    case "recording":
      return lines(
        `# 🔴 ${formatClock(elapsed)}`,
        left <= 10 ? `**Stops in ${Math.ceil(left)} s**` : `Recording · stops at ${formatClock(maxSeconds)}`,
        where,
        keys,
      );
    case "recorded":
      return lines(`# ${formatClock(elapsed)}`, "Recorded", where, keys);
    case "sending":
      return lines(`# ${formatClock(elapsed)}`, "Sending…", where);
    case "failed":
      return `## ${error?.title ?? "Could not record"}\n\n${error?.message ?? ""}`;
  }
}
