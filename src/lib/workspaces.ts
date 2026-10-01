import { quak } from "./quak";
import { configuredSlots } from "./slots";

// A configured key's workspace; slug is missing when the lookup failed
export type Workspace = { slot: number; name: string; slug?: string };

// The workspace of one key (GET /v1/keys/current, works with any scope). The only place that asks.
export async function lookupWorkspace(slot: number): Promise<{ name: string; slug: string }> {
  const { data } = await quak(slot).keys.current();
  return { name: data.workspace.name, slug: data.workspace.slug };
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
