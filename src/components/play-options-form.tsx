import { Action, ActionPanel, Form, Icon, useNavigation } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import type { Speaker, Voice } from "@quak/js";
import { showError } from "../lib/errors";
import { formatSeconds } from "../lib/format";
import { quak } from "../lib/quak";
import { activeSlot } from "../lib/slots";
import { playWithFeedback, PlaySource, PlayOptions } from "../lib/play";

// The empty choice of a dropdown: send nothing, the workspace's default applies
const DEFAULT = "default";

// The speakers' field is "to", "to2" or "to3" (one remembered choice per workspace)
type Values = {
  [to: `to${string}`]: string[] | undefined;
  volume: string;
  voice?: string;
  effect: string;
  ambience: string;
};

const SPEAKER_ICONS: Record<Speaker["type"], Icon> = {
  WORKSPACE: Icon.House,
  LOCATION: Icon.House,
  PLAYER: Icon.Speaker,
  GROUP: Icon.TwoPeople,
};

// Voices grouped by language, in the order of the API
function byLanguage(voices: Voice[]) {
  const groups = new Map<string, Voice[]>();
  for (const voice of voices) {
    groups.set(voice.languageName, [...(groups.get(voice.languageName) ?? []), voice]);
  }
  return [...groups.entries()];
}

function parseVolume(raw: string): number | undefined | null {
  const value = raw.trim();
  if (!value) return undefined;
  const volume = Number(value);
  return Number.isInteger(volume) && volume >= 1 && volume <= 100 ? volume : null;
}

const TITLES: Record<PlaySource["kind"], string> = {
  text: "Play Text",
  talk: "Talk to Speakers",
  sound: "Play Sound",
  clip: "Play Clip",
};

function describeSource(source: PlaySource): { title: string; text: string } {
  switch (source.kind) {
    case "text":
      return { title: "Text", text: source.text };
    case "talk":
      return { title: "Recording", text: formatSeconds(source.seconds) };
    case "sound":
      return { title: "Sound", text: source.name };
    case "clip":
      return { title: "Clip", text: source.name };
  }
}

// Speakers, volume, voice (text only), voice effect and ambience; each field remembers its last value, the speakers
// per workspace. It plays in the workspace that was active when it opened.
export function PlayOptionsForm({ source }: { source: PlaySource }) {
  const [slot] = useState(activeSlot);
  const toField: `to${string}` = slot === 0 ? "to" : `to${slot + 1}`;
  const { pop } = useNavigation();
  const [volumeError, setVolumeError] = useState<string>();
  const isText = source.kind === "text";
  // Play Text and Talk to Speakers close Raycast like a plain Enter, sounds and clips go back to their list
  const closes = source.kind === "text" || source.kind === "talk";

  const speakers = useCachedPromise(async (slot: number) => (await quak(slot).speakers.list()).data, [slot], {
    onError: (error) => showError(error, "Could not load the speakers"),
  });
  const effects = useCachedPromise(async (slot: number) => (await quak(slot).effects.list()).data, [slot], {
    onError: (error) => showError(error, "Could not load the effects"),
  });
  const voices = useCachedPromise(async (slot: number) => (await quak(slot).voices.list()).data, [slot], {
    execute: isText,
    onError: (error) => showError(error, "Could not load the voices"),
  });

  async function submit(values: Values) {
    const volume = parseVolume(values.volume);
    if (volume === null) {
      setVolumeError("1 to 100, or empty");
      return;
    }
    const pick = (value: string | undefined) => (value && value !== DEFAULT ? value : undefined);
    const options: PlayOptions = {
      to: values[toField],
      volume,
      voice: pick(values.voice),
      effect: pick(values.effect),
      ambience: pick(values.ambience),
    };
    const played = await playWithFeedback(source, options, closes ? "hud" : "toast", slot);
    if (played && !closes) pop();
  }

  const title = TITLES[source.kind];
  const described = describeSource(source);
  const effectList = effects.data?.filter((effect) => effect.kind === "effect");
  const ambienceList = effects.data?.filter((effect) => effect.kind === "ambience");

  return (
    <Form
      navigationTitle="Play with Options"
      isLoading={speakers.isLoading || effects.isLoading || (isText && voices.isLoading)}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={title} icon={Icon.Play} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description title={described.title} text={described.text} />
      {/* rendered once the choices are there, so the stored values find their items */}
      {speakers.data && (
        <Form.TagPicker id={toField} title="Speakers" info="Empty: the workspace's default speakers" storeValue>
          {speakers.data.map((speaker) => (
            <Form.TagPicker.Item
              key={speaker.slug}
              value={speaker.slug}
              title={speaker.name}
              icon={SPEAKER_ICONS[speaker.type]}
            />
          ))}
        </Form.TagPicker>
      )}
      <Form.TextField
        id="volume"
        title="Volume"
        placeholder="Workspace default"
        info="1 to 100, empty: the workspace's default volume"
        error={volumeError}
        onChange={() => setVolumeError(undefined)}
        storeValue
      />
      {isText && voices.data && (
        <Form.Dropdown id="voice" title="Voice" filtering storeValue>
          <Form.Dropdown.Item value={DEFAULT} title="Workspace default" />
          {byLanguage(voices.data).map(([language, list]) => (
            <Form.Dropdown.Section key={language} title={language}>
              {list.map((voice) => (
                <Form.Dropdown.Item
                  key={voice.slug}
                  value={voice.slug}
                  title={`${voice.name} (${voice.locale}, ${voice.gender})`}
                  keywords={[voice.slug, voice.language, voice.languageName, voice.provider.toLowerCase()]}
                />
              ))}
            </Form.Dropdown.Section>
          ))}
        </Form.Dropdown>
      )}
      {effectList && (
        <Form.Dropdown id="effect" title="Voice Effect" storeValue>
          <Form.Dropdown.Item value={DEFAULT} title="Workspace default" />
          <Form.Dropdown.Item value="none" title="None" />
          {effectList.map((effect) => (
            <Form.Dropdown.Item key={effect.id} value={effect.id} title={effect.name} keywords={[effect.id]} />
          ))}
        </Form.Dropdown>
      )}
      {ambienceList && (
        <Form.Dropdown id="ambience" title="Ambience" storeValue>
          <Form.Dropdown.Item value={DEFAULT} title="Workspace default" />
          <Form.Dropdown.Item value="none" title="None" />
          {ambienceList.map((ambience) => (
            <Form.Dropdown.Item key={ambience.id} value={ambience.id} title={ambience.name} keywords={[ambience.id]} />
          ))}
        </Form.Dropdown>
      )}
      {(source.kind === "sound" || source.kind === "clip") && (
        <Form.Description text="With a voice effect or ambience, the workspace's intro and outro apply too." />
      )}
    </Form>
  );
}
