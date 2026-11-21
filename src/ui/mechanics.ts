import { Mechanic } from "../shared/schema";

/**
 * Mechanics the engine has NOT implemented yet (SPEC 9: "Any mechanic not done by
 * the freeze makes its ability show 'not supported' in the UI").
 * PLACEHOLDER: the engine lane hasn't published a list yet. Add entries here, e.g.
 * ["aoe", "teleport"], and the select screen labels those abilities.
 */
export const UNSUPPORTED_MECHANICS: Mechanic[] = [];

export function isMechanicSupported(m: string): boolean {
  return (Mechanic.options as readonly string[]).includes(m) && !UNSUPPORTED_MECHANICS.includes(m as Mechanic);
}
