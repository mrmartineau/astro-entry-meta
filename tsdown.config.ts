import { defineConfig } from "tsdown";

export default defineConfig({
  // ESM only: Astro config files are ESM, so a CJS build would never be loaded
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  platform: "node",
  dts: true,
  sourcemap: true,
  clean: true,
  outExtensions: () => ({ js: ".mjs", dts: ".d.mts" }),
});
