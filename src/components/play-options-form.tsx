import { Action, ActionPanel, Form, Icon, Keyboard, showToast, Toast, useNavigation } from "@raycast/api";
import { useCachedPromise, usePromise } from "@raycast/utils";
import { useState } from "react";
import type { EffectsResponse, Speaker, Voice } from "@quak/js";
import { loadDefaults, resetDefaults, saveDefaults } from "../lib/defaults";
import { showError } from "../lib/errors";
import { formatSeconds } from "../lib/format";
import { quak } from "../lib/quak";
import { activeSlot, configuredSlots } from "../lib/slots";
import { cachedWorkspace, slotName } from "../lib/workspaces";
import { playWithFeedback, PlaySource, PlayOptions } from "../lib/play";
import { startPreview, togglePreview, usePreview } from "../lib/preview";
import { PREVIEW_SHORTCUT } from "./preview-action";

// The empty choice of a dropdown: send nothing, the workspace's default applies
const DEFAULT = "default";

// The speakers' field is "to", "to2" or "to3" (one remembered choice per workspace)
type Values = {
  [to: `to${string}`]: string[] | undefined;
  text?: string;
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

// The form previews one thing at a time, whatever its fields say now
const PREVIEW_KEY = "form";

const TITLES: Record<PlaySource["kind"], string> = {
  text: "Play Text",
  talk: "Talk to Speakers",
  sound: "Play Sound",
  clip: "Play Clip",
};

// What the own defaults are for, in the form's line and the toasts
const KIND_NAMES: Record<PlaySource["kind"], string> = {
  text: "texts",
  talk: "talk",
  sound: "sounds",
  clip: "clips",
};

// " in Name" with more than one key
function workspaceIn(slot: number) {
  return configuredSlots().length > 1 ? ` in ${cachedWorkspace(slot)?.name ?? slotName(slot)}` : "";
}

// "Wohnzimmer, volume 20, effect Robot" with the names the form loaded (slugs until then)
function describeDefaults(
  options: PlayOptions,
  speakers: Speaker[] | undefined,
  voices: Voice[] | undefined,
  effects: EffectsResponse["data"] | undefined,
) {
  const name = (list: { slug?: string; id?: string; name: string }[] | undefined, value: string) =>
    list?.find((item) => (item.slug ?? item.id) === value)?.name ?? value;
  const parts: string[] = [];
  if (options.to?.length) parts.push(options.to.map((slug) => name(speakers, slug)).join(", "));
  if (options.volume !== undefined) parts.push(`volume ${options.volume}`);
  if (options.voice) parts.push(`voice ${name(voices, options.voice)}`);
  if (options.effect) parts.push(options.effect === "none" ? "no effect" : `effect ${name(effects, options.effect)}`);
  if (options.ambience) {
    parts.push(options.ambience === "none" ? "no ambience" : `ambience ${name(effects, options.ambience)}`);
  }
  return parts.join(", ");
}

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

// Speakers, volume, voice (text only), voice effect and ambience. It plays in the workspace that was active when it
// opened. With own defaults for this type and workspace the fields start from them, else each field remembers its last
// value (the speakers per workspace). onDefaultsChange: the opening list refreshes its hint.
export function PlayOptionsForm({ source, onDefaultsChange }: { source: PlaySource; onDefaultsChange?: () => void }) {
  const [slot] = useState(activeSlot);
  const kind = source.kind;
  const toField: `to${string}` = slot === 0 ? "to" : `to${slot + 1}`;
  const { pop } = useNavigation();
  const [volumeError, setVolumeError] = useState<string>();
  const [textError, setTextError] = useState<string>();
  const isText = source.kind === "text";
  // Play Text and Talk to Speakers close Raycast like a plain Enter, sounds and clips go back to their list
  const closes = source.kind === "text" || source.kind === "talk";
  // talk is sent once, a preview would send the recording twice
  const canPreview = source.kind !== "talk";
  const preview = usePreview();
  const isPreviewing = preview === PREVIEW_KEY;

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

  // The own defaults: what the fields start from (fixed once loaded, empty after a reset) and what is saved now.
  // Without a saved set the fields remember their last values instead (storeValue), so the two never mix.
  const [saved, setSaved] = useState<PlayOptions>();
  const [preset, setPreset] = useState<PlayOptions>();
  const [remember, setRemember] = useState(true);
  // bumped on a reset: the fields mount again and start from the workspace's defaults
  const [generation, setGeneration] = useState(0);
  const initial = usePromise(loadDefaults, [kind, slot], {
    onData: (data) => {
      setSaved(data);
      setPreset(data);
      setRemember(!data);
    },
  });

  // The form's options, or null after showing a field's error; the text only when playing
  function read(values: Values, playing: boolean): { options: PlayOptions; text: string } | null {
    // a text play edits its text here too (also the way to write one when the search bar was empty)
    const text = isText ? (values.text ?? "").trim() : "";
    if (playing && isText && !text) {
      setTextError("Type what to say");
      return null;
    }
    const volume = parseVolume(values.volume);
    if (volume === null) {
      setVolumeError("1 to 100, or empty");
      return null;
    }
    const pick = (value: string | undefined) => (value && value !== DEFAULT ? value : undefined);
    const options: PlayOptions = {
      to: values[toField],
      volume,
      voice: pick(values.voice),
      effect: pick(values.effect),
      ambience: pick(values.ambience),
    };
    return { options, text };
  }

  async function store(options: PlayOptions) {
    const kept = await saveDefaults(kind, slot, options);
    setSaved(kept ? options : undefined);
    onDefaultsChange?.();
    return kept;
  }

  // Plays exactly what the form shows: a field on "Workspace default" sends nothing, even with own defaults
  async function play(values: Values, save = false) {
    const input = read(values, true);
    if (!input) return;
    if (save) await store(input.options);
    const played = await playWithFeedback(
      isText ? { kind: "text", text: input.text } : source,
      input.options,
      closes ? "hud" : "toast",
      slot,
    );
    if (played && !closes) pop();
  }

  // Previews exactly what the form shows, without saving; again stops it
  function previewForm(values: Values) {
    return togglePreview(PREVIEW_KEY, async () => {
      const input = read(values, true);
      if (!input) return;
      await startPreview(PREVIEW_KEY, isText ? { kind: "text", text: input.text } : source, input.options, slot);
    });
  }

  async function saveOnly(values: Values) {
    const input = read(values, false);
    if (!input) return;
    const kept = await store(input.options);
    await showToast({
      style: Toast.Style.Success,
      title: kept ? "Saved as your defaults" : "Using the workspace's defaults",
      message: `For ${KIND_NAMES[kind]}${workspaceIn(slot)}`,
    });
  }

  async function reset() {
    await resetDefaults(kind, slot);
    setSaved(undefined);
    setPreset(undefined);
    setGeneration((value) => value + 1);
    onDefaultsChange?.();
    await showToast({
      style: Toast.Style.Success,
      title: "Reset to workspace defaults",
      message: `For ${KIND_NAMES[kind]}${workspaceIn(slot)}`,
    });
  }

  const title = TITLES[source.kind];
  const described = describeSource(source);
  const effectList = effects.data?.filter((effect) => effect.kind === "effect");
  const ambienceList = effects.data?.filter((effect) => effect.kind === "ambience");
  // the fields render once the own defaults are known, so they start from the right values
  const ready = !initial.isLoading;
  // a field's start: the own default, or nothing (storeValue brings the last value, or the workspace's default)
  const start = (value: string | undefined) => (remember ? undefined : (value ?? DEFAULT));
  // "Robot (your default)" in the dropdowns
  const mine = (value: string | undefined, name: string) => (value && saved && value === name ? " (your default)" : "");
  const savedSpeakers = saved?.to?.length
    ? describeDefaults({ to: saved.to }, speakers.data, undefined, undefined)
    : "";

  return (
    <Form
      navigationTitle="Play with Options"
      isLoading={initial.isLoading || speakers.isLoading || effects.isLoading || (isText && voices.isLoading)}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={title} icon={Icon.Play} onSubmit={(values: Values) => play(values)} />
          <Action.SubmitForm
            title="Play and Save as Your Defaults"
            icon={Icon.SaveDocument}
            onSubmit={(values: Values) => play(values, true)}
          />
          <Action.SubmitForm
            title="Save as Your Defaults"
            icon={Icon.Bookmark}
            shortcut={Keyboard.Shortcut.Common.Save}
            onSubmit={saveOnly}
          />
          {canPreview && (
            <Action.SubmitForm
              title={isPreviewing ? "Stop Preview" : "Preview"}
              icon={isPreviewing ? Icon.Stop : Icon.Headphones}
              shortcut={PREVIEW_SHORTCUT}
              onSubmit={previewForm}
            />
          )}
          {saved && (
            <Action
              title="Reset to Workspace Defaults"
              icon={Icon.ArrowCounterClockwise}
              style={Action.Style.Destructive}
              onAction={reset}
            />
          )}
        </ActionPanel>
      }
    >
      {/* the fields show the values; the header only says where they come from */}
      <Form.Description
        title="Your Defaults"
        text={saved ? "Saved for this command. Reset in ⌘K." : "None yet. ⌘S saves these options."}
      />
      {source.kind === "text" ? (
        <Form.TextArea
          id="text"
          title="Text"
          placeholder="What should your speakers say?"
          defaultValue={source.text}
          error={textError}
          onChange={() => setTextError(undefined)}
          autoFocus={!source.text}
        />
      ) : (
        <Form.Description title={described.title} text={described.text} />
      )}
      {/* rendered once the choices are there, so the stored values find their items */}
      {ready && speakers.data && (
        <Form.TagPicker
          key={`to-${generation}`}
          id={toField}
          title="Speakers"
          info={`${savedSpeakers ? `Your default: ${savedSpeakers}. ` : ""}Empty: the workspace's default speakers`}
          defaultValue={remember ? undefined : (preset?.to ?? [])}
          storeValue={remember}
        >
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
      {ready && (
        <Form.TextField
          key={`volume-${generation}`}
          id="volume"
          title="Volume"
          placeholder="Workspace default"
          info={`${saved?.volume !== undefined ? `Your default: ${saved.volume}. ` : ""}1 to 100, empty: the workspace's default volume`}
          defaultValue={remember ? undefined : preset?.volume !== undefined ? String(preset.volume) : ""}
          error={volumeError}
          onChange={() => setVolumeError(undefined)}
          storeValue={remember}
        />
      )}
      {ready && isText && voices.data && (
        <Form.Dropdown
          key={`voice-${generation}`}
          id="voice"
          title="Voice"
          filtering
          defaultValue={start(preset?.voice)}
          storeValue={remember}
        >
          <Form.Dropdown.Item value={DEFAULT} title="Workspace default" />
          {byLanguage(voices.data).map(([language, list]) => (
            <Form.Dropdown.Section key={language} title={language}>
              {list.map((voice) => (
                <Form.Dropdown.Item
                  key={voice.slug}
                  value={voice.slug}
                  title={`${voice.name} (${voice.locale}, ${voice.gender})${mine(saved?.voice, voice.slug)}`}
                  keywords={[voice.slug, voice.language, voice.languageName, voice.provider.toLowerCase()]}
                />
              ))}
            </Form.Dropdown.Section>
          ))}
        </Form.Dropdown>
      )}
      {ready && effectList && (
        <Form.Dropdown
          key={`effect-${generation}`}
          id="effect"
          title="Voice Effect"
          defaultValue={start(preset?.effect)}
          storeValue={remember}
        >
          <Form.Dropdown.Item value={DEFAULT} title="Workspace default" />
          <Form.Dropdown.Item value="none" title={`None${mine(saved?.effect, "none")}`} />
          {effectList.map((effect) => (
            <Form.Dropdown.Item
              key={effect.id}
              value={effect.id}
              title={`${effect.name}${mine(saved?.effect, effect.id)}`}
              keywords={[effect.id]}
            />
          ))}
        </Form.Dropdown>
      )}
      {ready && ambienceList && (
        <Form.Dropdown
          key={`ambience-${generation}`}
          id="ambience"
          title="Ambience"
          defaultValue={start(preset?.ambience)}
          storeValue={remember}
        >
          <Form.Dropdown.Item value={DEFAULT} title="Workspace default" />
          <Form.Dropdown.Item value="none" title={`None${mine(saved?.ambience, "none")}`} />
          {ambienceList.map((ambience) => (
            <Form.Dropdown.Item
              key={ambience.id}
              value={ambience.id}
              title={`${ambience.name}${mine(saved?.ambience, ambience.id)}`}
              keywords={[ambience.id]}
            />
          ))}
        </Form.Dropdown>
      )}
    </Form>
  );
}
