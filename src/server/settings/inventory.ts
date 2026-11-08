import inventory from "./env-inventory.json";
import { CATEGORIES } from "./registry";

export interface EnvVariable {
  name: string;
  category: (typeof CATEGORIES)[number];
  purpose: string;
  required: "always" | "production" | "optional" | "never";
  secret: boolean;
  startup: boolean;
  dashboard: string | null;
  apply: "immediate" | "restart" | "redeploy";
}

/** Every environment variable the application reads (see env-inventory.json). */
export const ENV_VARIABLES = inventory.variables as EnvVariable[];

/** Inventory with presence only (never values), grouped by category. */
export function inventoryStatus(env: Record<string, string | undefined> = process.env) {
  return CATEGORIES.map((category) => ({
    category,
    variables: ENV_VARIABLES.filter((v) => v.category === category).map((v) => ({ ...v, set: Boolean(env[v.name]) })),
  })).filter((g) => g.variables.length);
}
