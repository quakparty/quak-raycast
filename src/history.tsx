import { Action, ActionPanel, Color, Icon, Keyboard, List, showToast, Toast } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { unwrap, type Play } from "@quak/js";
import { SaveClipForm } from "./components/save-clip-form";
import { STOP_ALL_SHORTCUT, STOP_SHORTCUT, StopAction } from "./components/stop-action";
import { formatSeconds } from "./lib/format";
import { withFeedback } from "./lib/play";
import { quak } from "./lib/quak";

const PAGE_SIZE = 30;

const TYPE_NAMES: Record<Play["type"], string> = {
  TEXT: "Text",
  TALK: "Talk",
  SOUND: "Sound",
  CLIP: "Clip",
  FILE: "File",
  URL: "URL",
};

const TYPE_ICONS: Record<Play["type"], Icon> = {
  TEXT: Icon.SpeechBubble,
  TALK: Icon.Microphone,
  SOUND: Icon.Music,
  CLIP: Icon.Waveform,
  FILE: Icon.Document,
  URL: Icon.Link,
};

const STATUS: Record<Play["status"], { name: string; color: Color }> = {
  SCHEDULED: { name: "Scheduled", color: Color.Purple },
  PENDING: { name: "Starting", color: Color.Blue },
  ACTIVE: { name: "Playing", color: Color.Green },
  PARTIALLY_DONE: { name: "Partly Done", color: Color.Orange },
  DONE: { name: "Done", color: Color.SecondaryText },
  STOPPED: { name: "Stopped", color: Color.Orange },
  FAILED: { name: "Failed", color: Color.Red },
  SKIPPED: { name: "Skipped", color: Color.Yellow },
};

const PLAYER_STATUS: Record<Play["players"][number]["status"], Color> = {
  PENDING: Color.Blue,
  ACTIVE: Color.Green,
  DONE: Color.SecondaryText,
  STOPPED: Color.Orange,
  FAILED: Color.Red,
  SKIPPED: Color.Yellow,
};

const SKIP_REASONS: Record<string, string> = { QUIET_HOURS: "Quiet hours", BUSY: "Speakers busy" };

function param(play: Play, key: string): string | undefined {
  const value = play.params[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

const isLive = (play: Play) => play.type === "TALK" && play.params.live === true;
const isProcessed = (play: Play) => play.params.process !== false;
const isRunning = (play: Play) => ["SCHEDULED", "PENDING", "ACTIVE"].includes(play.status);
const hasText = (play: Play) =>
  play.type === "TEXT" && play.params.textExpired !== true && Boolean(param(play, "text"));

// Replay: not for talk live (not recorded) and unprocessed URLs (not stored), see docs/plays.md#replay
const canReplay = (play: Play) => !isLive(play) && !(play.type === "URL" && !isProcessed(play));
// Save: only audio the server made, so sounds, clips and URLs only when processed
const canSave = (play: Play) =>
  !isLive(play) && (["TEXT", "TALK", "FILE"].includes(play.type) || play.params.process === true);

function typeName(play: Play) {
  return isLive(play) ? "Talk Live" : TYPE_NAMES[play.type];
}

// Recent plays of the workspace with their details
export default function Command() {
  // the history names sounds and clips by slug, the lists give their names
  const names = useCachedPromise(async () => {
    const [sounds, clips] = await Promise.all([quak().sounds.list({ limit: 500 }), quak().clips.list()]);
    return {
      sounds: new Map(sounds.data.map((sound) => [sound.slug, sound.name])),
      clips: new Map(clips.data.map((clip) => [clip.slug, clip.name])),
    };
  }, []);

  const plays = useCachedPromise(
    () =>
      async ({ page }: { page: number }) => {
        const { data, meta } = await quak().plays.list({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
        return { data, hasMore: meta.offset + meta.count < meta.total };
      },
    [],
    { keepPreviousData: true },
  );

  function content(play: Play) {
    switch (play.type) {
      case "TEXT":
        return param(play, "text") ?? "Text";
      case "SOUND": {
        const slug = param(play, "sound") ?? "";
        return names.data?.sounds.get(slug) ?? (slug || "Sound");
      }
      case "CLIP": {
        const slug = param(play, "clip") ?? "";
        return names.data?.clips.get(slug) ?? (slug || "Clip");
      }
      case "TALK": {
        const seconds = Number(play.params.speechSeconds);
        return Number.isFinite(seconds) && seconds > 0
          ? `${typeName(play)}, ${formatSeconds(seconds)}`
          : typeName(play);
      }
      default:
        return typeName(play);
    }
  }

  function speakers(play: Play) {
    if (play.players.length) return play.players.map((player) => player.name).join(", ");
    const to = play.params.to;
    return Array.isArray(to) && to.length ? to.join(", ") : "–";
  }

  function client(play: Play) {
    const name = play.client.name ? `${play.client.name}${play.client.version ? ` ${play.client.version}` : ""}` : null;
    return name ? `${name} (${play.client.platform})` : play.client.platform;
  }

  async function replay(play: Play) {
    const done = await withFeedback(
      async () =>
        (await unwrap(quak().api.POST("/v1/plays/{uuid}/replay", { params: { path: { uuid: play.id } }, body: {} })))
          .data,
      "toast",
      "Replaying…",
    );
    if (done) plays.revalidate();
  }

  async function stop(play: Play) {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Stopping…" });
    try {
      await quak().plays.stop(play.id);
      toast.style = Toast.Style.Success;
      toast.title = "Stopped";
      plays.revalidate();
    } catch (error) {
      await toast.hide();
      await showFailureToast(error, { title: "Could not stop" });
    }
  }

  function detail(play: Play) {
    const status = STATUS[play.status];
    const failures = play.players.filter((player) => player.error);
    const effect = param(play, "effect");
    const ambience = param(play, "ambience");
    return (
      <List.Item.Detail
        markdown={
          play.type === "TEXT"
            ? hasText(play)
              ? param(play, "text")
              : "_The text is gone with its audio._"
            : undefined
        }
        metadata={
          <List.Item.Detail.Metadata>
            <List.Item.Detail.Metadata.Label title="Type" text={typeName(play)} icon={TYPE_ICONS[play.type]} />
            {play.type !== "TEXT" && <List.Item.Detail.Metadata.Label title="Content" text={content(play)} />}
            <List.Item.Detail.Metadata.TagList title="Status">
              <List.Item.Detail.Metadata.TagList.Item text={status.name} color={status.color} />
              {play.skipReason && (
                <List.Item.Detail.Metadata.TagList.Item text={SKIP_REASONS[play.skipReason] ?? play.skipReason} />
              )}
            </List.Item.Detail.Metadata.TagList>
            {play.players.length ? (
              <List.Item.Detail.Metadata.TagList title="Speakers">
                {play.players.map((player) => (
                  <List.Item.Detail.Metadata.TagList.Item
                    key={player.id}
                    text={player.name}
                    color={PLAYER_STATUS[player.status]}
                  />
                ))}
              </List.Item.Detail.Metadata.TagList>
            ) : (
              <List.Item.Detail.Metadata.Label title="Speakers" text={speakers(play)} />
            )}
            {failures.map((player) => (
              <List.Item.Detail.Metadata.Label
                key={player.id}
                title={`Error on ${player.name}`}
                text={player.error ?? ""}
              />
            ))}
            <List.Item.Detail.Metadata.Label title="Time" text={new Date(play.createdAt).toLocaleString("en-US")} />
            {play.startsAt && (
              <List.Item.Detail.Metadata.Label title="Starts" text={new Date(play.startsAt).toLocaleString("en-US")} />
            )}
            <List.Item.Detail.Metadata.Label title="Client" text={client(play)} />
            <List.Item.Detail.Metadata.Separator />
            {param(play, "volume") && <List.Item.Detail.Metadata.Label title="Volume" text={param(play, "volume")} />}
            {param(play, "voice") && <List.Item.Detail.Metadata.Label title="Voice" text={param(play, "voice")} />}
            {effect && effect !== "none" && <List.Item.Detail.Metadata.Label title="Voice Effect" text={effect} />}
            {ambience && ambience !== "none" && <List.Item.Detail.Metadata.Label title="Ambience" text={ambience} />}
            {play.length !== null && (
              <List.Item.Detail.Metadata.Label title="Length" text={formatSeconds(play.length)} />
            )}
            <List.Item.Detail.Metadata.Label title="Credits" text={String(play.credits)} />
            {play.params.replayOf !== undefined && <List.Item.Detail.Metadata.Label title="Replay" text="Yes" />}
          </List.Item.Detail.Metadata>
        }
      />
    );
  }

  return (
    <List isLoading={plays.isLoading} isShowingDetail pagination={plays.pagination} searchBarPlaceholder="Filter plays">
      {plays.data?.map((play) => (
        <List.Item
          key={play.id}
          icon={{ source: TYPE_ICONS[play.type], tooltip: typeName(play) }}
          title={content(play)}
          keywords={[typeName(play), speakers(play), STATUS[play.status].name]}
          accessories={[
            { tag: { value: STATUS[play.status].name, color: STATUS[play.status].color } },
            { date: new Date(play.createdAt) },
          ]}
          detail={detail(play)}
          actions={
            <ActionPanel>
              {canReplay(play) && <Action title="Replay" icon={Icon.Repeat} onAction={() => replay(play)} />}
              {isRunning(play) && (
                <Action title="Stop" icon={Icon.Stop} shortcut={STOP_SHORTCUT} onAction={() => stop(play)} />
              )}
              {canSave(play) && (
                <Action.Push
                  title="Save as Clip"
                  icon={Icon.SaveDocument}
                  shortcut={Keyboard.Shortcut.Common.Save}
                  target={<SaveClipForm playId={play.id} onSaved={() => names.revalidate()} />}
                />
              )}
              {hasText(play) && (
                <Action.CopyToClipboard
                  title="Copy Text"
                  content={param(play, "text") ?? ""}
                  shortcut={Keyboard.Shortcut.Common.Copy}
                />
              )}
              <StopAction shortcut={STOP_ALL_SHORTCUT} />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={() => plays.revalidate()}
              />
            </ActionPanel>
          }
        />
      ))}
      {!plays.isLoading && <List.EmptyView icon={Icon.Clock} title="No plays yet" />}
    </List>
  );
}
