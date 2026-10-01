import { Action, ActionPanel, Icon, LaunchProps, List } from "@raycast/api";
import { showError } from "./lib/errors";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { PlayOptionsForm } from "./components/play-options-form";
import { CreateQuicklinkAction, useQuicklinkPlay } from "./components/quicklink-action";
import { StopAction } from "./components/stop-action";
import { ExtensionActions, useWorkspace } from "./components/switch-workspace-action";
import { formatSeconds } from "./lib/format";
import { playWithDefaults } from "./lib/play";
import { quak } from "./lib/quak";

const ALL_TAGS = "all";

// The sound library, searched by the API (name, description, search words), filtered by tag
export default function Command(props: LaunchProps) {
  const isPlaying = useQuicklinkPlay("sound", props);
  // sounds are the same in every workspace; the active one decides where they play
  const choice = useWorkspace();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState(ALL_TAGS);

  const tags = useCachedPromise(async () => (await quak().sounds.tags()).data, [], {
    // only the tag filter; the sound list itself reports a failure
    onError: () => undefined,
  });
  const sounds = useCachedPromise(
    async (q: string, tag: string) =>
      (await quak().sounds.list({ q: q.trim() || undefined, tags: tag === ALL_TAGS ? undefined : tag })).data,
    [search, tag],
    { keepPreviousData: true, onError: (error) => showError(error, "Could not load sounds") },
  );
  const tagNames = new Map(tags.data?.map((item) => [item.tag, item.name]));

  return (
    <List
      isLoading={sounds.isLoading || isPlaying}
      onSearchTextChange={setSearch}
      throttle
      searchBarPlaceholder={choice.multiple ? `Search sounds in ${choice.active.name}` : "Search sounds"}
      searchBarAccessory={
        <List.Dropdown tooltip="Tag" storeValue onChange={setTag}>
          <List.Dropdown.Item value={ALL_TAGS} title="All Sounds" />
          {tags.data?.map((item) => (
            <List.Dropdown.Item key={item.tag} value={item.tag} title={item.name} />
          ))}
        </List.Dropdown>
      }
    >
      {sounds.data?.map((sound) => {
        const source = { kind: "sound" as const, slug: sound.slug, name: sound.name };
        return (
          <List.Item
            key={sound.slug}
            icon={Icon.Music}
            title={sound.name}
            subtitle={sound.description ?? undefined}
            accessories={[
              ...sound.tags.map((value) => ({ tag: tagNames.get(value) ?? value })),
              { text: formatSeconds(sound.length) },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="Play Sound"
                  icon={Icon.Play}
                  onAction={() => playWithDefaults(source, "toast", choice.slot)}
                />
                <Action.Push title="Play with Options…" icon={Icon.Gear} target={<PlayOptionsForm source={source} />} />
                <CreateQuicklinkAction
                  kind="sound"
                  slug={sound.slug}
                  name={sound.name}
                  workspace={choice.multiple ? choice.active : undefined}
                />
                <StopAction />
                <Action.CopyToClipboard title="Copy Slug" content={sound.slug} />
                <ExtensionActions choice={choice} />
              </ActionPanel>
            }
          />
        );
      })}
      {!sounds.isLoading && (
        <List.EmptyView
          icon={Icon.Music}
          title="No sounds found"
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
