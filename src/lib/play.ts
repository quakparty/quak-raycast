import { showHUD, showToast, Toast } from "@raycast/api";
import { readFile } from "fs/promises";
import { showError } from "./errors";
import type { Play, PlayTextParams } from "@quak/js";
import { quak } from "./quak";

// What to play: kinds in the API's order, text, talk, sound, clip
export type PlaySource =
  | { kind: "text"; text: string }
  | { kind: "talk"; path: string; seconds: number }
  | { kind: "sound" | "clip"; slug: string; name: string };

// What the options form can set; everything left out comes from the workspace's defaults
export type PlayOptions = {
  to?: string[];
  volume?: number;
  voice?: string;
  effect?: string;
  ambience?: string;
};

type Common = Pick<PlayTextParams, "to" | "volume" | "effect" | "ambience">;

// Only the fields the user set; sounds and clips take effects only when the server processes them
function toParams(source: PlaySource, options: PlayOptions): Common & { voice?: string; process?: boolean } {
  const params: Common & { voice?: string; process?: boolean } = {};
  if (options.to?.length) params.to = options.to;
  if (options.volume !== undefined) params.volume = options.volume;
  if (source.kind === "text" && options.voice) params.voice = options.voice;
  if (options.effect) params.effect = options.effect as Common["effect"];
  if (options.ambience) params.ambience = options.ambience as Common["ambience"];
  if (source.kind === "sound" || source.kind === "clip") {
    // "none" alone needs no processing (and would cost the extra credit)
    const active = [params.effect, params.ambience].some((value) => value && value !== "none");
    if (active) {
      params.process = true;
    } else {
      delete params.effect;
      delete params.ambience;
    }
  }
  return params;
}

export async function sendPlay(source: PlaySource, options: PlayOptions = {}): Promise<Play> {
  const client = quak();
  const params = toParams(source, options);
  switch (source.kind) {
    case "text":
      return (await client.play.text({ ...params, text: source.text })).data;
    case "talk": {
      // talk always runs through the voice processing, it takes no process field
      const file = await readFile(source.path);
      return (await client.play.talk({ ...params, file, filename: "talk.m4a" })).data;
    }
    case "sound":
      return (await client.play.sound({ ...params, sound: source.slug })).data;
    case "clip":
      return (await client.play.clip({ ...params, clip: source.slug })).data;
  }
}

const SKIP_REASONS: Record<string, string> = {
  QUIET_HOURS: "Quiet hours, nothing played",
  BUSY: "All speakers are busy with a higher-priority clip",
};

// One line for a play that went out: where it plays, or why it was skipped
export function describePlay(play: Play): { title: string; message?: string; skipped: boolean } {
  if (play.status === "SKIPPED") {
    return { title: SKIP_REASONS[play.skipReason ?? ""] ?? "Skipped, nothing played", skipped: true };
  }
  if (play.status === "SCHEDULED") {
    return { title: "Scheduled", skipped: false };
  }
  const playing = play.players.filter((player) => player.status !== "FAILED" && player.status !== "SKIPPED");
  const failed = play.players.filter((player) => player.status === "FAILED");
  const title = playing.length ? `Playing on ${playing.map((player) => player.name).join(", ")}` : "Playing";
  const message = failed.length
    ? `Failed on ${failed.map((player) => (player.error ? `${player.name} (${player.error})` : player.name)).join(", ")}`
    : undefined;
  return { title, message, skipped: false };
}

// "hud" closes Raycast (Say, Talk), "toast" keeps the list open for the next one
export type Feedback = "hud" | "toast";

// Runs a play request with feedback: the API's message on errors, where it plays or why it was skipped on success.
// Returns the play, or null when it failed.
export async function withFeedback(request: () => Promise<Play>, feedback: Feedback, busy = "Playing…") {
  const toast = feedback === "toast" ? await showToast({ style: Toast.Style.Animated, title: busy }) : null;
  try {
    const play = await request();
    const { title, message } = describePlay(play);
    if (toast) {
      toast.style = Toast.Style.Success;
      toast.title = title;
      toast.message = message;
    } else {
      await showHUD(message ? `${title} · ${message}` : title);
    }
    return play;
  } catch (error) {
    await toast?.hide();
    await showError(error, "Could not play");
    return null;
  }
}

export function playWithFeedback(source: PlaySource, options: PlayOptions, feedback: Feedback) {
  return withFeedback(() => sendPlay(source, options), feedback);
}
