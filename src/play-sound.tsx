import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { PlayOptionsForm } from "./components/play-options-form";
import { StopAction } from "./components/stop-action";
import { formatSeconds } from "./lib/format";
import { playWithFeedback } from "./lib/play";
import { quak } from "./lib/quak";

const ALL_TAGS = "all";

// The sound library, searched by the API (name, description, search words), filtered by tag
export default function Command() {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState(ALL_TAGS);

  const tags = useCachedPromise(async () => (await quak().sounds.tags()).data, []);
  const sounds = useCachedPromise(
    async (q: string, tag: string) =>
      (await quak().sounds.list({ q: q.trim() || undefined, tags: tag === ALL_TAGS ? undefined : tag })).data,
    [search, tag],
    { keepPreviousData: true },
  );
  const tagNames = new Map(tags.data?.map((item) => [item.tag, item.name]));

  return (
    <List
      isLoading={sounds.isLoading}
      onSearchTextChange={setSearch}
      throttle
      searchBarPlaceholder="Search sounds"
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
                <Action title="Play Sound" icon={Icon.Play} onAction={() => playWithFeedback(source, {}, "toast")} />
                <Action.Push title="Play with Options…" icon={Icon.Gear} target={<PlayOptionsForm source={source} />} />
                <StopAction />
                <Action.CopyToClipboard title="Copy Slug" content={sound.slug} />
              </ActionPanel>
            }
          />
        );
      })}
      {!sounds.isLoading && <List.EmptyView icon={Icon.Music} title="No sounds found" />}
    </List>
  );
}
