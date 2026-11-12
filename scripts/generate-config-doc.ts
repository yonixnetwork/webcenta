/** Writes docs/CONFIGURATION.md from the configuration inventory: npm run config:docs */
import { writeFileSync } from "node:fs";
import { configurationDoc } from "../src/server/settings/inventory-doc";

writeFileSync("docs/CONFIGURATION.md", configurationDoc());
console.log("docs/CONFIGURATION.md updated");
