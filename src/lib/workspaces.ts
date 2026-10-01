import { Cache } from "@raycast/api";
import { createHash } from "crypto";
import { quak } from "./quak";
import { configuredSlots, keyField } from "./slots";

// A configured key's workspace; slug is missing when the lookup failed
export type Workspace = { slot: number; name: string; slug?: string };

// The last lookup per slot, tied to a hash of its key (never the key), so a changed key asks again
const cache = new Cache({ namespace: "workspace" });
type Cached = { key: string; name: string; slug: string };

function keyHash(slot: number) {
  return createHash("sha256").update(keyField(slot)).digest("hex").slice(0, 16);
}

// The cached workspace of a slot, read synchronously; undefined before the first lookup or after a key change
export function cachedWorkspace(slot: number): { name: string; slug: string } | undefined {
  try {
    const cached = JSON.parse(cache.get(`name:${slot}`) ?? "null") as Cached | null;
    return cached && cached.key === keyHash(slot) ? { name: cached.name, slug: cached.slug } : undefined;
  } catch {
    return undefined;
  }
}

// The workspace of one key (GET /v1/keys/current, works with any scope). The only place that asks.
export async function lookupWorkspace(slot: number): Promise<{ name: string; slug: string }> {
  const { data } = await quak(slot).keys.current();
  const workspace = { name: data.workspace.name, slug: data.workspace.slug };
  cache.set(`name:${slot}`, JSON.stringify({ key: keyHash(slot), ...workspace } satisfies Cached));
  return workspace;
}

// The fallback name of a slot whose lookup failed
export function slotName(slot: number) {
  return `Workspace ${slot + 1}`;
}

// The name of a slot's workspace: cached, else looked up, else the fallback name
export async function workspaceName(slot: number) {
  const cached = cachedWorkspace(slot);
  if (cached) return cached.name;
  try {
    return (await lookupWorkspace(slot)).name;
  } catch {
    return slotName(slot);
  }
}

// " · Name" for feedback with more than one key, empty with a single key
export async function workspaceSuffix(slot: number) {
  return configuredSlots().length > 1 ? ` · ${await workspaceName(slot)}` : "";
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
