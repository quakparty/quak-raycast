import { Action, ActionPanel, Color, Icon, LaunchProps, List } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { PlayOptionsForm } from "./components/play-options-form";
import { ExtensionActions, useWorkspace } from "./components/switch-workspace-action";
import { useDefaults } from "./lib/defaults";
import { useLimits } from "./lib/limits";
import { playWithDefaults } from "./lib/play";

// The search bar is the text: Enter says it with your defaults, ⌘↵ opens the options.
// With an argument from root search (or as fallback command) it says the text right away.
export default function Command(props: LaunchProps<{ arguments: Arguments.PlayText }>) {
  const initial = (props.arguments.text || props.fallbackText || "").trim();
  const [text, setText] = useState(initial);
  const [isPlaying, setIsPlaying] = useState(Boolean(initial));
  const started = useRef(false);
  const choice = useWorkspace();
  const maxCharacters = useLimits(choice.slot).textCharacters;
  // own defaults for texts: Enter's title says so
  const defaults = useDefaults("text", choice.slot);

  useEffect(() => {
    if (!initial || started.current) return;
    started.current = true;
    // on success the HUD closes Raycast, on an error the text stays for another try
    playWithDefaults({ kind: "text", text: initial }, "hud").finally(() => setIsPlaying(false));
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
                title={defaults.data ? "Play Text with Your Defaults" : "Play Text"}
                icon={Icon.Play}
                onAction={async () => {
                  setIsPlaying(true);
                  await playWithDefaults({ kind: "text", text: trimmed }, "hud", choice.slot);
                  setIsPlaying(false);
                }}
              />
              <Action.Push
                title="Play with Options…"
                icon={Icon.Gear}
                target={
                  <PlayOptionsForm source={{ kind: "text", text: trimmed }} onDefaultsChange={defaults.revalidate} />
                }
              />
              <ExtensionActions choice={choice} />
            </ActionPanel>
          }
        />
      ) : (
        <List.EmptyView
          icon={Icon.SpeechBubble}
          title="Type what to say"
          description={`Type in the search bar: Enter plays it${defaults.data ? " with your defaults" : ""}, ⌘↵ opens the options. Or press Enter to write it in the form.`}
          actions={
            <ActionPanel>
              <Action.Push
                title="Play with Options…"
                icon={Icon.Gear}
                target={<PlayOptionsForm source={{ kind: "text", text: "" }} onDefaultsChange={defaults.revalidate} />}
              />
              <ExtensionActions choice={choice} />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
