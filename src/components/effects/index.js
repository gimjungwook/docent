// Root: merges the v2 effect groups (text, screen, code, cast) into one table for the engine and the showcase.
// A group that is missing or fails to load is skipped, so the page keeps working while groups are built.
import { EFFECTS } from "./registry.js";

const GROUPS = { text: "./text.js", screen: "./screen.js", code: "./code.js", cast: "../cast/index.js" };

export async function loadEffects() {
  const table = {};
  const loaded = {};
  await Promise.all(Object.entries(GROUPS).map(async ([group, path]) => {
    try {
      const m = await import(path);
      for (const [name, impl] of Object.entries(m.effects || {})) {
        if (impl && typeof impl.run === "function") table[name] = impl;
      }
      loaded[group] = true;
    } catch (e) {
      loaded[group] = false;
    }
  }));
  return { table, loaded };
}

export { EFFECTS };
