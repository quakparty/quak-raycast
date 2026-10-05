import { Action, ActionPanel, Color, Icon, Keyboard, LaunchProps, List, showToast, Toast } from "@raycast/api";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PlayOptionsForm } from "./components/play-options-form";
import { previewKey, PreviewAction } from "./components/preview-action";
import { StopAction } from "./components/stop-action";
import { ExtensionActions, useWorkspace } from "./components/switch-workspace-action";
import { useDefaults } from "./lib/defaults";
import { useLimits } from "./lib/limits";
import { playWithDefaults } from "./lib/play";
import { usePreview } from "./lib/preview";
import { useRecentTexts } from "./lib/recent-texts";
import { targetsLine, targetsTooltip, useTargets } from "./lib/targets";

// The counter shows from this share of the API's limit on
const COUNTER_FROM = 0.8;

type RowAction = "play" | "options" | "preview";

// A row's own action first (Enter); the second gets ⌘↵, so that is the options, or the harmless preview on the
// options row itself
const ORDER: Record<RowAction, RowAction[]> = {
  play: ["play", "options", "preview"],
  options: ["options", "preview", "play"],
  preview: ["preview", "options", "play"],
};

// The search bar is the text. The rows on top are the actions for it: Play (Enter), Play with Options… (⌘↵) and
// Preview (⌘Y). Below, the workspace's recent texts, filtered by what is typed; Enter says one again.
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
  const preview = usePreview();
  // where Enter plays it, next to Play
  const targets = useTargets(choice.slot, defaults);
  const recent = useRecentTexts(choice.slot);

  useEffect(() => {
    if (!initial || started.current) return;
    started.current = true;
    // on success the HUD closes Raycast, on an error the text stays for another try
    playWithDefaults({ kind: "text", text: initial }, "hud").finally(() => setIsPlaying(false));
  }, []);

  const trimmed = text.trim();
  const playTitle = defaults.data ? "Play with Your Defaults" : "Play";

  // on success the HUD goes back to root search; a text over the limit never goes out
  async function play(value: string) {
    if (value.length > maxCharacters) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Text too long",
        message: `${value.length}/${maxCharacters} characters`,
      });
      return;
    }
    setIsPlaying(true);
    await playWithDefaults({ kind: "text", text: value }, "hud", choice.slot);
    setIsPlaying(false);
  }

  // The same actions on every row, the row's own first, so ⌘↵, ⌘Y, ⌘. and ⌘⇧W work from any of them
  function actions(first: RowAction, value: string, extra?: ReactNode) {
    const source = { kind: "text" as const, text: value };
    const all: Record<RowAction, ReactNode> = {
      play: <Action key="play" title={playTitle} icon={Icon.Play} onAction={() => play(value)} />,
      options: (
        <Action.Push
          key="options"
          title="Play with Options…"
          icon={Icon.Gear}
          target={<PlayOptionsForm source={source} onDefaultsChange={defaults.revalidate} />}
        />
      ),
      preview: <PreviewAction key="preview" source={source} slot={choice.slot} running={preview} />,
    };
    return (
      <ActionPanel>
        <ActionPanel.Section>{ORDER[first].map((name) => all[name])}</ActionPanel.Section>
        {extra}
        <ActionPanel.Section>
          <StopAction />
        </ActionPanel.Section>
        <ExtensionActions choice={choice} />
      </ActionPanel>
    );
  }

  // hidden until the text gets close to the API's limit
  const tooLong = trimmed.length > maxCharacters;
  const counter =
    trimmed.length >= maxCharacters * COUNTER_FROM
      ? [
          {
            text: { value: `${trimmed.length}/${maxCharacters}`, color: tooLong ? Color.Red : Color.Orange },
            tooltip: tooLong ? "Too long to play" : "Close to the limit",
          },
        ]
      : [];
  const where = targets
    ? [
        {
          text: { value: targetsLine(targets), color: targets.source === "none" ? Color.Orange : undefined },
          tooltip: targetsTooltip(targets),
        },
      ]
    : [];

  // the action rows always use the typed text; only the recent texts are filtered by it
  const search = trimmed.toLowerCase();
  const recentTexts = (recent.data ?? []).filter((item) => !search || item.text.toLowerCase().includes(search));
  const previewing = Boolean(trimmed) && preview === previewKey({ kind: "text", text: trimmed });

  return (
    <List
      isLoading={isPlaying || (recent.isLoading && !recent.data)}
      filtering={false}
      searchText={text}
      onSearchTextChange={setText}
      searchBarPlaceholder={
        choice.multiple ? `Text for the speakers in ${choice.active.name}` : "Text for your speakers"
      }
    >
      {trimmed && (
        <List.Section>
          <List.Item
            icon={Icon.Play}
            title={playTitle}
            accessories={[...counter, ...where]}
            actions={actions("play", trimmed)}
          />
          <List.Item icon={Icon.Gear} title="Play with Options…" actions={actions("options", trimmed)} />
          <List.Item
            icon={previewing ? Icon.Stop : Icon.Headphones}
            title={previewing ? "Stop Preview" : "Preview"}
            subtitle="On this computer"
            actions={actions("preview", trimmed)}
          />
        </List.Section>
      )}
      {recentTexts.length > 0 && (
        <List.Section title="Recent">
          {recentTexts.map((item) => (
            <List.Item
              key={item.text}
              icon={Icon.SpeechBubble}
              title={item.text}
              accessories={[
                { date: new Date(item.createdAt), tooltip: new Date(item.createdAt).toLocaleString("en-US") },
              ]}
              actions={actions(
                "play",
                item.text,
                <ActionPanel.Section>
                  <Action.CopyToClipboard
                    title="Copy Text"
                    content={item.text}
                    shortcut={Keyboard.Shortcut.Common.Copy}
                  />
                </ActionPanel.Section>,
              )}
            />
          ))}
        </List.Section>
      )}
      {!trimmed && !recentTexts.length && (
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
