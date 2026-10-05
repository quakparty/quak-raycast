import { List } from "@raycast/api";
import type { ReactNode } from "react";
import { targetsLine, type Targets } from "../lib/targets";

// The list's results under one heading that says where Enter plays them ("Plays on Wohnzimmer, Küche +2"); no heading
// until the speakers are known. Without default speakers it says so and how to pick some.
export function TargetsSection({ targets, children }: { targets?: Targets; children: ReactNode }) {
  const subtitle =
    targets?.source === "yours"
      ? "Your defaults"
      : targets?.source === "none"
        ? "Pick speakers with Play with Options"
        : undefined;
  return (
    <List.Section title={targets && targetsLine(targets)} subtitle={subtitle}>
      {children}
    </List.Section>
  );
}
