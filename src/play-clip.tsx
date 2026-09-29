import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { PlayOptionsForm } from "./components/play-options-form";
import { StopAction } from "./components/stop-action";
import { formatSeconds } from "./lib/format";
import { playWithFeedback } from "./lib/play";
import { quak } from "./lib/quak";

// The workspace's clips; the API has no search for them, so Raycast filters by name and slug
export default function Command() {
  const clips = useCachedPromise(async () => (await quak().clips.list()).data, []);

  return (
    <List isLoading={clips.isLoading} searchBarPlaceholder="Search clips">
      {clips.data?.map((clip) => {
        const source = { kind: "clip" as const, slug: clip.slug, name: clip.name };
        return (
          <List.Item
            key={clip.slug}
            icon={Icon.Waveform}
            title={clip.name}
            keywords={[clip.slug]}
            accessories={[{ text: formatSeconds(clip.length) }, { date: new Date(clip.createdAt), tooltip: "Created" }]}
            actions={
              <ActionPanel>
                <Action title="Play Clip" icon={Icon.Play} onAction={() => playWithFeedback(source, {}, "toast")} />
                <Action.Push title="Play with Options…" icon={Icon.Gear} target={<PlayOptionsForm source={source} />} />
                <StopAction />
                <Action.CopyToClipboard title="Copy Slug" content={clip.slug} />
              </ActionPanel>
            }
          />
        );
      })}
      {!clips.isLoading && (
        <List.EmptyView
          icon={Icon.Waveform}
          title="No clips found"
          description="Save a play as a clip from the History command."
        />
      )}
    </List>
  );
}
