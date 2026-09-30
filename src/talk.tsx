import { Action, ActionPanel, Detail, Icon, open, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { PlayOptionsForm } from "./components/play-options-form";
import { formatClock } from "./lib/format";
import { withFeedback, sendPlay } from "./lib/play";
import { MAX_SECONDS, Recorder, Recording, recorderErrorCode, startRecording } from "./lib/recorder";

const PRIVACY_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

type Phase = "starting" | "recording" | "recorded" | "sending" | "failed";

const ERRORS = {
  MICROPHONE_DENIED: {
    title: "No access to the microphone",
    message: "Allow Raycast in System Settings → Privacy & Security → Microphone, then open Talk again.",
  },
  NO_MICROPHONE: { title: "No microphone found", message: "Connect a microphone and open Talk again." },
  RECORDING_FAILED: { title: "Could not record", message: "The microphone did not start." },
};

// The recording is native code (Swift, AVFoundation) that only exists on macOS
export default function Command() {
  if (process.platform !== "darwin") {
    return (
      <Detail markdown={"## Talk needs macOS\n\nRecording from the microphone is only available in Raycast for Mac."} />
    );
  }
  return <Talk />;
}

// Records at once: Enter stops and sends with the workspace's defaults, ⌘↵ stops and opens the options,
// Esc discards the recording. Stops by itself at the API's limit.
function Talk() {
  const { push } = useNavigation();
  const recorder = useRef<Recorder>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [startedAt, setStartedAt] = useState<number>();
  const [now, setNow] = useState(Date.now());
  // the length once the recording stopped
  const [recorded, setRecorded] = useState<number>();
  const [error, setError] = useState<(typeof ERRORS)[keyof typeof ERRORS]>();

  useEffect(() => {
    const current = startRecording();
    recorder.current = current;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (current.isStarted()) {
        setStartedAt((value) => value ?? Date.now());
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
            title: `Stopped at ${MAX_SECONDS} s`,
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
    await withFeedback(() => sendPlay({ kind: "talk", path: recording.path, seconds: recording.seconds }), "hud");
    setPhase("recorded");
  }

  async function sendWithOptions() {
    const recording = await finish();
    if (!recording) return;
    setPhase("recorded");
    push(<PlayOptionsForm source={{ kind: "talk", path: recording.path, seconds: recording.seconds }} />);
  }

  const elapsed = recorded ?? (startedAt ? Math.min((now - startedAt) / 1000, MAX_SECONDS) : 0);
  const left = MAX_SECONDS - elapsed;

  return (
    <Detail
      navigationTitle="Talk to Speakers"
      isLoading={phase === "starting" || phase === "sending"}
      markdown={markdown(phase, elapsed, left, error)}
      actions={
        phase === "recording" || phase === "recorded" ? (
          <ActionPanel>
            <Action title={phase === "recording" ? "Stop and Talk" : "Talk"} icon={Icon.Play} onAction={send} />
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

function markdown(phase: Phase, elapsed: number, left: number, error?: { title: string; message: string }) {
  const keys = "**Enter** sends it with your workspace's defaults, **⌘↵** opens the options, **Esc** discards it.";
  switch (phase) {
    case "starting":
      return "## Starting the microphone…\n\nThe first time, macOS asks whether Raycast may use the microphone.";
    case "recording":
      return [
        `# ● ${formatClock(elapsed)}`,
        "Speak now. " + keys,
        left <= 10 ? `**Stops in ${Math.ceil(left)} s.**` : `Stops by itself at ${formatClock(MAX_SECONDS)}.`,
      ].join("\n\n");
    case "recorded":
      return [`# ${formatClock(elapsed)}`, "Recorded. " + keys].join("\n\n");
    case "sending":
      return `# ${formatClock(elapsed)}\n\nSending…`;
    case "failed":
      return `## ${error?.title ?? "Could not record"}\n\n${error?.message ?? ""}`;
  }
}
