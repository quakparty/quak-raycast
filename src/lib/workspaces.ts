import { unwrap } from "@quak/js";
import { quak } from "./quak";
import { configuredSlots } from "./slots";

// A configured key's workspace; slug is missing when the lookup failed
export type Workspace = { slot: number; name: string; slug?: string };

// The workspace of one key. The only place that asks; GET /v1/keys/current may replace it later.
export async function lookupWorkspace(slot: number): Promise<{ name: string; slug: string }> {
  const { data } = await unwrap(quak(slot).api.GET("/v1/workspace"));
  return { name: data.name, slug: data.slug };
}

// The fallback name of a slot whose lookup failed
export function slotName(slot: number) {
  return `Workspace ${slot + 1}`;
}

// The workspaces of all configured keys; a failed lookup keeps the slot with its fallback name
export async function listWorkspaces(
  slots = configuredSlots(),
): Promise<{ workspaces: Workspace[]; errors: unknown[] }> {
  const results = await Promise.allSettled(slots.map((slot) => lookupWorkspace(slot)));
  const errors: unknown[] = [];
  const workspaces = results.map((result, index): Workspace => {
    const slot = slots[index];
    if (result.status === "fulfilled") return { slot, ...result.value };
    errors.push(result.reason);
    return { slot, name: slotName(slot) };
  });
  return { workspaces, errors };
}
