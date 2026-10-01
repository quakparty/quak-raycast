import { Action, ActionPanel, Icon, LaunchProps, List } from "@raycast/api";
import { showError } from "./lib/errors";
import { useCachedPromise } from "@raycast/utils";
import { PlayOptionsForm } from "./components/play-options-form";
import { PreviewAction } from "./components/preview-action";
import { CreateQuicklinkAction, useQuicklinkPlay } from "./components/quicklink-action";
import { StopAction } from "./components/stop-action";
import { ExtensionActions, useWorkspace } from "./components/switch-workspace-action";
import { useDefaults } from "./lib/defaults";
import { formatSeconds } from "./lib/format";
import { playWithDefaults } from "./lib/play";
import { usePreview } from "./lib/preview";
import { quak } from "./lib/quak";

// The workspace's clips; the API has no search for them, so Raycast filters by name and slug
export default function Command(props: LaunchProps) {
  const isPlaying = useQuicklinkPlay("clip", props);
  const choice = useWorkspace();
  // own defaults for clips in this workspace: Enter's title says so
  const defaults = useDefaults("clip", choice.slot);
  const preview = usePreview();
  const clips = useCachedPromise(async (slot: number) => (await quak(slot).clips.list()).data, [choice.slot], {
    onError: (error) => showError(error, "Could not load clips"),
  });

  return (
    <List
      isLoading={clips.isLoading || isPlaying}
      searchBarPlaceholder={choice.multiple ? `Search clips in ${choice.active.name}` : "Search clips"}
    >
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
                <Action
                  title={defaults.data ? "Play Clip with Your Defaults" : "Play Clip"}
                  icon={Icon.Play}
                  onAction={() => playWithDefaults(source, "toast", choice.slot)}
                />
                <Action.Push
                  title="Play with Options…"
                  icon={Icon.Gear}
                  target={<PlayOptionsForm source={source} onDefaultsChange={defaults.revalidate} />}
                />
                <PreviewAction source={source} slot={choice.slot} running={preview} />
                <CreateQuicklinkAction
                  kind="clip"
                  slug={clip.slug}
                  name={clip.name}
                  workspace={choice.multiple ? choice.active : undefined}
                />
                <StopAction />
                <Action.CopyToClipboard title="Copy Clip Slug" content={clip.slug} />
                <ExtensionActions choice={choice} />
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
          actions={
            <ActionPanel>
              <ExtensionActions choice={choice} />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
