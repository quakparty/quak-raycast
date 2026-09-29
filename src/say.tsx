import { Action, ActionPanel, Color, Icon, LaunchProps, List } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { PlayOptionsForm } from "./components/play-options-form";
import { playWithFeedback } from "./lib/play";

// The API's limit for a text play
const MAX_CHARACTERS = 1000;

// The search bar is the text: Enter says it with the workspace's defaults, ⌘↵ opens the options.
// With an argument from root search (or as fallback command) it says the text right away.
export default function Command(props: LaunchProps<{ arguments: Arguments.Say }>) {
  const initial = (props.arguments.text || props.fallbackText || "").trim();
  const [text, setText] = useState(initial);
  const [isPlaying, setIsPlaying] = useState(Boolean(initial));
  const started = useRef(false);

  useEffect(() => {
    if (!initial || started.current) return;
    started.current = true;
    // on success the HUD closes Raycast, on an error the text stays for another try
    playWithFeedback({ kind: "text", text: initial }, {}, "hud").finally(() => setIsPlaying(false));
  }, []);

  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX_CHARACTERS;

  return (
    <List
      isLoading={isPlaying}
      searchText={text}
      onSearchTextChange={setText}
      searchBarPlaceholder="What should your speakers say?"
    >
      {trimmed ? (
        <List.Item
          icon={Icon.SpeechBubble}
          title={trimmed}
          accessories={[
            { text: { value: `${trimmed.length}/${MAX_CHARACTERS}`, color: tooLong ? Color.Red : undefined } },
          ]}
          actions={
            <ActionPanel>
              <Action
                title="Say"
                icon={Icon.Play}
                onAction={async () => {
                  setIsPlaying(true);
                  await playWithFeedback({ kind: "text", text: trimmed }, {}, "hud");
                  setIsPlaying(false);
                }}
              />
              <Action.Push
                title="Play with Options…"
                icon={Icon.Gear}
                target={<PlayOptionsForm source={{ kind: "text", text: trimmed }} />}
              />
            </ActionPanel>
          }
        />
      ) : (
        <List.EmptyView
          icon={Icon.SpeechBubble}
          title="Type what to say"
          description="Enter says it with your workspace's defaults. Play with Options… is in the actions."
        />
      )}
    </List>
  );
}
