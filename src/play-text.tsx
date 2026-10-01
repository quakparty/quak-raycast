import { Action, ActionPanel, Color, Icon, LaunchProps, List } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { PlayOptionsForm } from "./components/play-options-form";
import { ExtensionActions, useWorkspace } from "./components/switch-workspace-action";
import { useLimits } from "./lib/limits";
import { playWithFeedback } from "./lib/play";

// The search bar is the text: Enter says it with the workspace's defaults, ⌘↵ opens the options.
// With an argument from root search (or as fallback command) it says the text right away.
export default function Command(props: LaunchProps<{ arguments: Arguments.PlayText }>) {
  const initial = (props.arguments.text || props.fallbackText || "").trim();
  const [text, setText] = useState(initial);
  const [isPlaying, setIsPlaying] = useState(Boolean(initial));
  const started = useRef(false);
  const choice = useWorkspace();
  const maxCharacters = useLimits(choice.slot).textCharacters;

  useEffect(() => {
    if (!initial || started.current) return;
    started.current = true;
    // on success the HUD closes Raycast, on an error the text stays for another try
    playWithFeedback({ kind: "text", text: initial }, {}, "hud").finally(() => setIsPlaying(false));
  }, []);

  const trimmed = text.trim();
  const tooLong = trimmed.length > maxCharacters;

  return (
    <List
      isLoading={isPlaying}
      searchText={text}
      onSearchTextChange={setText}
      searchBarPlaceholder={
        choice.multiple ? `Text for the speakers in ${choice.active.name}` : "Text for your speakers"
      }
    >
      {trimmed ? (
        <List.Item
          icon={Icon.SpeechBubble}
          title={trimmed}
          accessories={[
            { text: { value: `${trimmed.length}/${maxCharacters}`, color: tooLong ? Color.Red : undefined } },
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Play Text"
                icon={Icon.Play}
                onAction={async () => {
                  setIsPlaying(true);
                  await playWithFeedback({ kind: "text", text: trimmed }, {}, "hud", choice.slot);
                  setIsPlaying(false);
                }}
              />
              <Action.Push
                title="Play with Options…"
                icon={Icon.Gear}
                target={<PlayOptionsForm source={{ kind: "text", text: trimmed }} />}
              />
              <ExtensionActions choice={choice} />
            </ActionPanel>
          }
        />
      ) : (
        <List.EmptyView
          icon={Icon.SpeechBubble}
          title="Type what to say"
          description="Type in the search bar: Enter plays it, ⌘↵ opens the options. Or press Enter to write it in the form."
          actions={
            <ActionPanel>
              <Action.Push
                title="Play with Options…"
                icon={Icon.Gear}
                target={<PlayOptionsForm source={{ kind: "text", text: "" }} />}
              />
              <ExtensionActions choice={choice} />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
