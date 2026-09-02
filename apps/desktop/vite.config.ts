import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const host = process.env.TAURI_DEV_HOST;
const require = createRequire(import.meta.url);

// Workaround for an npm workspace hoisting quirk: @powersync/shared-internals
// and @powersync/tauri-plugin are hoisted to the workspace root and import
// '@powersync/common' as a bare specifier from there, but plain Node/esbuild
// resolution walks up from the *importing file's* location, so it can miss
// wherever npm actually hoisted @powersync/common for this workspace -
// confirmed via `vite build`/`vite dev`, both of which fail with "Could not
// resolve '@powersync/common'" from node_modules/@powersync/shared-internals/
// lib/client/*.js without this alias. Resolved dynamically (not a hardcoded
// path) since which node_modules directory actually holds it depends on
// npm's hoisting decision for the whole workspace, which shifts whenever any
// workspace's dependencies change - a previous hardcoded guess broke exactly
// this way.
function resolvePackageDir(pkgName: string): string {
  let dir = path.dirname(require.resolve(pkgName));
  while (!(fs.existsSync(path.join(dir, "package.json")) && JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name === pkgName)) {
    dir = path.dirname(dir);
  }
  return dir;
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      "@powersync/common": resolvePackageDir("@powersync/common"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
