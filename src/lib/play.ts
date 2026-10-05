import { PopToRootType, showHUD, showToast, Toast } from "@raycast/api";
import { readFile } from "fs/promises";
import { loadDefaults } from "./defaults";
import { showError } from "./errors";
import { noteKeyError } from "./key-state";
import type { Play, PlayTextParams } from "@quak/js";
import { quak } from "./quak";
import { activeSlot } from "./slots";
import { workspaceSuffix } from "./workspaces";

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

type Common = Pick<PlayTextParams, "to" | "volume" | "effect" | "ambience" | "preview">;

// Only the fields the user set; sounds and clips take effects only when the server processes them
function toParams(source: PlaySource, options: PlayOptions): Common & { voice?: string; process?: boolean } {
  const params: Common & { voice?: string; process?: boolean } = {};
  if (options.to?.length) params.to = options.to;
  if (options.volume !== undefined) params.volume = options.volume;
  if (source.kind === "text" && options.voice) params.voice = options.voice;
  if (options.effect) params.effect = options.effect as Common["effect"];
  if (options.ambience) params.ambience = options.ambience as Common["ambience"];
  if (source.kind === "sound" || source.kind === "clip") {
    // "none" alone needs no processing (and would cost more)
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

// Below this balance a play's HUD or toast says how many credits are left; the only place credits show up
const LOW_CREDITS = 20;

// A play and the workspace's balance after it (X-Quak-Credits of the same client's answer, null without one)
export type Played = { play: Play; credits: number | null };

// slot: the workspace's key, the active one by default (a quicklink brings its own). preview: only make the audio
// (audioUrl), nothing plays on Sonos.
export async function sendPlay(
  source: PlaySource,
  options: PlayOptions = {},
  slot?: number,
  preview = false,
): Promise<Played> {
  const client = quak(slot);
  const params = toParams(source, options);
  if (preview) params.preview = true;
  const play = await (async () => {
    switch (source.kind) {
      case "text":
        return (await client.play.text({ ...params, text: source.text })).data;
      case "talk": {
        // talk always runs through the voice processing, it takes no process field
        // AAC from the Swift helper on macOS, WAV from the PowerShell script on Windows
        const wav = source.path.toLowerCase().endsWith(".wav");
        const file = new Blob([await readFile(source.path)], { type: wav ? "audio/wav" : "audio/mp4" });
        return (await client.play.talk({ ...params, file, filename: wav ? "talk.wav" : "talk.m4a" })).data;
      }
      case "sound":
        return (await client.play.sound({ ...params, sound: source.slug })).data;
      case "clip":
        return (await client.play.clip({ ...params, clip: source.slug })).data;
    }
  })();
  return { play, credits: client.credits };
}

// "Only 12 credits left" below LOW_CREDITS, else nothing
export function lowCredits(credits: number | null) {
  if (credits === null || credits >= LOW_CREDITS) return undefined;
  return `Only ${credits} ${credits === 1 ? "credit" : "credits"} left`;
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

// "hud" closes Raycast (Play Text, Talk to Speakers), "toast" keeps the list open for the next one
export type Feedback = "hud" | "toast";

// Runs a play request with feedback: the API's message on errors, where it plays or why it was skipped on success,
// and a low balance. With more than one key the HUD names the workspace (slot: the one the request uses). Returns the
// play, or null when it failed.
export async function withFeedback(
  request: () => Promise<Played>,
  feedback: Feedback,
  busy = "Playing…",
  slot = activeSlot(),
) {
  const toast = feedback === "toast" ? await showToast({ style: Toast.Style.Animated, title: busy }) : null;
  try {
    const { play, credits } = await request();
    const described = describePlay(play);
    const message = [described.message, lowCredits(credits)].filter(Boolean).join(" · ") || undefined;
    if (toast) {
      toast.style = Toast.Style.Success;
      toast.title = described.title;
      toast.message = message;
    } else {
      const where = `${described.title}${await workspaceSuffix(slot)}`;
      // the play is done: back to root search, so reopening Raycast doesn't land in the same command again
      await showHUD(message ? `${where} · ${message}` : where, { popToRootType: PopToRootType.Immediate });
    }
    return play;
  } catch (error) {
    await toast?.hide();
    // the lists switch to their key view; the toast stays, it answers this action
    noteKeyError(slot, error);
    await showError(error, "Could not play");
    return null;
  }
}

export function playWithFeedback(source: PlaySource, options: PlayOptions, feedback: Feedback, slot?: number) {
  return withFeedback(() => sendPlay(source, options, slot), feedback, undefined, slot);
}

// A plain play (Enter, quicklinks, Play Selected Text): the extension's defaults for this type and workspace, the
// workspace's for everything they leave out
export function playWithDefaults(source: PlaySource, feedback: Feedback, slot?: number) {
  const target = slot ?? activeSlot();
  return withFeedback(
    async () => sendPlay(source, (await loadDefaults(source.kind, target)) ?? {}, target),
    feedback,
    undefined,
    target,
  );
}
