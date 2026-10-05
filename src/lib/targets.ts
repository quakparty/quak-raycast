import { useCachedPromise } from "@raycast/utils";
import { useWorkspaceDetails } from "./limits";
import type { PlayOptions } from "./play";
import { quak } from "./quak";

// Where Enter plays: your defaults' speakers, else the workspace's default speakers ("all" when that is all of them),
// "none" when the workspace has none (the API would refuse the play)
export type Targets = { names: string[]; source: "yours" | "workspace" | "all" | "none" };

// All speakers with names, also locations, which can stand in defaults but are left out of the plain list
function fetchSpeakerNames(slot: number) {
  return quak(slot)
    .speakers.list({ type: "ALL" })
    .then(({ data }) => data.map((speaker) => ({ slug: speaker.slug, name: speaker.name })));
}

// The speakers Enter plays on in a slot's workspace, by name (slugs until the names are there). defaults: the
// command's own defaults (useDefaults), so saving or resetting them in the form shows up here. Undefined until both
// are known; cached, so only the very first run waits.
export function useTargets(slot: number, defaults: { data?: PlayOptions; isLoading: boolean }): Targets | undefined {
  const workspace = useWorkspaceDetails(slot);
  const speakers = useCachedPromise(fetchSpeakerNames, [slot], {
    // only names; the slugs stay
    onError: () => undefined,
  });

  if (defaults.isLoading) return undefined;
  const own = defaults.data?.to;
  const slugs = own?.length ? own : workspace.data?.defaults.speakers;
  if (!slugs) return undefined;
  const names = slugs.map(
    (slug) => speakers.data?.find((speaker) => speaker.slug === slug)?.name ?? (slug === "all" ? "All speakers" : slug),
  );
  if (own?.length) return { names, source: "yours" };
  if (!slugs.length) return { names, source: "none" };
  return { names, source: slugs.length === 1 && slugs[0] === "all" ? "all" : "workspace" };
}

// "Wohnzimmer, Küche +2": the first names and how many more
export function shortNames(names: string[], max = 2) {
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} +${names.length - max}` : shown;
}

// The one line every command shows before Enter: "Plays on Wohnzimmer, Küche +2", or that there is nowhere to play
export function targetsLine(targets: Targets) {
  return targets.source === "none" ? "No default speakers set" : `Plays on ${shortNames(targets.names)}`;
}

// The full list for a tooltip: "Plays on Wohnzimmer, Küche, Bad (your defaults)"
export function targetsTooltip(targets: Targets) {
  if (targets.source === "none") return "The workspace has no default speakers: pick speakers in the options";
  return `Plays on ${targets.names.join(", ")}${targets.source === "yours" ? " (your defaults)" : ""}`;
}
